import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import {
  Mic,
  Paperclip,
  SendHorizontal,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react-native";
import { doc, getDoc } from "firebase/firestore";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppButton from "../components/ui/AppButton";
import { getUserFriendlyErrorMessage, useAppAlert } from "../components/ui/AppAlert";
import { useAuthUser } from "../hooks/useAuthUser";
import {
  sendCoachMessage,
  transcribeCoachAudio,
  type CoachInputAttachment,
  type CoachChatMessage,
  type CoachWorkoutPlan,
} from "../services/aiCoach";
import { db } from "../services/firebase";
import { getTodayDateKey } from "../services/helperFunctions";
import { searchWorkoutCatalog, type WorkoutCatalogItem } from "../services/workoutCatalogSearch";
import {
  calculateWorkoutCalories,
  hasCompleteCalorieProfile,
  type UserMetProfile,
} from "../services/workoutCalories";
import { resolveWorkoutMetMapping } from "../services/workoutMetResolver";
import { upsertWorkoutMetMappingPartial } from "../services/workoutMetMapping";
import { upsertLoggedWorkoutEntryPartial, type LoggedWorkoutEntry } from "../services/workoutLog";
import type { MetIntensity } from "../services/workoutMetDataset";
import { appTheme } from "../theme/designSystem";
import { globalStyles } from "../theme/globalStyles";
import type { HomeTabParamList } from "./HomeTabs";
import { styles } from "./AICoachScreen.styles";

// const QUICK_PROMPTS = [
//   "Plan my workout for today",
//   "What should I eat after training?",
//   "How can I improve consistency this week?",
//   "Give me motivation for today",
// ];

const STARTER_MESSAGE: CoachChatMessage = {
  id: "starter",
  role: "assistant",
  content:
    "I am Drona, your fitness coach. Ask me anything about workouts, nutrition, recovery, or consistency and I will personalize it using your logged data.",
  createdAt: new Date().toISOString(),
};

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_CHARS = 12000;
const MAX_WORKOUT_EXERCISES = 16;
const WORKOUT_DEFAULTS = {
  secPerRep: 4,
  restBetweenSetsSec: 75,
  minSessionMin: 5,
};
const WORKOUT_INTENSITY: MetIntensity = "moderate";

type PendingAttachment = {
  id: string;
  name: string;
  mimeType: string;
  content: string;
  charLength: number;
};

function getUnknownErrorMessage(error: unknown, fallback: string) {
  const mapped = getUserFriendlyErrorMessage(error, "").trim();
  if (mapped) {
    return mapped;
  }

  const detail = error instanceof Error ? error.message.trim() : "";
  return detail || fallback;
}

function toAttachmentPreviewLabel(attachment: PendingAttachment) {
  return `${attachment.name} (${String(attachment.charLength)} chars)`;
}

function normalizeAssistantReply(raw: string) {
  const withoutMarkdown = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^\s*\*\s+/gm, "")
    .replace(/`{1,3}/g, "")
    .replace(/\*/g, "");

  return withoutMarkdown
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractJsonText(raw: string) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return String(fenced[1] ?? "").trim();
  }

  const firstCurly = trimmed.indexOf("{");
  const lastCurly = trimmed.lastIndexOf("}");
  if (firstCurly !== -1 && lastCurly > firstCurly) {
    return trimmed.slice(firstCurly, lastCurly + 1).trim();
  }

  return trimmed;
}

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function normalizeWorkoutPlan(value: unknown): CoachWorkoutPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as { title?: unknown; exercises?: unknown };
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const exercisesRaw = Array.isArray(raw.exercises) ? raw.exercises : [];
  const exercises = exercisesRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const data = entry as { name?: unknown; sets?: unknown; reps?: unknown };
      const name = typeof data.name === "string" ? data.name.trim() : "";
      const sets = toPositiveInt(data.sets);
      const reps = toPositiveInt(data.reps);

      if (!name || !sets || !reps) {
        return null;
      }

      return { name, sets, reps };
    })
    .filter((entry): entry is CoachWorkoutPlan["exercises"][number] => entry !== null)
    .slice(0, MAX_WORKOUT_EXERCISES);

  if (!title || exercises.length === 0) {
    return null;
  }

  return { title, exercises };
}

function parseWorkoutPlanFromText(text: string): CoachWorkoutPlan | null {
  const cleaned = extractJsonText(text);
  if (!cleaned) return null;

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    return normalizeWorkoutPlan(parsed);
  } catch {
    return null;
  }
}

function isLikelyJsonText(text: string) {
  const trimmed = text.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
}

function buildWorkoutSummary(plan: CoachWorkoutPlan) {
  const count = plan.exercises.length;
  const label = count === 1 ? "exercise" : "exercises";
  return `Workout ready: ${plan.title}. Tap "Load Workout to Today" to add ${String(
    count,
  )} ${label}.`;
}

function estimateStrengthDurationMin(input: {
  sets: number;
  repsPerSet: number;
  secPerRep: number;
  restBetweenSetsSec: number;
  minSessionMin: number;
}) {
  const repSeconds = input.sets * input.repsPerSet * input.secPerRep;
  const restSeconds = Math.max(0, input.sets - 1) * input.restBetweenSetsSec;
  const totalMin = (repSeconds + restSeconds) / 60;
  return Math.max(input.minSessionMin, totalMin);
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestWorkoutMatch(query: string, results: WorkoutCatalogItem[]) {
  if (!results.length) return null;

  const queryNormalized = normalizeSearchText(query);
  const exact = results.find((item) => {
    if (normalizeSearchText(item.name) === queryNormalized) {
      return true;
    }

    return item.aliases.some((alias) => normalizeSearchText(alias) === queryNormalized);
  });

  return exact ?? results[0] ?? null;
}

function toPositiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseProfileGender(value: unknown): UserMetProfile["gender"] {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "MALE") return "MALE";
  if (normalized === "FEMALE") return "FEMALE";
  return null;
}

function parseUserMetProfile(raw: unknown): UserMetProfile {
  if (!raw || typeof raw !== "object") {
    return {
      age: null,
      gender: null,
      heightCm: null,
      weightKg: null,
    };
  }

  const data = raw as Record<string, unknown>;
  return {
    age: toPositiveNumber(data.age),
    gender: parseProfileGender(data.gender),
    heightCm: toPositiveNumber(data.heightCm),
    weightKg: toPositiveNumber(data.weightKg),
  };
}

export default function AICoachScreen() {
  const { showAlert } = useAppAlert();
  const { user } = useAuthUser();
  const navigation = useNavigation<BottomTabNavigationProp<HomeTabParamList>>();
  const chatScrollRef = useRef<ScrollView | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const insets = useSafeAreaInsets();

  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<CoachChatMessage[]>([STARTER_MESSAGE]);
  const [contextSignals, setContextSignals] = useState<string[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isPickingFile, setIsPickingFile] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAutoSpeakEnabled, setIsAutoSpeakEnabled] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [loadingWorkoutMessageId, setLoadingWorkoutMessageId] = useState<string | null>(null);
  const [profileForCalories, setProfileForCalories] = useState<UserMetProfile | null>(null);

  useEffect(() => {
    return () => {
      const recording = recordingRef.current;
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {
          // ignore cleanup errors
        });
      }
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      if (!user?.uid) {
        if (mounted) {
          setProfileForCalories(null);
        }
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "users", user.uid));
        if (!mounted) return;
        const profile = snapshot.data()?.profile;
        setProfileForCalories(parseUserMetProfile(profile));
      } catch {
        if (mounted) {
          setProfileForCalories(null);
        }
      }
    };

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  const canSend = useMemo(() => {
    return (draftMessage.trim().length > 0 || pendingAttachments.length > 0) && !isSending && !isTranscribing;
  }, [draftMessage, pendingAttachments.length, isSending, isTranscribing]);

  const appendMessage = (message: CoachChatMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
  };

  const stopSpeaking = () => {
    Speech.stop();
    setSpeakingMessageId(null);
  };

  const speakMessage = (content: string, messageId: string) => {
    const normalizedContent = normalizeAssistantReply(content);
    if (!normalizedContent.trim()) {
      return;
    }

    if (speakingMessageId === messageId) {
      stopSpeaking();
      return;
    }

    Speech.stop();
    setSpeakingMessageId(messageId);

    Speech.speak(normalizedContent, {
      language: "en-US",
      pitch: 1,
      rate: 0.95,
      onDone: () => setSpeakingMessageId(null),
      onStopped: () => setSpeakingMessageId(null),
      onError: () => setSpeakingMessageId(null),
    });
  };

  const handlePickFiles = async () => {
    if (isPickingFile || isSending || isRecording || isTranscribing) {
      return;
    }

    setIsPickingFile(true);

    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (pickerResult.canceled) {
        return;
      }

      const nextAttachments: PendingAttachment[] = [];

      for (const asset of pickerResult.assets) {
        if (nextAttachments.length + pendingAttachments.length >= MAX_ATTACHMENTS) {
          break;
        }

        const mimeType = typeof asset.mimeType === "string" ? asset.mimeType : "text/plain";

        try {
          const rawText = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.UTF8,
          });

          const trimmed = rawText.trim();
          if (!trimmed) {
            continue;
          }

          const content = trimmed.slice(0, MAX_ATTACHMENT_CHARS);
          nextAttachments.push({
            id: `${asset.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: asset.name,
            mimeType,
            content,
            charLength: content.length,
          });
        } catch {
          showAlert({
            title: "Unsupported file",
            message: `${asset.name} could not be parsed as text. Please attach text-based files.`,
          });
        }
      }

      if (!nextAttachments.length) {
        return;
      }

      setPendingAttachments((prev) => [...prev, ...nextAttachments].slice(0, MAX_ATTACHMENTS));
    } catch (error) {
      showAlert({
        title: "File attach failed",
        message: getUnknownErrorMessage(error, "Could not attach files right now."),
      });
    } finally {
      setIsPickingFile(false);
    }
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const startRecording = async () => {
    if (isRecording || isSending || isTranscribing) {
      return;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        showAlert({
          title: "Microphone permission needed",
          message: "Allow microphone access to dictate a message.",
        });
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setIsRecording(true);
    } catch (error) {
      showAlert({
        title: "Could not start recording",
        message: getUnknownErrorMessage(error, "Voice capture is unavailable right now."),
      });
    }
  };

  const stopRecordingAndTranscribe = async () => {
    const activeRecording = recordingRef.current;
    if (!activeRecording) {
      setIsRecording(false);
      return;
    }

    setIsRecording(false);
    setIsTranscribing(true);

    try {
      await activeRecording.stopAndUnloadAsync();
      const uri = activeRecording.getURI();
      recordingRef.current = null;

      if (!uri) {
        throw new Error("No audio captured for transcription.");
      }

      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const transcription = await transcribeCoachAudio({
        audioBase64,
        mimeType: Platform.OS === "ios" ? "audio/m4a" : "audio/mp4",
      });

      const transcriptText = transcription.text.trim();
      if (!transcriptText) {
        showAlert({
          title: "No speech detected",
          message: "Try speaking a bit louder or recording again.",
        });
        return;
      }

      setDraftMessage((prev) => (prev.trim() ? `${prev.trim()} ${transcriptText}` : transcriptText));
    } catch (error) {
      showAlert({
        title: "Voice to text failed",
        message: getUnknownErrorMessage(error, "Could not transcribe your voice note right now."),
      });
    } finally {
      setIsTranscribing(false);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {
        // ignore cleanup errors
      });
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecordingAndTranscribe();
      return;
    }

    await startRecording();
  };

  const handleLoadWorkoutPlan = async (plan: CoachWorkoutPlan, messageId: string) => {
    if (loadingWorkoutMessageId) {
      return;
    }

    if (!user?.uid) {
      showAlert({
        title: "Sign-in required",
        message: "Please sign in to load workouts.",
      });
      return;
    }

    setLoadingWorkoutMessageId(messageId);
    const todayKey = getTodayDateKey();
    const baseTimeMs = Date.now();
    const savedEntries: LoggedWorkoutEntry[] = [];
    const missingExercises: string[] = [];
    const unmappedExercises: string[] = [];

    try {
      for (let index = 0; index < plan.exercises.length; index += 1) {
        const exercise = plan.exercises[index];
        const searchResults = await searchWorkoutCatalog({
          query: exercise.name,
          pageSize: 6,
        });
        const matched = pickBestWorkoutMatch(exercise.name, searchResults);

        if (!matched) {
          missingExercises.push(exercise.name);
          continue;
        }

        const sets = Math.max(1, Math.round(exercise.sets));
        const reps = Math.max(1, Math.round(exercise.reps));

        const resolution = await resolveWorkoutMetMapping({
          workout: matched,
          intensity: WORKOUT_INTENSITY,
          topN: 5,
        });

        if (!resolution.best) {
          unmappedExercises.push(matched.name || exercise.name);
          continue;
        }

        const durationMin = estimateStrengthDurationMin({
          sets,
          repsPerSet: reps,
          secPerRep: WORKOUT_DEFAULTS.secPerRep,
          restBetweenSetsSec: WORKOUT_DEFAULTS.restBetweenSetsSec,
          minSessionMin: WORKOUT_DEFAULTS.minSessionMin,
        });

        let caloriesGross = 0;
        let caloriesActive = 0;

        if (hasCompleteCalorieProfile(profileForCalories)) {
          const calories = calculateWorkoutCalories({
            metValue: resolution.best.metValue,
            durationMin,
            profile: profileForCalories,
          });
          caloriesGross = Number(calories.grossCalories.toFixed(2));
          caloriesActive = Number(calories.activeCalories.toFixed(2));
        }

        const entry: LoggedWorkoutEntry = {
          id: "entry-" + Date.now().toString() + "-" + Math.random().toString(36).slice(2, 8),
          exerciseId: matched.id,
          workoutName: matched.name,
          workoutMode: "strength",
          durationMin: Number(durationMin.toFixed(2)),
          sets,
          reps,
          secPerRep: WORKOUT_DEFAULTS.secPerRep,
          restBetweenSetsSec: WORKOUT_DEFAULTS.restBetweenSetsSec,
          setupSec: null,
          minSessionMin: WORKOUT_DEFAULTS.minSessionMin,
          intensity: WORKOUT_INTENSITY,
          metRowId: resolution.best.rowId,
          metActivity: resolution.best.activity,
          metValue: Number(resolution.best.metValue.toFixed(2)),
          caloriesGross,
          caloriesActive,
          datasetVersion: resolution.datasetVersion,
          resolverVersion: resolution.resolverVersion,
          mappingSource: resolution.shouldConfirm ? "auto-needs-review" : "auto",
          loggedAt: new Date(baseTimeMs + index * 1000).toISOString(),
        };

        await upsertLoggedWorkoutEntryPartial(user.uid, todayKey, entry);

        void upsertWorkoutMetMappingPartial(user.uid, {
          exerciseId: matched.id,
          workoutName: matched.name,
          intensity: WORKOUT_INTENSITY,
          metRowId: resolution.best.rowId,
          metActivity: resolution.best.activity,
          metValue: Number(resolution.best.metValue.toFixed(2)),
          score: Number(resolution.best.score.toFixed(4)),
          datasetVersion: resolution.datasetVersion,
          resolverVersion: resolution.resolverVersion,
          mappingSource: resolution.shouldConfirm ? "auto-needs-review" : "auto",
        }).catch(() => { });

        savedEntries.push(entry);
      }

      if (!savedEntries.length) {
        showAlert({
          title: "Could not load workout",
          message: "No exercises could be added. Try refining the workout request.",
        });
        return;
      }

      const notes: string[] = [];
      if (missingExercises.length) {
        notes.push("Not found: " + missingExercises.join(", ") + ".");
      }
      if (unmappedExercises.length) {
        notes.push("No MET match: " + unmappedExercises.join(", ") + ".");
      }

      showAlert({
        title: missingExercises.length || unmappedExercises.length ? "Workout partially loaded" : "Workout loaded",
        message: [
          `Added ${String(savedEntries.length)} exercises to today's workout log.`,
          ...notes,
        ].join(" "),
      });

      navigation.navigate("Workout");
    } catch (error) {
      showAlert({
        title: "Workout load failed",
        message: getUnknownErrorMessage(
          error,
          "We couldn't load this workout right now. Please try again.",
        ),
      });
    } finally {
      setLoadingWorkoutMessageId(null);
    }
  };

  const handleSend = async (inputText?: string) => {
    const messageText = (inputText ?? draftMessage).trim();
    const attachmentsToSend: CoachInputAttachment[] = pendingAttachments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      content: attachment.content,
    }));

    const fallbackPrompt = attachmentsToSend.length
      ? "Please analyze my attached files and answer my request."
      : "";
    const outboundPrompt = messageText || fallbackPrompt;

    if (!outboundPrompt || isSending || isTranscribing) {
      return;
    }

    const messagePreview = attachmentsToSend.length
      ? `${outboundPrompt}\n\nAttached: ${attachmentsToSend.map((item) => item.name).join(", ")}`
      : outboundPrompt;

    const userMessage: CoachChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messagePreview,
      createdAt: new Date().toISOString(),
    };

    appendMessage(userMessage);
    setDraftMessage("");
    setPendingAttachments([]);
    setIsSending(true);
    scrollToBottom();

    try {
      const response = await sendCoachMessage({
        message: outboundPrompt,
        conversationId,
        contextWindowDays: 7,
        includeAllHistory: true,
        attachments: attachmentsToSend,
      });

      if (!conversationId) {
        setConversationId(response.conversationId);
      }

      if (Array.isArray(response.contextSignals)) {
        setContextSignals(response.contextSignals.slice(0, 3));
      }

      const assistantMessageId = `assistant-${Date.now()}`;
      const workoutPlan =
        response.workoutPlan ?? parseWorkoutPlanFromText(response.reply);
      const cleanedReply = normalizeAssistantReply(response.reply);
      const assistantText =
        workoutPlan && (!cleanedReply || isLikelyJsonText(cleanedReply))
          ? buildWorkoutSummary(workoutPlan)
          : cleanedReply;
      appendMessage({
        id: assistantMessageId,
        role: "assistant",
        content: assistantText,
        createdAt: new Date().toISOString(),
        workoutPlan: workoutPlan ?? undefined,
      });

      if (isAutoSpeakEnabled) {
        speakMessage(assistantText, assistantMessageId);
      }

      scrollToBottom();
    } catch (error) {
      const message = getUnknownErrorMessage(
        error,
        "Drona could not respond right now. Please try again.",
      );

      showAlert({
        title: "Drona unavailable",
        message,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={globalStyles.screen} edges={["top", "left", "right"]}>
  <KeyboardAvoidingView
    style={styles.screenContent}
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    keyboardVerticalOffset={0}
  >
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>Drona</Text>
            <Text style={styles.subtitle}>Chat with Drona</Text>
          </View>
        </View>

        <ScrollView
          ref={chatScrollRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
        >
          {messages.map((message) => {
            const isAssistant = message.role === "assistant";
            const workoutPlan = isAssistant ? message.workoutPlan : undefined;

            if (workoutPlan) {
              const isLoadingPlan = loadingWorkoutMessageId === message.id;

              return (
                <View key={message.id} style={[styles.messageRow, styles.assistantRow]}>
                  <View style={styles.workoutCard}>
                    <View style={styles.workoutCardHeader}>
                      <Text style={styles.workoutCardEyebrow}>Drona workout</Text>
                      <Text style={styles.workoutCardTitle}>{workoutPlan.title}</Text>
                      {message.content ? (
                        <Text style={styles.workoutCardSubtitle}>{message.content}</Text>
                      ) : null}
                    </View>

                    <View style={styles.workoutExerciseList}>
                      {workoutPlan.exercises.map((exercise, index) => {
                        const isLast = index === workoutPlan.exercises.length - 1;
                        return (
                          <View
                            key={`${exercise.name}-${String(index)}`}
                            style={[
                              styles.workoutExerciseRow,
                              isLast ? { borderBottomWidth: 0, paddingBottom: 0 } : null,
                            ]}
                          >
                            <Text style={styles.workoutExerciseName}>{exercise.name}</Text>
                            <Text style={styles.workoutExerciseMeta}>
                              {exercise.sets} x {exercise.reps}
                            </Text>
                          </View>
                        );
                      })}
                    </View>

                    <View style={styles.workoutCardFooter}>
                      <AppButton
                        title={isLoadingPlan ? "Loading..." : "Load Workout to Today"}
                        onPress={() => {
                          handleLoadWorkoutPlan(workoutPlan, message.id).catch(() => {
                            // handled in handleLoadWorkoutPlan
                          });
                        }}
                        loading={isLoadingPlan}
                        disabled={isLoadingPlan}
                      />
                    </View>
                  </View>
                </View>
              );
            }

            return (
              <View
                key={message.id}
                style={[styles.messageRow, isAssistant ? styles.assistantRow : styles.userRow]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    isAssistant ? styles.assistantBubble : styles.userBubble,
                  ]}
                >
                  <Text style={[styles.messageText, !isAssistant ? styles.userMessageText : null]}>
                    {message.content}
                  </Text>

                  {isAssistant ? (
                    <Pressable
                      style={styles.speakMessageButton}
                      onPress={() => {
                        speakMessage(message.content, message.id);
                      }}
                    >
                      {speakingMessageId === message.id ? (
                        <VolumeX size={14} color={appTheme.colors.textSecondary} strokeWidth={2.2} />
                      ) : (
                        <Volume2 size={14} color={appTheme.colors.textSecondary} strokeWidth={2.2} />
                      )}
                      <Text style={styles.speakMessageButtonText}>
                        {speakingMessageId === message.id ? "Stop" : "Speak"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}

          {isSending ? (
            <View style={[styles.messageRow, styles.assistantRow]}>
              <View style={[styles.messageBubble, styles.assistantBubble, styles.thinkingBubble]}>
                <ActivityIndicator size="small" color={appTheme.colors.primary} />
                <Text style={styles.thinkingText}>Drona is thinking...</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.composerWrap}>
          {pendingAttachments.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachmentRow}>
              {pendingAttachments.map((attachment) => (
                <View key={attachment.id} style={styles.attachmentChip}>
                  <Text style={styles.attachmentText}>{toAttachmentPreviewLabel(attachment)}</Text>
                  <Pressable onPress={() => removeAttachment(attachment.id)}>
                    <X size={14} color={appTheme.colors.textSecondary} strokeWidth={2.2} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.inputRow}>
            <Pressable
              style={styles.iconButton}
              onPress={() => {
                handlePickFiles().catch(() => {
                  // handled in handlePickFiles
                });
              }}
              disabled={isPickingFile || isSending}
            >
              {isPickingFile ? (
                <ActivityIndicator size="small" color={appTheme.colors.primary} />
              ) : (
                <Paperclip size={18} color={appTheme.colors.textSecondary} strokeWidth={2.2} />
              )}
            </Pressable>

            <Pressable
              style={[styles.iconButton, isRecording ? styles.iconButtonActive : null]}
              onPress={() => {
                toggleRecording().catch(() => {
                  // handled in toggleRecording
                });
              }}
              disabled={isSending || isTranscribing}
            >
              {isRecording ? (
                <Square size={16} color={appTheme.colors.card} strokeWidth={2.2} />
              ) : (
                <Mic size={18} color={appTheme.colors.textSecondary} strokeWidth={2.2} />
              )}
            </Pressable>

            <TextInput
              value={draftMessage}
              onChangeText={setDraftMessage}
              style={styles.input}
              placeholder="Message Drona"
              placeholderTextColor={appTheme.colors.textMuted}
              multiline
              editable={!isSending && !isTranscribing}
              maxLength={1800}
            />

            <Pressable
              style={[styles.sendButton, !canSend ? styles.sendButtonDisabled : null]}
              onPress={() => {
                handleSend().catch(() => {
                  // handled in handleSend
                });
              }}
              disabled={!canSend}
            >
              <SendHorizontal
                size={18}
                color={!canSend ? appTheme.colors.textMuted : appTheme.colors.card}
                strokeWidth={2.2}
              />
            </Pressable>
          </View>

          {isRecording ? <Text style={styles.statusText}>Listening... tap stop to transcribe</Text> : null}
          {isTranscribing ? <Text style={styles.statusText}>Transcribing voice note...</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
