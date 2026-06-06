import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { X } from "lucide-react-native";

import AppButton from "../components/ui/AppButton";
import AppTextField from "../components/ui/AppTextField";
import { analyzeWorkoutForm, type FormAnalysisResponse } from "../services/formAnalysis";
import {
  summarizePoseMetrics,
  type PoseFrameMetrics,
  type PoseMetricSummary,
} from "../services/poseMetrics";
import { appTheme } from "../theme/designSystem";
import PoseCamera from "./PoseCamera";
import { styles } from "./WorkoutScreen.styles";

type WorkoutFormCheckModalProps = {
  visible: boolean;
  onClose: () => void;
};

type FormCheckStep = "setup" | "camera" | "summary";

export default function WorkoutFormCheckModal({
  visible,
  onClose,
}: WorkoutFormCheckModalProps) {
  const framesRef = React.useRef<PoseFrameMetrics[]>([]);
  const [step, setStep] = React.useState<FormCheckStep>("setup");
  const [exerciseName, setExerciseName] = React.useState("");
  const [isRecording, setIsRecording] = React.useState(false);
  const [frameCount, setFrameCount] = React.useState(0);
  const [summary, setSummary] = React.useState<PoseMetricSummary | null>(null);
  const [analysis, setAnalysis] = React.useState<FormAnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [errorText, setErrorText] = React.useState("");

  React.useEffect(() => {
    if (!visible) {
      framesRef.current = [];
      setStep("setup");
      setExerciseName("");
      setIsRecording(false);
      setFrameCount(0);
      setSummary(null);
      setAnalysis(null);
      setIsAnalyzing(false);
      setErrorText("");
    }
  }, [visible]);

  const trimmedExerciseName = exerciseName.trim();

  const handleClose = () => {
    setIsRecording(false);
    onClose();
  };

  const openCamera = () => {
    if (trimmedExerciseName.length < 2) {
      setErrorText("Type the exercise name first.");
      return;
    }
    setErrorText("");
    setStep("camera");
  };

  const handleFrameMetrics = React.useCallback((metrics: PoseFrameMetrics) => {
    framesRef.current.push(metrics);
    if (framesRef.current.length % 6 === 0) {
      setFrameCount(framesRef.current.length);
    }
  }, []);

  const startRecording = () => {
    if (Platform.OS !== "android") {
      setErrorText("Pose tracking is available on Android only for now.");
      return;
    }

    framesRef.current = [];
    setSummary(null);
    setAnalysis(null);
    setFrameCount(0);
    setErrorText("");
    setIsRecording(true);
  };

  const stopRecording = async () => {
    setIsRecording(false);
    const frames = framesRef.current;

    if (frames.length < 12) {
      setErrorText(
        "Not enough pose data was captured. Keep your full body visible and record a few reps before stopping.",
      );
      return;
    }

    const nextSummary = summarizePoseMetrics(trimmedExerciseName, frames);
    setSummary(nextSummary);
    setIsAnalyzing(true);
    setErrorText("");

    try {
      const result = await analyzeWorkoutForm({
        exerciseName: trimmedExerciseName,
        summary: nextSummary,
      });
      setAnalysis(result);
      setStep("summary");
    } catch (error) {
      setAnalysis({
        exerciseName: trimmedExerciseName,
        repsDetected: nextSummary.repsDetected,
        insights: [
          "AI feedback could not be generated this time.",
          "Try another short recording with your full body clearly visible.",
        ],
      });
      setErrorText(error instanceof Error ? error.message : "Could not analyze this form check.");
      setStep("summary");
    } finally {
      setIsAnalyzing(false);
    }
  };
  const renderSetup = () => (
    <View style={styles.modalContent}>
      <View style={styles.heroTopRow}>
        <Text style={styles.modalTitle}>Form check</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close form check"
          onPress={handleClose}
          style={styles.modalIconButton}
        >
          <X size={18} color={appTheme.colors.text} strokeWidth={2.2} />
        </Pressable>
      </View>

      <AppTextField
        label="Exercise name"
        value={exerciseName}
        onChangeText={setExerciseName}
        placeholder="Squat, push-up, bicep curl..."
        autoCapitalize="words"
        returnKeyType="done"
      />

      {errorText ? <Text style={styles.formErrorText}>{errorText}</Text> : null}

      <View style={styles.modalActions}>
        <AppButton title="Open Camera" onPress={openCamera} />
        <AppButton title="Cancel" variant="secondary" onPress={handleClose} />
      </View>
    </View>
  );

  const renderCamera = () => (
    <View style={styles.modalContent}>
      <View style={styles.heroTopRow}>
        <View style={styles.heroTextWrap}>
          <Text style={styles.modalTitle}>{trimmedExerciseName || "Form check"}</Text>
          <Text style={styles.emptyText}>
            Keep your full body in view. Start when ready, stop after your set.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close form check camera"
          disabled={isAnalyzing}
          onPress={handleClose}
          style={styles.modalIconButton}
        >
          <X size={18} color={appTheme.colors.text} strokeWidth={2.2} />
        </Pressable>
      </View>

      <PoseCamera
        active={step === "camera"}
        recording={isRecording}
        onFrameMetrics={handleFrameMetrics}
      />
      {errorText ? <Text style={styles.formErrorText}>{errorText}</Text> : null}

      <View style={styles.modalActions}>
        {isRecording ? (
          <AppButton title="Stop and Analyze" onPress={stopRecording} />
        ) : (
          <AppButton title="Start" onPress={startRecording} disabled={isAnalyzing} />
        )}
        <AppButton
          title="Back"
          variant="secondary"
          onPress={() => setStep("setup")}
          disabled={isRecording || isAnalyzing}
        />
      </View>
    </View>
  );

  const renderSummary = () => {
    const insights = analysis?.insights?.length
      ? analysis.insights
      : ["Could not create detailed feedback this time. Try another short, well-lit recording."];

    return (
      <View style={styles.modalContent}>
        <View style={styles.heroTopRow}>
          <Text style={styles.modalTitle}>Form summary</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close form summary"
            onPress={handleClose}
            style={styles.modalIconButton}
          >
            <X size={18} color={appTheme.colors.text} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={styles.formSummaryBlock}>
          <Text style={styles.entryName}>{analysis?.exerciseName || summary?.exerciseName}</Text>
          <Text style={styles.entryMeta}>
            Reps detected: {String(analysis?.repsDetected ?? summary?.repsDetected ?? 0)}
          </Text>
        </View>

        {errorText ? <Text style={styles.formErrorText}>{errorText}</Text> : null}

        <View style={styles.block}>
          <Text style={styles.sectionTitle}>Coach insights</Text>
          {insights.slice(0, 4).map((insight, index) => (
            <View key={String(index)} style={styles.formInsightRow}>
              <Text style={styles.formInsightIndex}>{String(index + 1)}</Text>
              <Text style={styles.formInsightText}>{insight}</Text>
            </View>
          ))}
        </View>

        <View style={styles.modalActions}>
          <AppButton title="Done" onPress={handleClose} />
          <AppButton
            title="Record Again"
            variant="secondary"
            onPress={() => {
              framesRef.current = [];
              setFrameCount(0);
              setSummary(null);
              setAnalysis(null);
              setErrorText("");
              setStep("camera");
            }}
          />
        </View>
      </View>
    );
  };

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.formCheckOverlayRoot}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={isRecording ? undefined : handleClose} />

        <View style={styles.modalCard}>
          {step === "setup" ? renderSetup() : step === "camera" ? renderCamera() : renderSummary()}
        </View>
      </View>
    </View>
  );
}
