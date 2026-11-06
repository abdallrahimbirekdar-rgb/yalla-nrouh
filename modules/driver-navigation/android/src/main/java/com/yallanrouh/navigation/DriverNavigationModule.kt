package com.yallanrouh.navigation

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
  }
}
