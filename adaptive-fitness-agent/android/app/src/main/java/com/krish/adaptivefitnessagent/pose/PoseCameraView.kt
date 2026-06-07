package com.krish.adaptivefitnessagent.pose

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.Matrix
import android.util.Log
import android.view.Gravity
import android.widget.ImageView
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.core.view.doOnLayout
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "PoseCameraView"
private const val PREVIEW_START_TIMEOUT_MS = 8_000L
private const val PREVIEW_FRAME_INTERVAL_MS = 66L

@SuppressLint("ViewConstructor")
class PoseCameraView(private val reactContext: ThemedReactContext) : FrameLayout(reactContext) {
  private val previewImageView = ImageView(reactContext)
  private val cameraExecutor = Executors.newSingleThreadExecutor()
  private val processingGate = AtomicBoolean(false)
  private var isActive = false
  private var processingEnabled = false
  private var cameraProvider: ProcessCameraProvider? = null
  private var imageAnalysis: ImageAnalysis? = null
  private var poseProcessor: PoseLandmarkerProcessor? = null
  private var lifecycleObserver: LifecycleEventObserver? = null
  private var bindAfterLayoutQueued = false
  private var hasCameraFrame = false
  private var lastPreviewFrameTimestampMs = 0L
  private var lastPreviewBitmap: Bitmap? = null
  private var previewTimeoutRunnable: Runnable? = null

  init {
    previewImageView.scaleType = ImageView.ScaleType.CENTER_CROP
    val layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    layoutParams.gravity = Gravity.CENTER
    addView(previewImageView, layoutParams)
  }

  fun setActive(active: Boolean) {
    if (isActive == active) return
    isActive = active
    if (active) {
      bindCameraWhenReady()
    } else {
      unbindCamera()
    }
  }

  fun setProcessingEnabled(enabled: Boolean) {
    processingEnabled = enabled
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attachLifecycle()
    if (isActive) {
      bindCameraWhenReady()
    }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    unbindCamera()
    detachLifecycle()
  }

  private fun attachLifecycle() {
    val owner = reactContext.currentActivity as? LifecycleOwner ?: return
    if (lifecycleObserver != null) return

    val observer = LifecycleEventObserver { _, event ->
      when (event) {
        Lifecycle.Event.ON_RESUME -> if (isActive) bindCameraWhenReady() else Unit
        Lifecycle.Event.ON_PAUSE -> unbindCamera()
        Lifecycle.Event.ON_DESTROY -> unbindCamera()
        else -> Unit
      }
    }

    owner.lifecycle.addObserver(observer)
    lifecycleObserver = observer
  }

  private fun detachLifecycle() {
    val owner = reactContext.currentActivity as? LifecycleOwner ?: return
    val observer = lifecycleObserver ?: return
    owner.lifecycle.removeObserver(observer)
    lifecycleObserver = null
  }

  private fun bindCameraWhenReady() {
    if (!isAttachedToWindow) return

    if (width <= 0 || height <= 0) {
      if (!bindAfterLayoutQueued) {
        bindAfterLayoutQueued = true
        doOnLayout {
          bindAfterLayoutQueued = false
          if (isActive && isAttachedToWindow && width > 0 && height > 0) {
            bindCamera()
          }
        }
      }
      return
    }

    bindCamera()
  }

  private fun bindCamera() {
    if (!isActive || !isAttachedToWindow || width <= 0 || height <= 0) {
      return
    }

    val owner = reactContext.currentActivity as? LifecycleOwner
    if (owner == null) {
      emitError("Camera requires an active Activity.")
      return
    }

    val cameraProviderFuture = ProcessCameraProvider.getInstance(reactContext)
    cameraProviderFuture.addListener(
      {
        if (!isActive || !isAttachedToWindow) {
          return@addListener
        }

        try {
          cameraProvider = cameraProviderFuture.get()
          bindUseCases(owner)
        } catch (error: Exception) {
          clearPreviewStartTimeout()
          emitError(error.message ?: "Unable to start camera.")
        }
      },
      ContextCompat.getMainExecutor(reactContext),
    )
  }

  private fun bindUseCases(owner: LifecycleOwner) {
    if (!isActive || !isAttachedToWindow || width <= 0 || height <= 0) {
      return
    }

    val provider = cameraProvider ?: return
    provider.unbindAll()

    hasCameraFrame = false
    lastPreviewFrameTimestampMs = 0L
    schedulePreviewStartTimeout()

    val analysis = ImageAnalysis.Builder()
      .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
      .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
      .build()
      .also { analyzer ->
        analyzer.setAnalyzer(cameraExecutor) { frame ->
          processFrame(frame)
        }
      }

    imageAnalysis = analysis

    try {
      provider.bindToLifecycle(owner, selectCamera(provider), analysis)
    } catch (error: Exception) {
      clearPreviewStartTimeout()
      emitError(error.message ?: "Failed to bind camera.")
    }
  }

