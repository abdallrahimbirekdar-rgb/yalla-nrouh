package com.yallanrouh.navigation

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import expo.modules.kotlin.Promise
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import org.json.JSONObject

class RideSharingService : Service() {
  data class Session(val ride: String, val secret: String, val arabic: Boolean, var started: Promise?)
  companion object {
    var pending: Session? = null
    var currentRide: String? = null
      private set
    var lastFix: Location? = null
      private set
    var publish: ((Map<String, Any?>) -> Unit)? = null
    private const val CHANNEL = "ride-location-sharing"
    private const val STOP = "com.yallanrouh.navigation.STOP_SHARING"
    private const val ID = 4310
    internal const val ROOT = "https://gokosprcqpdvqgahvquk.supabase.co"
    internal const val PUBLIC_KEY = "sb_publishable_0l-T6t_dTDt1OedSTIpLNA_uruCvJ8C"
  }

  private val main = Handler(Looper.getMainLooper())
  private val network = Executors.newSingleThreadExecutor()
  private val provider by lazy { LocationServices.getFusedLocationProviderClient(this) }
  private var session: Session? = null
  private var sent: Location? = null
  private var lastContact = 0L
  private var failures = 0
  private val tick = Runnable { upload() }
  private val startupTimeout = Runnable { stopSelf() }
  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      if (session == null) return
      val fix = result.lastLocation ?: return
      if (!fix.hasAccuracy() || fix.accuracy > 250 || !fresh(fix, 5000)) return
      lastFix = fix
      publish?.invoke(mapOf("rideId" to currentRide, "active" to true, "latitude" to fix.latitude,
        "longitude" to fix.longitude, "accuracy" to fix.accuracy.toDouble(), "time" to fix.time.toDouble()))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    val request = pending ?: return START_NOT_STICKY
    pending = null
    if (session != null) {
      request.started?.resolve(false)
      return START_NOT_STICKY
    }
    session = request
    try {
      val banner = notification(request.arabic)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(ID, banner, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
      } else {
        startForeground(ID, banner)
      }
      currentRide = request.ride
      lastContact = SystemClock.elapsedRealtime()
      val config = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000)
        .setMinUpdateIntervalMillis(1000).setMinUpdateDistanceMeters(0f).setMaxUpdateAgeMillis(5000).build()
      main.postDelayed(startupTimeout, 8000)
      provider.requestLocationUpdates(config, callback, Looper.getMainLooper()).addOnSuccessListener {
        if (session === request) {
          main.removeCallbacks(startupTimeout)
          request.started?.resolve(true)
          request.started = null
          main.post(tick)
        }
      }.addOnFailureListener {
        stopSelf()
      }
    } catch (_: Exception) {
      stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun notification(ar: Boolean): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    val title = if (ar) "يلّا نروح · مشاركة الموقع" else "Yalla Nrouh · Location sharing"
    if (Build.VERSION.SDK_INT >= 26) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL, title, NotificationManager.IMPORTANCE_LOW))
    }
    val stop = PendingIntent.getService(this, ID, Intent(this, RideSharingService::class.java).setAction(STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, ID, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    return NotificationCompat.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle(title).setContentText(if (ar) "تتم مشاركة موقعك مع الطرف الآخر في الرحلة" else "Your location is shared with the other ride participant")
      .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
      .addAction(0, if (ar) "إيقاف المشاركة" else "Stop sharing", stop).build()
  }

  private fun fresh(fix: Location, ms: Long): Boolean =
    (SystemClock.elapsedRealtimeNanos() - fix.elapsedRealtimeNanos) / 1000000 in 0..ms

  private fun upload() {
    val request = session ?: return
    val now = SystemClock.elapsedRealtime()
    if (now - lastContact >= 165000) { stopSelf(); return }
    val point = lastFix?.takeIf { it.accuracy <= 50 && fresh(it, 15000) && it.time > (sent?.time ?: 0L) }
    val moving = point != null && ((point.hasSpeed() && point.speed >= 1.2f) ||
      (sent?.let { point.distanceTo(it) >= 12f } == true))
    network.execute {
      val response = update(request.secret, point, false)
      main.post {
        if (session !== request) return@post
        if (response == false) { stopSelf(); return@post }
        if (response == true) {
          lastContact = SystemClock.elapsedRealtime()
          if (point != null) sent = point
          failures = 0
        } else failures++
        val interval = if (response == null) (4000L shl failures.coerceAtMost(3)) else if (moving || sent == null) 4000L else 12000L
        main.postDelayed(tick, interval)
      }
    }
  }

  private fun update(secret: String, fix: Location?, stop: Boolean): Boolean? {
    var connection: HttpURLConnection? = null
    return try {
      connection = URL("$ROOT/rest/v1/rpc/live_update").openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 5000
      connection.readTimeout = 5000
      connection.setRequestProperty("apikey", PUBLIC_KEY)
      connection.setRequestProperty("Content-Type", "application/json")
      val payload = JSONObject().put("p_secret", secret).put("p_stop", stop)
        .put("p_lat", fix?.latitude ?: JSONObject.NULL).put("p_lng", fix?.longitude ?: JSONObject.NULL)
        .put("p_time", fix?.let { SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(it.time)) } ?: JSONObject.NULL)
      connection.doOutput = true
      connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
      if (connection.responseCode == 200) {
        when (connection.inputStream.bufferedReader().use { it.readText().trim() }) {
          "true" -> true
          "false" -> false
          else -> null
        }
      } else null
    } catch (_: Exception) { null } finally { connection?.disconnect() }
  }

  override fun onDestroy() {
    val request = session
    session = null
    main.removeCallbacks(tick)
    main.removeCallbacks(startupTimeout)
    request?.started?.resolve(false)
    if (request != null) request.started = null
    provider.removeLocationUpdates(callback)
    currentRide = null
    lastFix = null
    if (request != null) {
      publish?.invoke(mapOf("rideId" to request.ride, "active" to false))
      network.execute { update(request.secret, null, true) }
    }
    network.shutdown()
    super.onDestroy()
  }
}
