package com.yallanrouh.navigation

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.FragmentActivity
import com.google.android.libraries.navigation.NavigationApi
import com.google.android.libraries.navigation.Navigator
import com.google.android.libraries.navigation.SupportNavigationFragment
import com.google.android.libraries.navigation.Waypoint
import com.google.android.gms.maps.GoogleMap.CameraPerspective

class DriverNavigationActivity : FragmentActivity() {
  private var navigator: Navigator? = null
  private var unavailable = false
  private lateinit var status: TextView
  private lateinit var map: FrameLayout
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { showUnavailable() }
  private val arabic get() = intent.getBooleanExtra("arabic", true)
  private fun text(ar: String, en: String) = if (arabic) ar else en

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      fitsSystemWindows = true
      layoutDirection = if (arabic) View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR
      setBackgroundColor(0xffffffff.toInt())
    }
    val back = Button(this).apply {
      text = this@DriverNavigationActivity.text("العودة إلى الرحلة", "Back to the ride")
      setOnClickListener { finish() }
    }
    status = TextView(this).apply {
      setPadding(24, 16, 24, 16)
      setTextColor(0xff202529.toInt())
      text = this@DriverNavigationActivity.text("جارٍ تجهيز ملاحة Google…", "Preparing Google navigation…")
    }
    map = FrameLayout(this).apply { id = 0x5a110 }
    root.addView(back)
    root.addView(status)
    root.addView(map, LinearLayout.LayoutParams(-1, 0, 1f))
    setContentView(root)

    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      status.text = this@DriverNavigationActivity.text("فعّل الموقع الدقيق من أذونات يلا نروح ثم أعد فتح الملاحة.", "Enable precise location for Yalla Nrouh and reopen navigation.")
      return
    }
    val latitude = intent.getDoubleExtra("latitude", Double.NaN)
    val longitude = intent.getDoubleExtra("longitude", Double.NaN)
    if (!latitude.isFinite() || !longitude.isFinite() ||
      latitude !in -90.0..90.0 || longitude !in -180.0..180.0) {
      showUnavailable()
      return
    }

    val fragment = supportFragmentManager.findFragmentById(map.id) as? SupportNavigationFragment
      ?: SupportNavigationFragment().also {
        supportFragmentManager.beginTransaction().replace(map.id, it).commitNow()
      }

    // getNavigator presents Google's own first-use terms when needed.
    NavigationApi.getNavigator(this, object : NavigationApi.NavigatorListener {
      override fun onNavigatorReady(ready: Navigator) {
        if (isFinishing || isDestroyed || unavailable) return
        navigator = ready
        handler.postDelayed(timeout, 25000)
        try {
          val destination = Waypoint.builder()
            .setLatLng(latitude, longitude)
            .setTitle(intent.getStringExtra("label").orEmpty())
            .build()
          ready.setAudioGuidance(Navigator.AudioGuidance.SILENT)
          ready.setDestination(destination).setOnResultListener { result ->
            if (isFinishing || isDestroyed || unavailable) return@setOnResultListener
            handler.removeCallbacks(timeout)
            if (result != Navigator.RouteStatus.OK) {
              showUnavailable()
              return@setOnResultListener
            }
            fragment.getMapAsync { googleMap ->
              if (!isFinishing && !isDestroyed) googleMap.followMyLocation(CameraPerspective.TILTED)
            }
            ready.startGuidance()
            status.visibility = View.GONE
          }
        } catch (_: Exception) {
          showUnavailable()
        }
      }

      override fun onError(errorCode: Int) {
        if (!isFinishing && !isDestroyed) showUnavailable()
      }
    })
  }

  private fun showUnavailable() {
    unavailable = true
    handler.removeCallbacks(timeout)
    map.visibility = View.GONE
    status.visibility = View.VISIBLE
    status.text = this@DriverNavigationActivity.text(
      "تعذّر تشغيل ملاحة Google داخل التطبيق. ارجع إلى الرحلة لفتح خرائط Google.",
      "Google navigation could not start here. Go back to the ride to open Google Maps."
    )
  }

  override fun onDestroy() {
    handler.removeCallbacks(timeout)
    navigator?.let {
      it.stopGuidance()
      it.clearDestinations()
    }
    super.onDestroy()
  }
}
