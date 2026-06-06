package com.krish.adaptivefitnessagent.pose

import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class PoseCameraViewManager : SimpleViewManager<PoseCameraView>() {
  override fun getName(): String = "PoseCameraView"

  override fun createViewInstance(reactContext: ThemedReactContext): PoseCameraView {
    return PoseCameraView(reactContext)
  }

  @ReactProp(name = "active")
  fun setActive(view: PoseCameraView, active: Boolean) {
    view.setActive(active)
  }

  @ReactProp(name = "processingEnabled")
  fun setProcessingEnabled(view: PoseCameraView, enabled: Boolean) {
    view.setProcessingEnabled(enabled)
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
    return MapBuilder.of(
      "topCameraReady",
      MapBuilder.of("registrationName", "onCameraReady"),
      "topPoseLandmarks",
      MapBuilder.of("registrationName", "onPoseLandmarks"),
      "topPoseError",
      MapBuilder.of("registrationName", "onPoseError"),
    )
  }
}
