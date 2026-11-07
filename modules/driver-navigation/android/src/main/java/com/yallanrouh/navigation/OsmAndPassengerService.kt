package com.yallanrouh.navigation

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.widget.Toast
import androidx.core.app.NotificationCompat
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.concurrent.Executors
import net.osmand.aidlapi.IOsmAndAidlInterface
import org.json.JSONArray
import org.json.JSONObject

class OsmAndPassengerService : Service() {
  internal data class Session(val rideId: String, val token: String, val target: String, val arabic: Boolean)
  private sealed interface Snapshot {
    data class Waiting(val point: OsmAndPassengerLayer.Point?) : Snapshot
    data object Finished : Snapshot
    data object Retry : Snapshot
  }

  companion object {
    // Keep the authenticated read capability in memory. Never persist it or give it to OsmAnd.
    internal var pending: Session? = null
    private const val CHANNEL = "osmand-passenger-display"
    private const val NOTIFICATION = 4311
    private const val STOP = "com.yallanrouh.navigation.STOP_OSMAND_PASSENGER"
    private const val POLL_MS = 12_000L
  }

  private val main = Handler(Looper.getMainLooper())
  private val network = Executors.newSingleThreadExecutor()
  private var session: Session? = null
  private var layer: OsmAndPassengerLayer? = null
  private var connection: ServiceConnection? = null
  private var api: IOsmAndAidlInterface? = null
  private var point: OsmAndPassengerLayer.Point? = null
  private var expires = 0L
  private var failures = 0
  private var polling = false
  private val bindingTimeout = Runnable { if (api == null) stopSelf() }
  private val poll = Runnable { readPosition() }
  private val redraw = object : Runnable {
    override fun run() {
      if (session == null) return
      if (SystemClock.elapsedRealtime() >= expires) {
        stopSelf()
        return
      }
      draw()
      main.postDelayed(this, 5000)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP) {
      pending = null
      stopSelf()
      return START_NOT_STICKY
    }
    val next = pending
    pending = null
    if (next == null) {
      if (session == null) stopSelf()
      return START_NOT_STICKY
    }
    releaseLayer()
    session = next
    layer = OsmAndPassengerLayer(this, next.target, next.arabic)
    expires = SystemClock.elapsedRealtime() + 60 * 60_000L
    try {
      if (Build.VERSION.SDK_INT >= 29) {
        startForeground(NOTIFICATION, notification(next.arabic), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(NOTIFICATION, notification(next.arabic))
      }
      val listener = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
          if (session !== next) return
          main.removeCallbacks(bindingTimeout)
          val connected = IOsmAndAidlInterface.Stub.asInterface(binder)
          api = connected
          if (runCatching { layer?.prepare(connected) }.getOrNull() != true) {
            unavailable(next)
            return
          }
          draw()
          if (!polling) {
            polling = true
            main.post(poll)
          }
        }
        override fun onServiceDisconnected(name: ComponentName) {
          if (session !== next) return
          api = null
          main.postDelayed(bindingTimeout, 15_000)
        }
        override fun onBindingDied(name: ComponentName) {
          if (session === next) stopSelf()
        }
        override fun onNullBinding(name: ComponentName) {
          if (session === next) stopSelf()
        }
      }
      val service = Intent("net.osmand.aidl.OsmandAidlServiceV2").setPackage(next.target)
      if (bindService(service, listener, Context.BIND_AUTO_CREATE)) {
        connection = listener
        main.postDelayed(bindingTimeout, 15_000)
        main.post(redraw)
      } else stopSelf()
    } catch (_: Exception) {
      stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun notification(ar: Boolean): android.app.Notification {
    val title = if (ar) "موقع الزبون في OsmAnd" else "Customer location in OsmAnd"
    if (Build.VERSION.SDK_INT >= 26) {
      getSystemService(NotificationManager::class.java)
        .createNotificationChannel(NotificationChannel(CHANNEL, title, NotificationManager.IMPORTANCE_LOW))
    }
    val stop = PendingIntent.getService(this, NOTIFICATION, Intent(this, javaClass).setAction(STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle(title).setContentText(if (ar) "تحديث العلامة إلى أن يركب الزبون" else "Updating the marker until pickup is confirmed")
      .setOngoing(true).setOnlyAlertOnce(true)
      .addAction(0, if (ar) "إيقاف عرض الموقع" else "Stop showing location", stop).build()
  }

  private fun readPosition() {
    val request = session ?: return
    if (api == null) {
      main.postDelayed(poll, POLL_MS)
      return
    }
    network.execute {
      val result = load(request)
      main.post {
        if (session !== request) return@post
        when (result) {
          Snapshot.Finished -> {
            layer?.clear(api)
            stopSelf()
            return@post
          }
          is Snapshot.Waiting -> {
            failures = 0
            point = result.point
            draw()
          }
          Snapshot.Retry -> failures = (failures + 1).coerceAtMost(2)
        }
        main.postDelayed(poll, POLL_MS shl failures)
      }
    }
  }

  private fun load(request: Session): Snapshot {
    var http: HttpURLConnection? = null
    return try {
      val select = "id,ride_passenger_positions(latitude,longitude,measured_at)"
      val filters = "id=eq.${request.rideId}&status=in.(accepted,arrived)&pickup_confirmed_at=is.null&limit=1"
      http = URL("${RideSharingService.ROOT}/rest/v1/rides?select=$select&$filters").openConnection() as HttpURLConnection
      http.instanceFollowRedirects = false
      http.connectTimeout = 5000
      http.readTimeout = 5000
      http.setRequestProperty("apikey", RideSharingService.PUBLIC_KEY)
      http.setRequestProperty("Authorization", "Bearer ${request.token}")
      when (http.responseCode) {
        200 -> {
          val rides = JSONArray(http.inputStream.bufferedReader().use { it.readText() })
          val ride = rides.optJSONObject(0) ?: return Snapshot.Finished
          val row = when (val embedded = ride.opt("ride_passenger_positions")) {
            is JSONObject -> embedded
            is JSONArray -> embedded.optJSONObject(0)
            else -> null
          }
          Snapshot.Waiting(row?.let {
            val lat = it.optDouble("latitude")
            val lon = it.optDouble("longitude")
            val measured = Instant.parse(it.getString("measured_at")).toEpochMilli()
            if (lat in -90.0..90.0 && lon in -180.0..180.0 && measured <= System.currentTimeMillis() + 30_000L)
              OsmAndPassengerLayer.Point(lat, lon, measured)
            else null
          })
        }
        400, 401, 403, 404 -> Snapshot.Finished
        else -> Snapshot.Retry
      }
    } catch (_: Exception) {
      Snapshot.Retry
    } finally {
      http?.disconnect()
    }
  }

  private fun draw() {
    val connected = api ?: return
    val current = session ?: return
    val result = runCatching { layer?.render(connected, point, System.currentTimeMillis()) }
    if (result.getOrNull() == false) unavailable(current)
  }

  private fun unavailable(current: Session) {
    val hint = if (current.arabic) "عرض علامة الزبون غير متاح في OsmAnd. الملاحة مستمرة."
      else "The customer marker is unavailable in OsmAnd. Navigation will continue."
    Toast.makeText(this, hint, Toast.LENGTH_LONG).show()
    stopSelf()
  }

  private fun releaseLayer() {
    session = null
    point = null
    failures = 0
    polling = false
    main.removeCallbacks(bindingTimeout)
    main.removeCallbacks(poll)
    main.removeCallbacks(redraw)
    runCatching { layer?.close(api) }
    layer = null
    api = null
    connection?.let { runCatching { unbindService(it) } }
    connection = null
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf(startId)
  }

  override fun onDestroy() {
    releaseLayer()
    network.shutdownNow()
    super.onDestroy()
  }
}
