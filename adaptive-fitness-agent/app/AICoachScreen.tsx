import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import { AudioModule, useAudioRecorder, RecordingPresets } from "expo-audio";
import * as Speech from "expo-speech";
import {
  Menu,
  Mic,
  Plus,
  SendHorizontal,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react-native";
import { doc, getDoc } from "firebase/firestore";
import { useFocusEffect } from "@react-navigation/native";
import AppButton from "../components/ui/AppButton";
import AppSkeleton from "../components/ui/AppSkeleton";
import { getUserFriendlyErrorMessage, useAppAlert } from "../components/ui/AppAlert";
import { useAuthUser } from "../hooks/useAuthUser";
import {
  deleteCoachConversation,
  getCoachConversationMessages,
  getCoachConversations,
  sendCoachMessage,
  transcribeCoachAudio,
  type CoachChatMessage,
  type CoachConversationSummary,
  type CoachMealPlan,
  type CoachWorkoutPlan,
} from "../services/aiCoach";
import { db } from "../services/firebase";
import { getTodayDateKey } from "../services/helperFunctions";
import type { MealType } from "../services/nutritionApi";
import { upsertLoggedFoodEntry, type LoggedFoodEntry } from "../services/nutritionLog";
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

const MAX_WORKOUT_EXERCISES = 16;
const MAX_MEAL_ITEMS = 8;
const MAX_PLAN_MEALS = 4;
const SIDEBAR_WIDTH = 312;
const WORKOUT_DEFAULTS = {
  secPerRep: 4,
  restBetweenSetsSec: 75,
  minSessionMin: 5,
};
const WORKOUT_INTENSITY: MetIntensity = "moderate";
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

function getUnknownErrorMessage(error: unknown, fallback: string) {
  const mapped = getUserFriendlyErrorMessage(error, "").trim();
  if (mapped) {
    return mapped;
  }

  const detail = error instanceof Error ? error.message.trim() : "";
  return detail || fallback;
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

function toNonNegativeNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10) / 10;
}

function normalizeMealType(value: unknown): MealType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "breakfast") return "breakfast";
  if (normalized === "lunch") return "lunch";
  if (normalized === "dinner") return "dinner";
  if (normalized === "snack" || normalized === "snacks") return "snacks";
  return null;
}

function normalizeWorkoutPlan(value: unknown): CoachWorkoutPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const bundle = value as { workoutPlan?: unknown };
  if (bundle.workoutPlan) {
    return normalizeWorkoutPlan(bundle.workoutPlan);
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

function normalizeMealPlan(value: unknown): CoachMealPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const bundle = value as { mealPlan?: unknown };
  if (bundle.mealPlan) {
    return normalizeMealPlan(bundle.mealPlan);
  }

  const raw = value as { title?: unknown; meals?: unknown };
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const mealsRaw = Array.isArray(raw.meals) ? raw.meals : [];
  const meals = mealsRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const data = entry as Record<string, unknown>;
      const mealType = normalizeMealType(data.mealType);
      const name = typeof data.name === "string" ? data.name.trim() : "";
      const items = Array.isArray(data.items)
        ? data.items
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
          .slice(0, MAX_MEAL_ITEMS)
        : [];

      if (!mealType || !name) {
        return null;
      }

      return {
        mealType,
        name,
        items,
        calories: toNonNegativeNumber(data.calories),
        protein: toNonNegativeNumber(data.protein),
        carbs: toNonNegativeNumber(data.carbs),
        fat: toNonNegativeNumber(data.fat),
        fiber: toNonNegativeNumber(data.fiber),
        sodiumMg: toNonNegativeNumber(data.sodiumMg),
        potassiumMg: toNonNegativeNumber(data.potassiumMg),
        calciumMg: toNonNegativeNumber(data.calciumMg),
        ironMg: toNonNegativeNumber(data.ironMg),
        vitaminCMg: toNonNegativeNumber(data.vitaminCMg),
      };
    })
    .filter((entry): entry is CoachMealPlan["meals"][number] => entry !== null)
    .slice(0, MAX_PLAN_MEALS);

  if (!title || meals.length === 0) {
    return null;
  }

  return { title, meals };
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