  private fun selectCamera(provider: ProcessCameraProvider): CameraSelector {
    return when {
      provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) -> CameraSelector.DEFAULT_FRONT_CAMERA
      provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) -> CameraSelector.DEFAULT_BACK_CAMERA
      else -> throw IllegalStateException("No available camera was found on this device.")
    }
  }

  private fun unbindCamera() {
    clearPreviewStartTimeout()
    hasCameraFrame = false
    imageAnalysis?.clearAnalyzer()
    imageAnalysis = null
    cameraProvider?.unbindAll()
    poseProcessor?.close()
    poseProcessor = null
    previewImageView.setImageBitmap(null)
    lastPreviewBitmap = null
  }

  private fun schedulePreviewStartTimeout() {
    clearPreviewStartTimeout()
    val timeout = Runnable {
      if (isActive && isAttachedToWindow && !hasCameraFrame) {
        emitError("Camera frames did not start. Close any other app using the camera and try again.")
      }
    }
    previewTimeoutRunnable = timeout
    postDelayed(timeout, PREVIEW_START_TIMEOUT_MS)
  }

  private fun clearPreviewStartTimeout() {
    previewTimeoutRunnable?.let { removeCallbacks(it) }
    previewTimeoutRunnable = null
  }

  private fun processFrame(frame: androidx.camera.core.ImageProxy) {
    if (!isActive) {
      frame.close()
      return
    }

    markCameraFrameStarted()
    updatePreviewFrame(frame)

    if (!processingEnabled) {
      frame.close()
      return
    }

    if (!processingGate.compareAndSet(false, true)) {
      frame.close()
      return
    }

    try {
      val processor = poseProcessor ?: PoseLandmarkerProcessor(reactContext).also { poseProcessor = it }
      val result = processor.detect(frame)
      if (result != null) {
        emitLandmarks(result)
      }
    } catch (error: Exception) {
      Log.e(TAG, "Pose detection failed", error)
      emitError(error.message ?: "Pose detection failed.")
    } finally {
      processingGate.set(false)
      frame.close()
    }
  }

  private fun markCameraFrameStarted() {
    if (hasCameraFrame) return
    hasCameraFrame = true
    clearPreviewStartTimeout()
    emitReady()
  }

  private fun updatePreviewFrame(frame: androidx.camera.core.ImageProxy) {
    val timestampMs = frame.imageInfo.timestamp / 1_000_000L
    if (timestampMs - lastPreviewFrameTimestampMs < PREVIEW_FRAME_INTERVAL_MS) {
      return
    }

    lastPreviewFrameTimestampMs = timestampMs
    val bitmap = imageProxyToBitmap(frame) ?: return
    val displayBitmap = transformPreviewBitmap(bitmap, frame.imageInfo.rotationDegrees)
    if (displayBitmap !== bitmap) {
      bitmap.recycle()
    }

    previewImageView.post {
      lastPreviewBitmap = displayBitmap
      previewImageView.setImageBitmap(displayBitmap)
    }
  }

  private fun transformPreviewBitmap(bitmap: Bitmap, rotationDegrees: Int): Bitmap {
    val matrix = Matrix().apply {
      if (rotationDegrees != 0) {
        postRotate(rotationDegrees.toFloat())
      }
      postScale(-1f, 1f)
    }

    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
  }

  private fun emitLandmarks(result: PoseResult) {
    val payload = Arguments.createMap()
    payload.putDouble("timestampMs", result.timestampMs.toDouble())

    val landmarksArray = Arguments.createArray()
    result.landmarks.forEach { landmark ->
      val item = Arguments.createMap()
      item.putDouble("x", landmark.x.toDouble())
      item.putDouble("y", landmark.y.toDouble())
      item.putDouble("z", landmark.z.toDouble())
      item.putDouble("visibility", landmark.visibility.toDouble())
      landmarksArray.pushMap(item)
    }

    payload.putArray("landmarks", landmarksArray)
    sendEvent("topPoseLandmarks", payload)
  }

  private fun emitReady() {
    sendEvent("topCameraReady", Arguments.createMap())
  }

  private fun emitError(message: String) {
    val payload = Arguments.createMap()
    payload.putString("message", message)
    sendEvent("topPoseError", payload)
  }

  private fun sendEvent(name: String, payload: com.facebook.react.bridge.WritableMap) {
    if (id == 0) return

    UiThreadUtil.runOnUiThread {
        reactContext
            .getJSModule(com.facebook.react.uimanager.events.RCTEventEmitter::class.java)
            ?.receiveEvent(id, name, payload)
    }
}
}
