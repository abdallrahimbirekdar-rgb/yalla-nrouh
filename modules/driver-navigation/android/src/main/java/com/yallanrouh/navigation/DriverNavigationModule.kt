package com.yallanrouh.navigation

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.ContextCompat
import android.media.AudioAttributes
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.WindowManager
import android.widget.Toast
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale
import java.util.UUID

class DriverNavigationModule : Module() {
  private data class Prompt(val text: String, val language: String, val result: Promise)
  private data class OsmAndRequest(
    val target: String, val navigation: Intent? = null, val ride: String? = null,
    val token: String? = null, val arabic: Boolean = false
  )
  private var osmAndRequest: OsmAndRequest? = null
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

    AsyncFunction("stopOsmAndPassenger") {
      appContext.reactContext?.let(::stopPassenger)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("requestOsmAndMapAccess") {
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      val target = OSMAND_PACKAGES.firstOrNull {
        activity.packageManager.getLaunchIntentForPackage(it) != null
      } ?: return@AsyncFunction false
      requestOsmAndConsent(activity, OsmAndRequest(target))
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { activity, result ->
      val request = osmAndRequest
      if (result.requestCode == OSMAND_PERMISSION && request != null) {
        val allowed = result.resultCode == Activity.RESULT_OK &&
          result.data?.getStringArrayExtra("granted_groups")?.contains("map") == true
        osmAndPreferences(activity).edit().putBoolean(request.target, allowed).apply()
        // Android can deliver the result before onResume. Let the activity resume
        // before starting the foreground service and opening navigation.
        main.post {
          if (osmAndRequest !== request) return@post
          osmAndRequest = null
          val navigation = request.navigation ?: return@post
          if (activity.isFinishing || activity.isDestroyed) return@post
          if (!launchOsmAnd(activity, navigation, request, allowed)) {
            val text = if (request.arabic) "تعذّر فتح OsmAnd. أعد المحاولة." else "Could not open OsmAnd. Try again."
            Toast.makeText(activity, text, Toast.LENGTH_LONG).show()
          }
        }
      }
    }

    AsyncFunction("openRideMaps") { latitude: Double, longitude: Double, adjacent: Boolean, provider: String,
      ride: String?, accessToken: String?, arabic: Boolean ->
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      if (latitude !in -90.0..90.0 || longitude !in -180.0..180.0) return@AsyncFunction false
      val point = "$latitude,$longitude"
      val intent = when (provider) {
        "google" -> Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$point&mode=d")).setPackage("com.google.android.apps.maps")
        "yandex" -> Intent(Intent.ACTION_VIEW,
          Uri.parse("yandexnavi://build_route_on_map?lat_to=$latitude&lon_to=$longitude")).setPackage("ru.yandex.yandexnavi")
        "osmand" -> Intent(Intent.ACTION_VIEW, Uri.parse("osmand.api://navigate").buildUpon()
          .appendQueryParameter("dest_lat", latitude.toString())
          .appendQueryParameter("dest_lon", longitude.toString())
          .appendQueryParameter("profile", "car")
          .appendQueryParameter("force", "true")
          .appendQueryParameter("location_permission", "true")
          .build())
        else -> return@AsyncFunction false
      }
      if (adjacent) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_LAUNCH_ADJACENT)
      if (provider == "osmand") {
        if (osmAndRequest != null) return@AsyncFunction true
        for (target in OSMAND_PACKAGES) {
          val targetIntent = Intent(intent).setPackage(target)
          if (targetIntent.resolveActivity(activity.packageManager) == null) continue
          val request = OsmAndRequest(target, targetIntent, ride, accessToken, arabic)
          val tracking = ride != null && accessToken != null
          val preferences = osmAndPreferences(activity)
          val permissionIntent = osmAndPermissionIntent(target)
          val supportsConsent = permissionIntent.resolveActivity(activity.packageManager) != null
          if (tracking && supportsConsent && !preferences.contains(target) &&
            requestOsmAndConsent(activity, request)) return@AsyncFunction true
          // Older OsmAnd versions may already allow this app. The service
          // checks access before it reads any passenger positions.
          val showMarker = tracking && (!supportsConsent || preferences.getBoolean(target, false))
          if (launchOsmAnd(activity, targetIntent, request, showMarker)) return@AsyncFunction true
        }
        return@AsyncFunction false
      }
      stopPassenger(activity)
      try {
        activity.startActivity(intent)
        true
      } catch (_: Exception) {
        if (provider != "google") return@AsyncFunction false
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

  private fun osmAndPreferences(context: Context) =
    context.getSharedPreferences("osmand-map-consent", Context.MODE_PRIVATE)

  private fun osmAndPermissionIntent(target: String) =
    Intent("net.osmand.aidl.REQUEST_PERMISSIONS").setPackage(target).putExtra("groups", arrayOf("map"))

  private fun requestOsmAndConsent(activity: Activity, request: OsmAndRequest): Boolean {
    if (osmAndRequest != null) return false
    osmAndRequest = request
    return try {
      @Suppress("DEPRECATION")
      activity.startActivityForResult(osmAndPermissionIntent(request.target), OSMAND_PERMISSION)
      true
    } catch (_: Exception) {
      osmAndRequest = null
      false
    }
  }

  private fun launchOsmAnd(activity: Activity, intent: Intent, request: OsmAndRequest, showMarker: Boolean): Boolean {
    if (showMarker) startPassenger(activity, request.ride, request.token, request.target, request.arabic)
    else stopPassenger(activity)
    return try {
      activity.startActivity(intent)
      true
    } catch (_: Exception) {
      stopPassenger(activity)
      false
    }
  }

  private fun startPassenger(activity: Activity, ride: String?, token: String?, target: String, arabic: Boolean) {
    if (ride == null || token == null || Build.VERSION.SDK_INT < 26) {
      stopPassenger(activity)
      return
    }
    try {
      UUID.fromString(ride)
      OsmAndPassengerService.pending = OsmAndPassengerService.Session(ride, token, target, arabic)
      ContextCompat.startForegroundService(activity, Intent(activity, OsmAndPassengerService::class.java))
    } catch (_: Exception) {
      stopPassenger(activity)
    }
  }

  private fun stopPassenger(context: Context) {
    osmAndRequest = null
    OsmAndPassengerService.pending = null
    context.stopService(Intent(context, OsmAndPassengerService::class.java))
  }

  companion object {
    private const val OSMAND_PERMISSION = 4312
    private val OSMAND_PACKAGES = listOf("net.osmand", "net.osmand.plus")
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