function parseMealPlanFromText(text: string): CoachMealPlan | null {
  const cleaned = extractJsonText(text);
  if (!cleaned) return null;

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    return normalizeMealPlan(parsed);
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

function buildMealSummary(plan: CoachMealPlan) {
  const count = plan.meals.length;
  const label = count === 1 ? "meal" : "meals";
  return `Meal plan ready: ${plan.title}. Tap "Log All Meals" or log an individual meal to add ${String(
    count,
  )} ${label}.`;
}

function buildCombinedPlanSummary(input: {
  workoutPlan?: CoachWorkoutPlan | null;
  mealPlan?: CoachMealPlan | null;
}) {
  const parts = [];
  if (input.workoutPlan) {
    parts.push(buildWorkoutSummary(input.workoutPlan));
  }
  if (input.mealPlan) {
    parts.push(buildMealSummary(input.mealPlan));
  }
  return parts.join(" ");
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

function getDisplayName(user: { displayName?: string | null; email?: string | null } | null | undefined) {
  const displayName = user?.displayName?.trim();
  if (displayName) {
    return displayName.split(/\s+/)[0] ?? displayName;
  }

  const emailName = user?.email?.split("@")[0]?.trim();
  return emailName || "there";
}

function formatConversationDate(value: string | null | undefined) {
  if (!value) {
    return "Recent";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recent";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function AICoachScreen() {
  const { showAlert } = useAppAlert();
  const { user } = useAuthUser();
  const navigation = useNavigation<BottomTabNavigationProp<HomeTabParamList>>();
  const chatScrollRef = useRef<ScrollView | null>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const coachAbortControllerRef = useRef<AbortController | null>(null);
  const coachRequestIdRef = useRef(0);
  const stoppedCoachRequestIdsRef = useRef<Set<number>>(new Set());
  const sidebarTranslateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;

  const { height: screenHeight } = useWindowDimensions();
  const sidebarSkeletonCount = Math.max(3, Math.floor(screenHeight / 72));

  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [conversations, setConversations] = useState<CoachConversationSummary[]>([]);
  const [messages, setMessages] = useState<CoachChatMessage[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingAssistantId, setPendingAssistantId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationListError, setConversationListError] = useState("");
  const [selectingConversationId, setSelectingConversationId] = useState<string | null>(null);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [loadingWorkoutMessageId, setLoadingWorkoutMessageId] = useState<string | null>(null);
  const [loadingMealAction, setLoadingMealAction] = useState<string | null>(null);
  const [profileForCalories, setProfileForCalories] = useState<UserMetProfile | null>(null);

  const [animatedTitle, setAnimatedTitle] = useState("");
  const [animatedSubtitle, setAnimatedSubtitle] = useState("");

  useEffect(() => {
    return () => {
      Speech.stop();
      coachAbortControllerRef.current?.abort();
    };
  }, []);

  const loadConversations = useCallback(async (quiet = false) => {
    if (!user?.uid) {
      setConversations([]);
      setConversationListError("");
      return;
    }

    if (!quiet) {
      setIsLoadingConversations(true);
    }

    setConversationListError("");

    try {
      const response = await getCoachConversations({ limit: 30 });
      setConversations(response.conversations);
    } catch (error) {
      setConversationListError(
        getUnknownErrorMessage(error, "Could not load saved Aether chats."),
      );
    } finally {
      if (!quiet) {
        setIsLoadingConversations(false);
      }
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setConversationId(undefined);
      setConversations([]);
      setMessages([]);
      return;
    }

    void loadConversations(true);
  }, [loadConversations, user?.uid]);

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
    return draftMessage.trim().length > 0 && !isSending && !isTranscribing;
  }, [draftMessage, isSending, isTranscribing]);

  const hasStartedChat = messages.length > 0 || isSending;
  const greetingName = getDisplayName(user);

  useFocusEffect(
    React.useCallback(() => {
      if (hasStartedChat) {
        return;
      }

      let mounted = true;

      setAnimatedTitle("");
      setAnimatedSubtitle("");

      const typeText = async (
        text: string,
        setter: React.Dispatch<React.SetStateAction<string>>,
        speed = 20
      ) => {
        for (let i = 0; i <= text.length; i++) {
          if (!mounted) return;

          setter(text.slice(0, i));

          await new Promise((resolve) => setTimeout(resolve, speed));
        }
      };

      const runAnimation = async () => {
        await typeText(`Hi, ${greetingName}`, setAnimatedTitle, 30);

        await new Promise((r) => setTimeout(r, 150));

        await typeText(
          "Where should we start today?",
          setAnimatedSubtitle,
          22
        );
      };

      runAnimation();

      return () => {
        mounted = false;
      };
    }, [hasStartedChat, greetingName])
  );

  const appendMessage = (message: CoachChatMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  const updateMessage = (messageId: string, patch: Partial<CoachChatMessage>) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
            ...message,
            ...patch,
          }
          : message,
      ),
    );
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
  };

  const openChatSidebar = () => {
    setIsSidebarVisible(true);
    void loadConversations();
    Animated.timing(sidebarTranslateX, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const closeChatSidebar = () => {
    Animated.timing(sidebarTranslateX, {
      toValue: -SIDEBAR_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setIsSidebarVisible(false);
      }
    });
  };

  const startNewConversation = () => {
    Speech.stop();
    setSpeakingMessageId(null);
    setConversationId(undefined);
    setMessages([]);
    setDraftMessage("");
    closeChatSidebar();
  };

  const handleSelectConversation = async (conversation: CoachConversationSummary) => {
    if (selectingConversationId || deletingConversationId) {
      return;
    }

    setSelectingConversationId(conversation.id);

    try {
      const response = await getCoachConversationMessages({
        conversationId: conversation.id,
        limit: 40,
      });

      Speech.stop();
      setSpeakingMessageId(null);
      setConversationId(response.conversationId);
      setMessages(response.messages);
      closeChatSidebar();
      scrollToBottom();
    } catch (error) {
      showAlert({
        title: "Could not open chat",
        message: getUnknownErrorMessage(error, "This Aether chat could not be loaded right now."),
      });
    } finally {
      setSelectingConversationId(null);
    }
  };

  const handleDeleteConversation = async (targetConversationId: string) => {
    if (deletingConversationId) {
      return;
    }

    setDeletingConversationId(targetConversationId);

    try {
      await deleteCoachConversation({ conversationId: targetConversationId });

      setConversations((prev) =>
        prev.filter((conversation) => conversation.id !== targetConversationId),
      );

      if (conversationId === targetConversationId) {
        Speech.stop();
        setSpeakingMessageId(null);
        setConversationId(undefined);
        setMessages([]);
        setDraftMessage("");
      }
    } catch (error) {
      showAlert({
        title: "Could not delete chat",
        message: getUnknownErrorMessage(error, "This Aether chat could not be deleted right now."),
      });
    } finally {
      setDeletingConversationId(null);
    }
  };

  const confirmDeleteConversation = (conversation: CoachConversationSummary) => {
    showAlert({
      title: "Delete chat?",
      message: "This removes the saved Aether conversation from your chat history.",
      actions: [
        { label: "Cancel", style: "secondary" },
        {
          label: "Delete",
          style: "primary",
          onPress: () => {
            handleDeleteConversation(conversation.id).catch(() => {
              // handled in handleDeleteConversation
            });
          },
        },
      ],
    });
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

  const startRecording = async () => {
    if (isRecording || isSending || isTranscribing) {
      return;
    }

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        showAlert({
          title: "Microphone permission needed",
          message: "Allow microphone access to dictate a message.",
        });
        return;
      }

      audioRecorder.record();
      setIsRecording(true);
    } catch (error) {
      showAlert({
        title: "Could not start recording",
        message: getUnknownErrorMessage(error, "Voice capture is unavailable right now."),
      });
    }
  };

  const stopRecordingAndTranscribe = async () => {
    if (!isRecording) {
      return;
    }

    setIsRecording(false);
    setIsTranscribing(true);

    try {
      audioRecorder.stop();
      const uri = audioRecorder.uri;

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

  const handleLoadMealPlan = async (
    plan: CoachMealPlan,
    messageId: string,
    mealIndex?: number,
  ) => {
    const actionKey = typeof mealIndex === "number" ? `${messageId}-${mealIndex}` : `${messageId}-ALL`;

    if (loadingMealAction) {
      return;
    }

    if (!user?.uid) {
      showAlert({
        title: "Sign-in required",
        message: "Please sign in to log meals.",
      });
      return;
    }

    const uid = user.uid;
    const mealsToLog =
      typeof mealIndex === "number" ? plan.meals.slice(mealIndex, mealIndex + 1) : plan.meals;

    if (!mealsToLog.length) {
      showAlert({
        title: "No meal selected",
        message: "Ask Aether to plan a meal again.",
      });
      return;
    }

    setLoadingMealAction(actionKey);
    const todayKey = getTodayDateKey();
    const baseTimeMs = Date.now();

    try {
      const entries: LoggedFoodEntry[] = mealsToLog.map((meal, index) => ({
        id: "entry-" + Date.now().toString() + "-" + Math.random().toString(36).slice(2, 8),
        mealType: meal.mealType,
        name: meal.name,
        source: "Manual",
        quantity: 1,
        unit: "serving",
        calories: toNonNegativeNumber(meal.calories),
        protein: toNonNegativeNumber(meal.protein),
        carbs: toNonNegativeNumber(meal.carbs),
        fat: toNonNegativeNumber(meal.fat),
        fiber: toNonNegativeNumber(meal.fiber),
        sodiumMg: toNonNegativeNumber(meal.sodiumMg),
        potassiumMg: toNonNegativeNumber(meal.potassiumMg),
        calciumMg: toNonNegativeNumber(meal.calciumMg),
        ironMg: toNonNegativeNumber(meal.ironMg),
        vitaminCMg: toNonNegativeNumber(meal.vitaminCMg),
        loggedAt: new Date(baseTimeMs + index * 1000).toISOString(),
      }));

      await Promise.all(entries.map((entry) => upsertLoggedFoodEntry(uid, todayKey, entry)));

      const isSingleMeal = entries.length === 1;
      showAlert({
        title: isSingleMeal ? "Meal logged" : "Meals logged",
        message: isSingleMeal
          ? `${entries[0].name} was added to ${MEAL_LABELS[entries[0].mealType]}.`
          : `Added ${String(entries.length)} planned meals to today's nutrition log.`,
      });

      navigation.navigate("Nutrition");
    } catch (error) {
      showAlert({
        title: "Meal log failed",
        message: getUnknownErrorMessage(
          error,
          "We couldn't log this meal plan right now. Please try again.",
        ),
      });
    } finally {
      setLoadingMealAction(null);
    }
  };

  const handleStopResponse = () => {
    if (!isSending) {
      return;
    }

    const activeRequestId = coachRequestIdRef.current;
    if (activeRequestId) {
      stoppedCoachRequestIdsRef.current.add(activeRequestId);
    }

    coachAbortControllerRef.current?.abort();
    setDraftMessage("");
    setIsSending(false);
    setPendingAssistantId(null);
  };

  const handleSend = async (inputText?: string) => {
    const messageText = (inputText ?? draftMessage).trim();
    const outboundPrompt = messageText;

    if (!outboundPrompt || isSending || isTranscribing) {
      return;
    }

    const userMessage: CoachChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: outboundPrompt,
      createdAt: new Date().toISOString(),
    };

    appendMessage(userMessage);
    setDraftMessage("");
    setIsSending(true);
    const coachRequestId = coachRequestIdRef.current + 1;
    coachRequestIdRef.current = coachRequestId;
    stoppedCoachRequestIdsRef.current.delete(coachRequestId);
    scrollToBottom();

    let assistantMessageId = "";

    try {
      assistantMessageId = `assistant-${Date.now()}`;
      appendMessage({
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      });
      setPendingAssistantId(assistantMessageId);

      const abortController = new AbortController();
      coachAbortControllerRef.current = abortController;
      const response = await sendCoachMessage({
        message: outboundPrompt,
        conversationId,
        includeAllHistory: true,
        signal: abortController.signal,
      });

      if (
        coachRequestIdRef.current !== coachRequestId ||
        stoppedCoachRequestIdsRef.current.has(coachRequestId)
      ) {
        return;
      }

      if (!conversationId) {
        setConversationId(response.conversationId);
      }

      const workoutPlan =
        response.workoutPlan ?? parseWorkoutPlanFromText(response.reply);
      const mealPlan =
        response.mealPlan ?? parseMealPlanFromText(response.reply);
      const cleanedReply = normalizeAssistantReply(response.reply);
      const assistantText =
        (workoutPlan || mealPlan) && (!cleanedReply || isLikelyJsonText(cleanedReply))
          ? buildCombinedPlanSummary({ workoutPlan, mealPlan })
          : cleanedReply;
      updateMessage(assistantMessageId, {
        content: assistantText,
        workoutPlan: workoutPlan ?? undefined,
        mealPlan: mealPlan ?? undefined,
      });

      void loadConversations(true);
      scrollToBottom();
    } catch (error) {
      if (stoppedCoachRequestIdsRef.current.has(coachRequestId)) {
        setMessages((prev) =>
          prev.filter((item) => item.id !== assistantMessageId || item.content.trim()),
        );
        return;
      }

      const message = getUnknownErrorMessage(
        error,
        "Aether could not respond right now. Please try again.",
      );

      showAlert({
        title: "Aether unavailable",
        message,
      });
      setMessages((prev) => prev.filter((item) => item.content || item.role !== "assistant"));
    } finally {
      stoppedCoachRequestIdsRef.current.delete(coachRequestId);
      if (coachRequestIdRef.current === coachRequestId) {
        coachAbortControllerRef.current = null;
        setIsSending(false);
        setPendingAssistantId(null);
      }
    }
  };

  const renderChatSidebar = () => (
    <Modal
      visible={isSidebarVisible}
      transparent
      animationType="none"
      onRequestClose={closeChatSidebar}
    >
      <View style={styles.sidebarModalRoot}>
        <Pressable style={styles.sidebarOverlay} onPress={closeChatSidebar} />
        <Animated.View
          style={[
            styles.sidebarPanel,
            { transform: [{ translateX: sidebarTranslateX }] },
          ]}
        >
          <View style={styles.sidebarHeader}>
            <View>
              <Text style={styles.sidebarTitle}>Chats</Text>
            </View>
            <Pressable style={styles.sidebarCloseButton} onPress={closeChatSidebar}>
              <X size={18} color={appTheme.colors.textPrimary} strokeWidth={2.2} />
            </Pressable>
          </View>

          <Pressable style={styles.newChatButton} onPress={startNewConversation}>
            <Plus size={17} color={appTheme.colors.onPrimary} strokeWidth={2.3} />
            <Text style={styles.newChatButtonText}>New chat</Text>
          </Pressable>

          {isLoadingConversations ? (
            <View style={styles.sidebarSkeletonList}>
              {Array.from({ length: sidebarSkeletonCount }).map((_, index) => (
                <View key={index} style={styles.sidebarSkeletonItem}>
                  <AppSkeleton width="72%" height={16} borderRadius={8} variant="activity" />
                  <AppSkeleton width="92%" height={12} borderRadius={8} variant="activity" />
                </View>
              ))}
            </View>
          ) : conversationListError ? (
            <View style={styles.sidebarState}>
              <Text style={styles.sidebarStateText}>{conversationListError}</Text>
              <Pressable
                style={styles.retryButton}
                onPress={() => {
                  loadConversations().catch(() => {
                    // handled in loadConversations
                  });
                }}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : conversations.length ? (
            <ScrollView
              style={styles.conversationList}
              contentContainerStyle={styles.conversationListContent}
              showsVerticalScrollIndicator={false}
            >
              {conversations.map((conversation) => {
                const isCurrent = conversation.id === conversationId;
                const isSelecting = selectingConversationId === conversation.id;
                const isDeleting = deletingConversationId === conversation.id;

                return (
                  <View
                    key={conversation.id}
                    style={[
                      styles.conversationItem,
                      isCurrent ? styles.conversationItemActive : null,
                    ]}
                  >
                    <Pressable
                      style={styles.conversationOpenArea}
                      onPress={() => {
                        handleSelectConversation(conversation).catch(() => {
                          // handled in handleSelectConversation
                        });
                      }}
                      disabled={Boolean(selectingConversationId || deletingConversationId)}
                    >
                      <View style={styles.conversationItemHeader}>
                        <Text
                          style={[
                            styles.conversationTitle,
                            isCurrent ? styles.conversationTitleActive : null,
                          ]}
                          numberOfLines={1}
                        >
                          {conversation.title || "Aether chat"}
                        </Text>
                        {isSelecting ? (
                          <ActivityIndicator size="small" color={appTheme.colors.primary} />
                        ) : (
                          <Text style={styles.conversationDate}>
                            {formatConversationDate(conversation.lastMessageAt)}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.conversationPreview} numberOfLines={2}>
                        {conversation.lastMessagePreview || "Open this conversation"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.conversationDeleteButton}
                      onPress={() => confirmDeleteConversation(conversation)}
                      disabled={Boolean(deletingConversationId)}
                      accessibilityRole="button"
                      accessibilityLabel="Delete saved chat"
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color={appTheme.colors.danger} />
                      ) : (
                        <Trash2 size={16} color={appTheme.colors.textMuted} strokeWidth={2.2} />
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.sidebarState}>
              <Text style={styles.sidebarStateText}>Your Aether chats will appear here.</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );

  const renderComposer = (variant: "center" | "bottom") => (
    <View style={[styles.composerWrap, variant === "center" ? styles.composerWrapCentered : null]}>
      <View style={styles.inputRow}>
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
            <Square size={16} color={appTheme.colors.onPrimary} strokeWidth={2.2} />
          ) : (
            <Mic size={18} color={appTheme.colors.textSecondary} strokeWidth={2.2} />
          )}
        </Pressable>

        <TextInput
          value={draftMessage}
          onChangeText={setDraftMessage}
          style={styles.input}
          placeholder="Message Aether"
          placeholderTextColor={appTheme.colors.textMuted}
          multiline
          editable={!isTranscribing}
          maxLength={1800}
        />

        <Pressable
          style={[
            styles.sendButton,
            !isSending && !canSend ? styles.sendButtonDisabled : null,
          ]}
          onPress={() => {
            if (isSending) {
              handleStopResponse();
              return;
            }
            handleSend().catch(() => {
              // handled in handleSend
            });
          }}
          disabled={!isSending && !canSend}
        >
          {isSending ? (
            <Square size={16} color={appTheme.colors.onPrimary} strokeWidth={2.4} />
          ) : (
            <SendHorizontal
              size={18}
              color={!canSend ? appTheme.colors.textMuted : appTheme.colors.onPrimary}
              strokeWidth={2.2}
            />
          )}
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={globalStyles.screen} edges={["top", "left", "right"]}>
      {renderChatSidebar()}
      <KeyboardAvoidingView
        style={styles.screenContent}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={styles.topBar}>
          <Pressable style={styles.menuButton} onPress={openChatSidebar}>
            <Menu size={22} color={appTheme.colors.textPrimary} strokeWidth={2.4} />
          </Pressable>

        </View>

        {!hasStartedChat ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyHeroText}>
              <Text style={styles.emptyTitle}>
                {animatedTitle}
              </Text>

              <Text style={styles.emptySubtitle}>
                {animatedSubtitle}
              </Text>
            </View>

            {renderComposer("center")}
            <Text style={styles.emptyHelper}>
              Ask for a workout, nutrition help, recovery advice, or a quick push to stay consistent.
            </Text>
          </View>
        ) : (
          <>
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
                const mealPlan = isAssistant ? message.mealPlan : undefined;

                if (workoutPlan || mealPlan) {
                  const isLoadingWorkoutPlan = loadingWorkoutMessageId === message.id;
                  const isAnyMealActionLoading = loadingMealAction !== null && loadingMealAction.startsWith(message.id);
                  const isAllMealsLoading = loadingMealAction === `${message.id}-ALL`;
                  const showSharedPlanReply = Boolean(workoutPlan && mealPlan && message.content);
                  const showCardSubtitle = Boolean(message.content && !showSharedPlanReply);

                  return (
                    <View key={message.id} style={[styles.messageRow, styles.assistantRow]}>
                      <View style={styles.planCardStack}>
                        {showSharedPlanReply ? (
                          <View style={[styles.messageBubble, styles.assistantBubble, styles.planStackCard]}>
                            <Text style={styles.messageText}>{message.content}</Text>
                          </View>
                        ) : null}

                        {workoutPlan ? (
                          <View style={[styles.workoutCard, styles.planStackCard]}>
                            <View style={styles.workoutCardHeader}>
                              <Text style={styles.workoutCardEyebrow}>Aether workout</Text>
                              <Text style={styles.workoutCardTitle}>{workoutPlan.title}</Text>
                              {showCardSubtitle ? (
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
                                title={isLoadingWorkoutPlan ? "Loading..." : "Load Workout to Today"}
                                onPress={() => {
                                  handleLoadWorkoutPlan(workoutPlan, message.id).catch(() => {
                                    // handled in handleLoadWorkoutPlan
                                  });
                                }}
                                loading={isLoadingWorkoutPlan}
                                disabled={isLoadingWorkoutPlan}
                              />
                            </View>
                          </View>
                        ) : null}

                        {mealPlan ? (
                          <View style={[styles.workoutCard, styles.planStackCard]}>
                            <View style={styles.workoutCardHeader}>
                              <Text style={styles.workoutCardEyebrow}>Aether meals</Text>
                              <Text style={styles.workoutCardTitle}>{mealPlan.title}</Text>
                              {showCardSubtitle ? (
                                <Text style={styles.workoutCardSubtitle}>{message.content}</Text>
                              ) : null}
                            </View>

                            <View style={styles.workoutExerciseList}>
                              {mealPlan.meals.map((meal, index) => {
                                const isLast = index === mealPlan.meals.length - 1;
                                const macroText = `${Math.round(meal.calories)} kcal | P ${meal.protein}g | C ${meal.carbs}g | F ${meal.fat}g`;
                                const isThisMealLoading = loadingMealAction === `${message.id}-${index}`;

                                return (
                                  <View
                                    key={`${meal.mealType}-${meal.name}-${String(index)}`}
                                    style={[
                                      styles.mealPlanRow,
                                      isLast ? { borderBottomWidth: 0, paddingBottom: 0 } : null,
                                    ]}
                                  >
                                    <View style={styles.mealPlanTextWrap}>
                                      <Text style={styles.workoutExerciseMeta}>
                                        {MEAL_LABELS[meal.mealType]}
                                      </Text>
                                      <Text style={styles.workoutExerciseName}>{meal.name}</Text>
                                      {meal.items.length ? (
                                        <Text style={styles.workoutCardSubtitle} numberOfLines={2}>
                                          {meal.items.join(", ")}
                                        </Text>
                                      ) : null}
                                      <Text style={styles.workoutExerciseMeta}>{macroText}</Text>
                                    </View>

                                    <Pressable
                                      style={[
                                        styles.mealLogButton,
                                        isAnyMealActionLoading ? styles.mealLogButtonDisabled : null,
                                      ]}
                                      disabled={isAnyMealActionLoading}
                                      onPress={() => {
                                        handleLoadMealPlan(mealPlan, message.id, index).catch(() => {
                                          // handled in handleLoadMealPlan
                                        });
                                      }}
                                    >
                                      {isThisMealLoading ? (
                                        <ActivityIndicator size="small" color={appTheme.colors.primary} />
                                      ) : (
                                        <Text style={styles.mealLogButtonText}>Log</Text>
                                      )}
                                    </Pressable>
                                  </View>
                                );
                              })}
                            </View>

                            <View style={styles.workoutCardFooter}>
                              <AppButton
                                title={isAllMealsLoading ? "Logging..." : "Log All Meals"}
                                onPress={() => {
                                  handleLoadMealPlan(mealPlan, message.id).catch(() => {
                                    // handled in handleLoadMealPlan
                                  });
                                }}
                                loading={isAllMealsLoading}
                                disabled={isAnyMealActionLoading}
                              />
                            </View>
                          </View>
                        ) : null}
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
                        isAssistant && pendingAssistantId === message.id
                          ? styles.thinkingBubble
                          : null,
                      ]}
                    >
                      {isAssistant && pendingAssistantId === message.id ? (
                        <>
                          <ActivityIndicator
                            size="small"
                            color={appTheme.colors.primary}
                          />
                          <Text style={styles.thinkingText}>
                            Aether is thinking...
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text
                            style={[
                              styles.messageText,
                              !isAssistant ? styles.userMessageText : null,
                            ]}
                          >
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
                                <VolumeX
                                  size={14}
                                  color={appTheme.colors.textSecondary}
                                  strokeWidth={2.2}
                                />
                              ) : (
                                <Volume2
                                  size={14}
                                  color={appTheme.colors.textSecondary}
                                  strokeWidth={2.2}
                                />
                              )}

                              <Text style={styles.speakMessageButtonText}>
                                {speakingMessageId === message.id
                                  ? "Stop"
                                  : "Speak"}
                              </Text>
                            </Pressable>
                          ) : null}
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {renderComposer("bottom")}
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
