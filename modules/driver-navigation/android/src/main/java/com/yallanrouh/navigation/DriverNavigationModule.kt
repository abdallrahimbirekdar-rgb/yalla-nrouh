package com.yallanrouh.navigation

import android.content.Intent
import android.view.WindowManager
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DriverNavigationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("YallaDriverNavigation")

    AsyncFunction("setScreenAwake") { active: Boolean ->
      val window = appContext.currentActivity?.window ?: return@AsyncFunction
      if (active) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("open") { latitude: Double, longitude: Double, label: String, arabic: Boolean ->
      val activity = appContext.currentActivity
      if (activity == null || !latitude.isFinite() || !longitude.isFinite() ||
        latitude !in -90.0..90.0 || longitude !in -180.0..180.0) {
        false
      } else {
        activity.startActivity(Intent(activity, DriverNavigationActivity::class.java).apply {
          putExtra("latitude", latitude)
          putExtra("longitude", longitude)
          putExtra("label", label.take(160))
          putExtra("arabic", arabic)
        })
        true
      }
    }.runOnQueue(Queues.MAIN)
  }
}
