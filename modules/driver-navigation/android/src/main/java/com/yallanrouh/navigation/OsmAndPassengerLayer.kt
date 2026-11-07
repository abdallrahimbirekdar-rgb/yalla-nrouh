package com.yallanrouh.navigation

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import net.osmand.aidlapi.IOsmAndAidlInterface
import net.osmand.aidlapi.map.ALatLon
import net.osmand.aidlapi.maplayer.AMapLayer
import net.osmand.aidlapi.maplayer.AddMapLayerParams
import net.osmand.aidlapi.maplayer.RemoveMapLayerParams
import net.osmand.aidlapi.maplayer.point.AMapPoint
import net.osmand.aidlapi.maplayer.point.UpdateMapPointParams

class OsmAndIconProvider : FileProvider()

internal class OsmAndPassengerLayer(
  private val context: Context,
  private val target: String,
  private val arabic: Boolean
) {
  data class Point(val latitude: Double, val longitude: Double, val measuredAt: Long)

  private data class Marker(val point: Point, val stale: Boolean)

  private val title = if (arabic) "موقع الزبون" else "Customer location"
  private val staleTitle = if (arabic) "آخر موقع للزبون" else "Last known customer location"
  private var shown: Marker? = null
  private val icons = mutableMapOf<Boolean, Uri>()

  fun prepare(api: IOsmAndAidlInterface): Boolean {
    clear(api)
    return addLayer(api, emptyList())
  }

  fun render(api: IOsmAndAidlInterface, point: Point?, now: Long): Boolean {
    val age = point?.let { (now - it.measuredAt).coerceAtLeast(0L) }
    val marker = if (point != null && age != null && age < 180_000L) Marker(point, age >= 30_000L) else null
    if (marker == null) {
      if (shown != null) clear(api)
      return true
    }
    if (shown == marker) return true
    val label = if (marker.stale) staleTitle else title
    val color = if (marker.stale) 0xff68727d.toInt() else 0xff15803d.toInt()
    val icon = icons.getOrPut(marker.stale) { createIcon(marker.stale, color) }
    val params = mapOf(AMapPoint.POINT_IMAGE_URI_PARAM to icon.toString())
    val mapPoint = AMapPoint(POINT_ID, if (arabic) "ز" else "P", label, "", LAYER_ID, color,
      ALatLon(marker.point.latitude, marker.point.longitude), emptyList(), params)
    val updated = shown != null && api.updateMapPoint(UpdateMapPointParams(LAYER_ID, mapPoint, false))
    if (!updated) {
      // Recreate after a process reconnect or if OsmAnd removed the old layer.
      api.removeMapLayer(RemoveMapLayerParams(LAYER_ID))
      if (!addLayer(api, listOf(mapPoint))) {
        shown = null
        return false
      }
    }
    shown = marker
    api.refreshMap()
    return true
  }

  private fun addLayer(api: IOsmAndAidlInterface, points: List<AMapPoint>): Boolean {
    val layer = AMapLayer(LAYER_ID, title, 5.5f, points).apply {
      setImagePoints(true)
      setCirclePointZoomBounds(0, 5)
      setSmallPointZoomBounds(6, 12)
      setBigPointZoomBounds(13, 24)
    }
    return api.addMapLayer(AddMapLayerParams(layer))
  }

  fun clear(api: IOsmAndAidlInterface?) {
    shown = null
    if (api == null) return
    runCatching {
      if (api.removeMapLayer(RemoveMapLayerParams(LAYER_ID))) api.refreshMap()
    }
  }

  fun close(api: IOsmAndAidlInterface?) {
    clear(api)
    icons.values.forEach { context.revokeUriPermission(target, it, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
    icons.clear()
  }

  private fun createIcon(stale: Boolean, color: Int): Uri {
    val directory = File(context.cacheDir, "osmand-passenger-icons").apply { mkdirs() }
    val file = File(directory, if (stale) "stale.png" else "live.png")
    val bitmap = Bitmap.createBitmap(80, 80, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = color
    canvas.drawCircle(40f, 40f, 40f, paint)
    paint.color = Color.WHITE
    canvas.drawCircle(40f, 28f, 11f, paint)
    canvas.drawRoundRect(20f, 43f, 60f, 61f, 9f, 9f, paint)
    file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    bitmap.recycle()
    val uri = FileProvider.getUriForFile(context, context.packageName + ".osmand-icons", file)
    context.grantUriPermission(target, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    return uri
  }

  companion object {
    private const val LAYER_ID = "yalla-nrouh-customer"
    private const val POINT_ID = "customer"
  }
}
