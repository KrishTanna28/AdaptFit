package com.krish.adaptivefitnessagent.pose

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import androidx.camera.core.ImageProxy
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicLong

private const val MODEL_ASSET_PATH = "mediapipe/pose_landmarker_lite.task"
private const val EMIT_INTERVAL_MS = 100L

internal data class PoseLandmark(val x: Float, val y: Float, val z: Float, val visibility: Float)

internal data class PoseResult(val timestampMs: Long, val landmarks: List<PoseLandmark>)

internal class PoseLandmarkerProcessor(private val context: Context) {
  private val lastEmitTimestampMs = AtomicLong(0L)
  private var landmarker: PoseLandmarker? = null

  fun close() {
    landmarker?.close()
    landmarker = null
  }

  fun detect(imageProxy: ImageProxy): PoseResult? {
    val mpImage = imageProxyToMpImage(imageProxy) ?: return null
    val timestampMs = imageProxy.imageInfo.timestamp / 1_000_000L

    if (timestampMs - lastEmitTimestampMs.get() < EMIT_INTERVAL_MS) {
      return null
    }

    val options = ImageProcessingOptions.builder()
      .setRotationDegrees(imageProxy.imageInfo.rotationDegrees)
      .build()

    val result = getLandmarker().detectForVideo(mpImage, options, timestampMs)
    val landmarks = result.extractLandmarks() ?: return null

    lastEmitTimestampMs.set(timestampMs)
    return PoseResult(timestampMs, landmarks)
  }

  private fun getLandmarker(): PoseLandmarker {
    val existing = landmarker
    if (existing != null) return existing

    context.assets.open(MODEL_ASSET_PATH).use { }

    val baseOptions = BaseOptions.builder()
      .setModelAssetPath(MODEL_ASSET_PATH)
      .build()

    val options = PoseLandmarker.PoseLandmarkerOptions.builder()
      .setBaseOptions(baseOptions)
      .setMinPoseDetectionConfidence(0.5f)
      .setMinPosePresenceConfidence(0.5f)
      .setMinTrackingConfidence(0.5f)
      .setNumPoses(1)
      .setRunningMode(RunningMode.VIDEO)
      .build()

    val created = PoseLandmarker.createFromOptions(context, options)
    landmarker = created
    return created
  }

  private fun imageProxyToMpImage(imageProxy: ImageProxy): com.google.mediapipe.framework.image.MPImage? {
    val bitmap = imageProxyToBitmap(imageProxy) ?: return null
    return BitmapImageBuilder(bitmap).build()
  }
}

internal fun imageProxyToBitmap(imageProxy: ImageProxy): Bitmap? {
  val planes = imageProxy.planes
  if (planes.size == 1 && planes[0].pixelStride == 4) {
    return rgbaImageProxyToBitmap(imageProxy)
  }

  val image = imageProxy.image ?: return null
  if (image.planes.size < 3) return null

  val yBuffer = image.planes[0].buffer.duplicate()
  val uBuffer = image.planes[1].buffer.duplicate()
  val vBuffer = image.planes[2].buffer.duplicate()

  val ySize = yBuffer.remaining()
  val uSize = uBuffer.remaining()
  val vSize = vBuffer.remaining()

  val nv21 = ByteArray(ySize + uSize + vSize)
  yBuffer.get(nv21, 0, ySize)
  vBuffer.get(nv21, ySize, vSize)
  uBuffer.get(nv21, ySize + vSize, uSize)

  val yuvImage = YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
  val out = ByteArrayOutputStream()
  if (!yuvImage.compressToJpeg(Rect(0, 0, image.width, image.height), 80, out)) {
    return null
  }

  val jpegBytes = out.toByteArray()
  return BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size)
}

private fun rgbaImageProxyToBitmap(imageProxy: ImageProxy): Bitmap? {
  val plane = imageProxy.planes.firstOrNull() ?: return null
  val width = imageProxy.width
  val height = imageProxy.height
  val pixelStride = plane.pixelStride
  val rowStride = plane.rowStride
  val buffer = plane.buffer.duplicate()

  val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
  if (pixelStride == 4 && rowStride == width * 4) {
    bitmap.copyPixelsFromBuffer(buffer)
    return bitmap
  }

  val row = ByteArray(rowStride)
  val pixels = IntArray(width)
  for (y in 0 until height) {
    buffer.position(y * rowStride)
    buffer.get(row, 0, rowStride.coerceAtMost(buffer.remaining()))
    for (x in 0 until width) {
      val offset = x * pixelStride
      val red = row[offset].toInt() and 0xFF
      val green = row[offset + 1].toInt() and 0xFF
      val blue = row[offset + 2].toInt() and 0xFF
      val alpha = row[offset + 3].toInt() and 0xFF
      pixels[x] = Color.argb(alpha, red, green, blue)
    }
    bitmap.setPixels(pixels, 0, width, 0, y, width, 1)
  }

  return bitmap
}

private fun PoseLandmarkerResult.extractLandmarks(): List<PoseLandmark>? {
  val allLandmarks = landmarks()
  if (allLandmarks.isEmpty()) return null

  val primary = allLandmarks[0]
  if (primary.isEmpty()) return null

  return primary.map { landmark ->
    PoseLandmark(
      landmark.x(),
      landmark.y(),
      landmark.z(),
      landmark.visibility().orElse(0f),
    )
  }
}
