import { useCallback, useEffect, useMemo, useState } from "react";
import {
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  requireNativeComponent,
  UIManager,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useCameraPermissions, CameraView } from "expo-camera";

import {
  extractPoseFrameMetrics,
  type PoseConnection,
  type PoseFrameMetrics,
  type PoseLandmark,
} from "../services/poseMetrics";
import { appTheme } from "../theme/designSystem";
import { styles } from "./WorkoutScreen.styles";

type PoseCameraProps = {
  active: boolean;
  recording: boolean;
  onFrameMetrics: (metrics: PoseFrameMetrics) => void;
};

type PoseLandmarksEvent = {
  timestampMs: number;
  landmarks: PoseLandmark[];
};

type PoseErrorEvent = {
  message: string;
};

type NativePoseCameraProps = {
  active: boolean;
  processingEnabled: boolean;
  onCameraReady?: () => void;
  onPoseLandmarks?: (event: NativeSyntheticEvent<PoseLandmarksEvent>) => void;
  onPoseError?: (event: NativeSyntheticEvent<PoseErrorEvent>) => void;
  style?: StyleProp<ViewStyle>;
};

const isNativeViewAvailable =
  Platform.OS === "android" && UIManager.getViewManagerConfig("PoseCameraView") != null;

const NativePoseCameraView =
  isNativeViewAvailable
    ? requireNativeComponent<NativePoseCameraProps>("PoseCameraView")
    : null;

const POSE_CONNECTIONS: PoseConnection[] = [
  { start: 0, end: 1 },
  { start: 1, end: 2 },
  { start: 2, end: 3 },
  { start: 0, end: 4 },
  { start: 4, end: 5 },
  { start: 5, end: 6 },
  { start: 0, end: 7 },
  { start: 0, end: 8 },
  { start: 9, end: 10 },
  { start: 9, end: 11 },
  { start: 10, end: 12 },
  { start: 11, end: 12 },
  { start: 11, end: 13 },
  { start: 13, end: 15 },
  { start: 12, end: 14 },
  { start: 14, end: 16 },
  { start: 11, end: 23 },
  { start: 12, end: 24 },
  { start: 23, end: 24 },
  { start: 23, end: 25 },
  { start: 25, end: 27 },
  { start: 25, end: 29 },
  { start: 29, end: 31 },
  { start: 27, end: 31 },
  { start: 24, end: 26 },
  { start: 26, end: 28 },
  { start: 26, end: 30 },
  { start: 30, end: 32 },
  { start: 28, end: 32 },
];

export default function PoseCamera({
  active,
  recording,
  onFrameMetrics,
}: PoseCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraError, setCameraError] = useState("");
  const [isCameraReady, setIsCameraReady] = useState(false);

  const canUseNativeView = isNativeViewAvailable && NativePoseCameraView;

  useEffect(() => {
    if (active) {
      setCameraError("");
      if (!permission?.granted) {
        void requestPermission();
      }
    } else {
      setIsCameraReady(false);
    }
  }, [active, permission?.granted, requestPermission]);

  const handleCameraReady = useCallback(() => {
    setCameraError("");
    setIsCameraReady(true);
  }, []);

  const handlePoseLandmarks = useCallback(
    (event: NativeSyntheticEvent<PoseLandmarksEvent>) => {
      if (!recording) {
        return;
      }

      const { landmarks, timestampMs } = event.nativeEvent;
      const metrics = extractPoseFrameMetrics(landmarks, timestampMs, POSE_CONNECTIONS);
      if (metrics) {
        setCameraError("");
        onFrameMetrics(metrics);
      }
    },
    [onFrameMetrics, recording],
  );

  const handlePoseError = useCallback(
    (event: NativeSyntheticEvent<PoseErrorEvent>) => {
      setIsCameraReady(false);
      setCameraError(event.nativeEvent.message || "Pose camera error.");
    },
    [],
  );

  const nativeView = useMemo(() => {
    if (!canUseNativeView) {
      return null;
    }

    return (
      <NativePoseCameraView
        active={active}
        processingEnabled={recording}
        onCameraReady={handleCameraReady}
        onPoseLandmarks={handlePoseLandmarks}
        onPoseError={handlePoseError}
        style={nativeCameraStyles.camera}
      />
    );
  }, [
    active,
    canUseNativeView,
    handleCameraReady,
    handlePoseLandmarks,
    handlePoseError,
    recording,
  ]);

  if (!active) {
    return <View style={styles.formCameraPreview} />;
  }

  if (!permission?.granted) {
    return (
      <View style={styles.formCameraPlaceholder}>
        <Text style={styles.emptyText}>Camera permission is needed for form check.</Text>
        {permission?.canAskAgain !== false ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Allow camera permission"
            onPress={() => void requestPermission()}
            style={styles.addMealButton}
          >
            <Text style={styles.addMealText}>Allow Camera</Text>
          </Pressable>
        ) : (
          <Text style={styles.emptyText}>Enable camera permission from your phone settings.</Text>
        )}
      </View>
    );
  }

  if (cameraError) {
    return (
      <View style={styles.formCameraPlaceholder}>
        <Text style={styles.emptyText}>{cameraError}</Text>
      </View>
    );
  }

  if (!canUseNativeView) {
    return (
      <View style={styles.formCameraPreview}>
        <CameraView 
          key={`fallback-camera-${active ? "on" : "off"}`}
          style={nativeCameraStyles.camera} 
          facing="front" 
          active={active}
          onMountError={(e) => setCameraError(e.message || "Failed to open camera.")}
        />
      </View>
    );
  }

  return (
    <View
      collapsable={false}
      style={[
        styles.formCameraPreview,
        Platform.OS === "android" ? nativeCameraStyles.androidPreviewContainer : null,
      ]}
    >
      {nativeView}
      <View style={styles.formCameraNotice}>
        <Text style={styles.formCameraNoticeText}>
          {isCameraReady ? "Camera ready." : "Opening camera..."}
        </Text>
      </View>
    </View>
  );
}

const nativeCameraStyles = StyleSheet.create({
  androidPreviewContainer: {
    borderRadius: 0,
    overflow: "visible",
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: appTheme.colors.text,
  },
});
