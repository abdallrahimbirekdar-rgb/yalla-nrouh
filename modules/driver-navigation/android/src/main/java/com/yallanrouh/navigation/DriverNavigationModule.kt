package com.yallanrouh.navigation

import android.content.Intent
import android.net.Uri
import androidx.core.content.ContextCompat
import android.media.AudioAttributes
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.WindowManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale
import java.util.UUID

class DriverNavigationModule : Module() {
  private data class Prompt(val text: String, val language: String, val result: Promise)
  private val main = Handler(Looper.getMainLooper())
  private var speech: TextToSpeech? = null
  private var initialized = false
  private var pending: Prompt? = null
  private var playing: Pair<String, Promise>? = null

  override fun definition() = ModuleDefinition {
    Name("YallaDriverNavigation")

    Events("rideSharing")
    OnCreate {
      RideSharingService.publish = { runCatching { sendEvent("rideSharing", it) } }
    }

    AsyncFunction("startRideSharing") { ride: String, secret: String, arabic: Boolean, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null || RideSharingService.currentRide != null || RideSharingService.pending != null) {
        promise.resolve(false)
      } else {
        try {
          UUID.fromString(ride)
          UUID.fromString(secret)
          RideSharingService.pending = RideSharingService.Session(ride, secret, arabic, promise)
          ContextCompat.startForegroundService(activity, Intent(activity, RideSharingService::class.java))
        } catch (_: Exception) {
          RideSharingService.pending = null
          promise.resolve(false)
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopRideSharing") { ride: String ->
      val pending = RideSharingService.pending
      if (pending?.ride == ride) {
        RideSharingService.pending = null
        pending.started?.resolve(false)
      }
      if (RideSharingService.currentRide == ride || pending?.ride == ride) {
        appContext.reactContext?.stopService(Intent(appContext.reactContext, RideSharingService::class.java))
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("rideSharingStatus") { RideSharingService.currentRide }.runOnQueue(Queues.MAIN)

    AsyncFunction("openRideMaps") { latitude: Double, longitude: Double, adjacent: Boolean, provider: String ->
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      if (latitude !in -90.0..90.0 || longitude !in -180.0..180.0) return@AsyncFunction false
      val point = "$latitude,$longitude"
      val intent = when (provider) {
        "google" -> Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$point&mode=d")).setPackage("com.google.android.apps.maps")
        "yandex" -> Intent(Intent.ACTION_VIEW,
          Uri.parse("yandexnavi://build_route_on_map?lat_to=$latitude&lon_to=$longitude")).setPackage("ru.yandex.yandexnavi")
        else -> return@AsyncFunction false
      }
      if (adjacent) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_LAUNCH_ADJACENT)
      try {
        activity.startActivity(intent)
        true
      } catch (_: Exception) {
        if (provider == "yandex") return@AsyncFunction false
        try {
          activity.startActivity(Intent(Intent.ACTION_VIEW,
            Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$point&travelmode=driving&dir_action=navigate")))
          true
        } catch (_: Exception) { false }
      }
    }.runOnQueue(Queues.MAIN)


    AsyncFunction("setScreenAwake") { active: Boolean ->
      val window = appContext.currentActivity?.window ?: return@AsyncFunction
      if (active) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("speakDirection") { text: String, language: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null || text.isBlank() || text.length > 240 || language !in listOf("ar", "en")) {
        promise.resolve("playback")
      } else {
        val prompt = Prompt(text, language, promise)
        if (initialized) {
          play(prompt)
        } else {
          pending?.result?.resolve("playback")
          pending = prompt
          if (speech == null) {
            try {
              speech = TextToSpeech(context.applicationContext) { result ->
                main.post {
                  val next = pending
                  pending = null
                  val engine = speech
                  initialized = result == TextToSpeech.SUCCESS && engine != null && configure(engine)
                  if (initialized) {
                    next?.let(::play)
                  } else {
                    engine?.shutdown()
                    speech = null
                    next?.result?.resolve("playback")
                  }
                }
              }
            } catch (_: Exception) {
              pending = null
              prompt.result.resolve("playback")
            }
          }
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopDirection") { stopSpeech() }.runOnQueue(Queues.MAIN)

    AsyncFunction("openVoiceSetup") {
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      try {
        activity.startActivity(Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA))
        true
      } catch (_: Exception) {
        false
      }
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      RideSharingService.publish = null
      main.post {
        stopSpeech()
        speech?.shutdown()
        speech = null
        initialized = false
      }
    }
  }

  private fun configure(engine: TextToSpeech): Boolean {
    return try {
      engine.setAudioAttributes(AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
      engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String) = finish(utteranceId, "started")
        override fun onDone(utteranceId: String) = Unit
        @Deprecated("Android TTS engines can still call this legacy callback")
        override fun onError(utteranceId: String) = finish(utteranceId, "playback")
        override fun onError(utteranceId: String, errorCode: Int) = finish(utteranceId,
          if (errorCode == TextToSpeech.ERROR_NOT_INSTALLED_YET) "voice-unavailable" else "playback")
        override fun onStop(utteranceId: String, interrupted: Boolean) = finish(utteranceId, "playback")
      }) == TextToSpeech.SUCCESS
    } catch (_: Exception) {
      false
    }
  }

  private fun finish(id: String, result: String) {
    main.post {
      val request = playing
      if (request?.first == id) {
        playing = null
        request.second.resolve(result)
      }
    }
  }

  private fun play(prompt: Prompt) {
    val engine = speech
    if (engine == null) {
      prompt.result.resolve("playback")
      return
    }
    val id = UUID.randomUUID().toString()
    try {
      val voices = engine.voices.orEmpty().filter { it.locale.language == prompt.language }
      val installed = voices.filter { TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED !in it.features }
        .sortedWith(compareBy({ it.isNetworkConnectionRequired }, { -it.quality }))
      val hasVoice = installed.any { engine.setVoice(it) == TextToSpeech.SUCCESS } ||
        (voices.isEmpty() && engine.setLanguage(Locale.forLanguageTag(prompt.language)) >= TextToSpeech.LANG_AVAILABLE)
      if (!hasVoice) {
        prompt.result.resolve("voice-unavailable")
        return
      }
      playing?.second?.resolve("playback")
      playing = id to prompt.result
      if (engine.speak(prompt.text, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) {
        finish(id, "playback")
      }
    } catch (_: Exception) {
      if (playing?.first == id) finish(id, "playback")
      else prompt.result.resolve("playback")
    }
  }

  private fun stopSpeech() {
    pending?.result?.resolve("playback")
    pending = null
    playing?.second?.resolve("playback")
    playing = null
    speech?.stop()
  }
}
