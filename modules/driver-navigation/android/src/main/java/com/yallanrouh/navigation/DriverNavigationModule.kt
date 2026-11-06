package com.yallanrouh.navigation

import android.media.AudioAttributes
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
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

  override fun definition() = ModuleDefinition {
    Name("YallaDriverNavigation")

    AsyncFunction("setScreenAwake") { active: Boolean ->
      val window = appContext.currentActivity?.window ?: return@AsyncFunction
      if (active) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("speakDirection") { text: String, language: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null || text.isBlank() || text.length > 240 || language !in listOf("ar", "en")) {
        promise.resolve(false)
      } else {
        val prompt = Prompt(text, language, promise)
        if (initialized) {
          play(prompt)
        } else {
          pending?.result?.resolve(false)
          pending = prompt
          if (speech == null) {
            try {
              speech = TextToSpeech(context.applicationContext) { result ->
                main.post {
                  val next = pending
                  pending = null
                  initialized = result == TextToSpeech.SUCCESS && speech != null
                  if (initialized) {
                    speech?.setAudioAttributes(AudioAttributes.Builder()
                      .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                    next?.let(::play)
                  } else {
                    speech?.shutdown()
                    speech = null
                    next?.result?.resolve(false)
                  }
                }
              }
            } catch (_: Exception) {
              pending = null
              prompt.result.resolve(false)
            }
          }
        }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopDirection") { stopSpeech() }.runOnQueue(Queues.MAIN)

    OnDestroy {
      main.post {
        stopSpeech()
        speech?.shutdown()
        speech = null
        initialized = false
      }
    }
  }

  private fun play(prompt: Prompt) {
    val engine = speech
    if (engine == null) {
      prompt.result.resolve(false)
      return
    }
    try {
      val locale = Locale.forLanguageTag(prompt.language)
      if (engine.setLanguage(locale) < TextToSpeech.LANG_AVAILABLE) {
        prompt.result.resolve(false)
        return
      }
      val voice = engine.voices.orEmpty()
        .filter {
          it.locale.language == prompt.language && !it.isNetworkConnectionRequired &&
            TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED !in it.features
        }
        .maxByOrNull { it.quality }
      if (voice == null || engine.setVoice(voice) != TextToSpeech.SUCCESS) {
        prompt.result.resolve(false)
        return
      }
      prompt.result.resolve(engine.speak(prompt.text, TextToSpeech.QUEUE_FLUSH, null, UUID.randomUUID().toString()) == TextToSpeech.SUCCESS)
    } catch (_: Exception) {
      prompt.result.resolve(false)
    }
  }

  private fun stopSpeech() {
    pending?.result?.resolve(false)
    pending = null
    speech?.stop()
  }
}
