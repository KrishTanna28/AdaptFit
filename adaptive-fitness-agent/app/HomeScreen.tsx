import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth/react-native";
import { doc, getDoc } from "firebase/firestore";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { Flame, Lightbulb, Droplets, Moon, X } from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import { useFocusEffect } from "@react-navigation/native";
import { loadDailyNutritionLog } from "../services/nutritionLog";
import { loadDailyWorkoutLog, type LoggedWorkoutEntry } from "../services/workoutLog";
import { getTodayDateKey } from "@/services/helperFunctions";
import { auth, db } from "../services/firebase";
import {
  calculateAdaptiveHydrationGoal,
  EMPTY_RECOVERY,
  EMPTY_WEATHER,
  loadDailyLifestyleLog,
  normalizeLifestyleLog,
  upsertDailyLifestyleLog,
  type DailyLifestyleLog,
  type RecoveryLog,
} from "../services/lifestyleLog";
import {
  buildDailyRanges,
  loadStepsForRanges,
  type StepHistoryPoint,
} from "../services/stepHistory";
import {
  getUserFriendlyErrorMessage,
  useAppAlert,
} from "../components/ui/AppAlert";
import AppButton from "../components/ui/AppButton";
import AppCard from "../components/ui/AppCard";
import AppSkeleton from "../components/ui/AppSkeleton";
import AppTextField from "../components/ui/AppTextField";
import type { LiveStepCounter } from "../hooks/useLiveStepCounter";
import { appTheme } from "../theme/designSystem";
import { globalStyles } from "../theme/globalStyles";
import StepsHistoryModal, { StepBarChart } from "./StepsHistoryModal";
import { styles } from "./HomeScreen.styles";

type HomeScreenProps = {
  user: User;
  liveStepCounter: LiveStepCounter;
  isSavingStepGoal: boolean;
  onUpdateDailyStepGoal: (goal: number) => Promise<void>;
};

const MIN_STEP_GOAL = 100;
const MAX_STEP_GOAL = 100000;
const STEP_GOAL_INCREMENT = 100;
const GOAL_ROW_HEIGHT = 44;
const STEPS_PROGRESS_THUMB_WIDTH = 48;
const QUICK_WATER_AMOUNTS = [250, 500, 750];
const RATING_OPTIONS = [1, 2, 3, 4, 5];
const STREAK_LOOKBACK_DAYS = 30;
const STEP_TREND_DAYS = 7;
const MINI_CHART_HEIGHT = 90;
const MINI_CHART_SPACING = 22;
const MINI_CHART_PADDING = 12;
const MINI_CHART_MIN_SPACING = 16;
const MINI_CHART_MAX_SPACING = 45;
const STEPS_RING_SIZE = 90;
const STEPS_RING_STROKE = 10;
const STEPS_RING_RADIUS = (STEPS_RING_SIZE - STEPS_RING_STROKE) / 2;
const STEPS_RING_CIRCUMFERENCE = 2 * Math.PI * STEPS_RING_RADIUS;

function normalizeGoalForPicker(goal: number) {
  return Math.min(
    MAX_STEP_GOAL,
    Math.max(MIN_STEP_GOAL, Math.round(goal / STEP_GOAL_INCREMENT) * STEP_GOAL_INCREMENT),
  );
}

function formatMl(value: number) {
  return Math.round(value).toLocaleString() + " ml";
}

function formatNumberInput(value: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(1).replace(/\.?0+$/, "");
}

function sanitizeDecimalInput(raw: string) {
  const normalized = raw.replace(",", ".").replace(/[^0-9.]/g, "");
  const firstDot = normalized.indexOf(".");
  if (firstDot < 0) {
    return normalized;
  }
  return normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, "");
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ".") {
    return null;
  }

  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseProfileWeight(rawProfile: unknown): number | null {
  if (!rawProfile || typeof rawProfile !== "object") {
    return null;
  }

  const value = Number((rawProfile as { weightKg?: unknown }).weightKg);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildRecentDateKeys(count: number, now = new Date()) {
  const out: string[] = [];
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);

  for (let offset = 0; offset < count; offset += 1) {
    const day = new Date(base);
    day.setDate(base.getDate() - offset);
    out.push(getTodayDateKey(day));
  }

  return out;
}

export default function HomeScreen({
  user,
  liveStepCounter,
  isSavingStepGoal,
  onUpdateDailyStepGoal,
}: HomeScreenProps) {
  const { showAlert } = useAppAlert();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isGoalModalVisible, setIsGoalModalVisible] = useState(false);
  const [selectedStepGoal, setSelectedStepGoal] = useState(
    normalizeGoalForPicker(liveStepCounter.goal),
  );
  const [hasPasswordLogin, setHasPasswordLogin] = useState(
    user.providerData.some((provider) => provider.providerId === "password"),
  );

  const hasGoogleLogin = useMemo(
    () => user.providerData.some((provider) => provider.providerId === "google.com"),
    [user.providerData],
  );
  const stepGoalOptions = useMemo(
    () =>
      Array.from(
        { length: Math.floor((MAX_STEP_GOAL - MIN_STEP_GOAL) / STEP_GOAL_INCREMENT) + 1 },
        (_, index) => MIN_STEP_GOAL + index * STEP_GOAL_INCREMENT,
      ),
    [],
  );

  const shouldShowPasswordSetup =
    hasGoogleLogin && !hasPasswordLogin && Boolean(user.email);

  const goalProgressPercent = Math.round(liveStepCounter.progress * 100);
  const goalProgressBarPercent = Math.min(Math.max(goalProgressPercent, 0), 100);
  const goalProgressBarWidth = `${goalProgressBarPercent}%` as `${number}%`;
  const goalProgressLabel = String(goalProgressPercent) + "%";
  const stepsRingStrokeOffset =
    STEPS_RING_CIRCUMFERENCE * (1 - goalProgressBarPercent / 100);
  const [stepsTrackWidth, setStepsTrackWidth] = useState(0);
  const progressThumbPosition = useRef(
    new Animated.Value(goalProgressBarPercent),
  ).current;

  useEffect(() => {
    Animated.spring(progressThumbPosition, {
      toValue: goalProgressBarPercent,
      damping: 16,
      stiffness: 140,
      mass: 0.7,
      useNativeDriver: false,
    }).start();
  }, [goalProgressBarPercent, progressThumbPosition]);

  const progressThumbTranslateX = progressThumbPosition.interpolate({
    inputRange: [0, 100],
    outputRange: [0, Math.max(stepsTrackWidth - STEPS_PROGRESS_THUMB_WIDTH, 0)],
    extrapolate: "clamp",
  });

  const stepCountText = liveStepCounter.stepsToday.toLocaleString();
  const stepGoalText = `/${liveStepCounter.goal.toLocaleString()} steps`;
  const currentGoalSelectionValue = normalizeGoalForPicker(liveStepCounter.goal);
  const isGoalUnchanged = selectedStepGoal === currentGoalSelectionValue;
  const selectedGoalIndex = Math.min(
    Math.max(Math.round((selectedStepGoal - MIN_STEP_GOAL) / STEP_GOAL_INCREMENT), 0),
    stepGoalOptions.length - 1,
  );
  const [caloriesIntake, setCaloriesIntake] = useState(0);
  const [workoutCaloriesBurned, setWorkoutCaloriesBurned] = useState(0);
  const [isLoadingCaloriesIntake, setIsLoadingCaloriesIntake] = useState(false);
  const [isLoadingLifestyle, setIsLoadingLifestyle] = useState(false);
  const [workoutEntries, setWorkoutEntries] = useState<LoggedWorkoutEntry[]>([]);
  const [profileWeightKg, setProfileWeightKg] = useState<number | null>(null);
  const [lifestyleLog, setLifestyleLog] = useState<DailyLifestyleLog | null>(null);
  const [workoutStreak, setWorkoutStreak] = useState(0);
  const [stepHistory, setStepHistory] = useState<StepHistoryPoint[]>([]);
  const [isLoadingStepHistory, setIsLoadingStepHistory] = useState(false);
  const [trendChartWidth, setTrendChartWidth] = useState(0);
  const [isStepsModalVisible, setIsStepsModalVisible] = useState(false);
  const [isHydrationModalVisible, setIsHydrationModalVisible] = useState(false);
  const [isSleepModalVisible, setIsSleepModalVisible] = useState(false);
  const [hydrationInput, setHydrationInput] = useState("0");
  const [sleepHoursInput, setSleepHoursInput] = useState("");
  const [sleepQualityInput, setSleepQualityInput] = useState<number | null>(null);
  const [isSavingHydration, setIsSavingHydration] = useState(false);
  const [isSavingSleep, setIsSavingSleep] = useState(false);

  const loadHomeMetrics = useCallback(async () => {
    setIsLoadingCaloriesIntake(true);
    setIsLoadingLifestyle(true);
    try {
      const todayKey = getTodayDateKey();
      const [nutritionLog, workoutLog, nextLifestyleLog, userSnapshot] = await Promise.all([
        loadDailyNutritionLog(user.uid, todayKey),
        loadDailyWorkoutLog(user.uid, todayKey),
        loadDailyLifestyleLog(user.uid, todayKey),
        getDoc(doc(db, "users", user.uid)),
      ]);

      const totalCalories = nutritionLog.entries.reduce((sum, entry) => {
        const value = Number(entry.calories);
        return Number.isFinite(value) ? sum + value : sum;
      }, 0);

      const totalWorkoutCalories = workoutLog.entries.reduce((sum, entry) => {
        const value = Number(entry.caloriesActive);
        return Number.isFinite(value) ? sum + Math.max(0, value) : sum;
      }, 0);

      setCaloriesIntake(Math.round(totalCalories));
      setWorkoutCaloriesBurned(Math.round(totalWorkoutCalories));
      setWorkoutEntries(workoutLog.entries);
      setLifestyleLog(nextLifestyleLog);
      setProfileWeightKg(parseProfileWeight(userSnapshot.data()?.profile));
    } catch (error) {
      setCaloriesIntake(0);
      setWorkoutCaloriesBurned(0);
      setWorkoutEntries([]);
      setLifestyleLog(null);
      setProfileWeightKg(null);
    } finally {
      setIsLoadingCaloriesIntake(false);
      setIsLoadingLifestyle(false);
    }
  }, [user.uid]);

  const loadWorkoutStreak = useCallback(async () => {
    try {
      const dateKeys = buildRecentDateKeys(STREAK_LOOKBACK_DAYS);
      const logs = await Promise.all(
        dateKeys.map((dateKey) =>
          loadDailyWorkoutLog(user.uid, dateKey).catch(() => null),
        ),
      );

      const logsToCount = logs[0] ? logs : logs.slice(1);

      let streak = 0;
      for (const log of logsToCount) {
        if (log && log.entries.length > 0) {
          streak += 1;
        } else {
          break;
        }
      }

      setWorkoutStreak(streak);
    } catch {
      setWorkoutStreak(0);
    }
  }, [user.uid]);

  const loadStepHistory = useCallback(async () => {
    setIsLoadingStepHistory(true);
    try {
      const ranges = buildDailyRanges({
        endDate: new Date(),
        count: STEP_TREND_DAYS,
        dailyGoal: liveStepCounter.goal,
      });
      const points = await loadStepsForRanges(ranges, { uid: user.uid });
      setStepHistory(points);
    } catch {
      setStepHistory([]);
    } finally {
      setIsLoadingStepHistory(false);
    }
  }, [liveStepCounter.goal, user.uid]);

  const totalCaloriesBurned = liveStepCounter.caloriesBurned + workoutCaloriesBurned;

  useFocusEffect(
    useCallback(() => {
      loadHomeMetrics().catch(() => {
        setIsLoadingCaloriesIntake(false);
        setIsLoadingLifestyle(false);
      });
      loadWorkoutStreak().catch(() => {
        setWorkoutStreak(0);
      });
      loadStepHistory().catch(() => {
        setIsLoadingStepHistory(false);
      });
    }, [loadHomeMetrics, loadStepHistory, loadWorkoutStreak])
  );

  useEffect(() => {
    if (isGoalModalVisible) {
      setSelectedStepGoal(currentGoalSelectionValue);
    }
  }, [isGoalModalVisible, currentGoalSelectionValue]);

  const hydrationGoal = useMemo(
    () =>
      calculateAdaptiveHydrationGoal({
        weightKg: profileWeightKg,
        workouts: workoutEntries,
        weather: lifestyleLog?.weather ?? EMPTY_WEATHER,
      }),
    [lifestyleLog?.weather, profileWeightKg, workoutEntries],
  );

  const currentWaterMl = lifestyleLog?.hydration.intakeMl ?? 0;
  const hydrationProgressPercent = hydrationGoal.goalMl > 0
    ? Math.min(100, Math.round((currentWaterMl / hydrationGoal.goalMl) * 100))
    : 0;
  const hydrationProgressWidth = `${hydrationProgressPercent}%` as `${number}%`;
  const hydrationRemainingMl = Math.max(0, hydrationGoal.goalMl - currentWaterMl);

  const sleepHours = lifestyleLog?.recovery.sleepHours ?? null;
  const sleepQuality = lifestyleLog?.recovery.sleepQuality ?? null;
  const sleepSummary = sleepHours === null ? "Not logged" : `${formatNumberInput(sleepHours)} h`;
  const sleepProgressPercent =
    typeof sleepHours === "number" ? Math.min(100, Math.round((sleepHours / 8) * 100)) : 0;
  const sleepProgressWidth = `${sleepProgressPercent}%` as `${number}%`;

  const stepTrendPoints = useMemo(
    () =>
      stepHistory
        .slice()
        .reverse()
        .map((point) => ({
          steps: point.steps,
          isGoalMet: point.isGoalMet,
          target: point.target,
        })),
    [stepHistory],
  );
  const stepTrendLabels = useMemo(
    () => stepHistory.slice().reverse().map((point) => point.label),
    [stepHistory],
  );
  const stepTrendWidth = useMemo(() => {
    const pointCount = Math.max(1, stepTrendPoints.length);
    const dataWidth = MINI_CHART_PADDING * 2 + (pointCount - 1) * MINI_CHART_SPACING;
    const minWidth = Math.max(160, dataWidth);
    return trendChartWidth > 0 ? trendChartWidth : minWidth;
  }, [stepTrendPoints.length, trendChartWidth]);
  const stepTrendSpacing = useMemo(() => {
    const pointCount = Math.max(1, stepTrendPoints.length);
    if (pointCount <= 1) {
      return MINI_CHART_SPACING;
    }

    const available = Math.max(0, stepTrendWidth - MINI_CHART_PADDING * 2);
    const stretched = available / (pointCount - 1);
    return Math.min(MINI_CHART_MAX_SPACING, Math.max(MINI_CHART_MIN_SPACING, stretched));
  }, [stepTrendPoints.length, stepTrendWidth]);
  const stepTrendLabelWidth = Math.max(14, Math.round(stepTrendSpacing));

  useEffect(() => {
    if (isHydrationModalVisible) {
      setHydrationInput(String(currentWaterMl));
    }
  }, [currentWaterMl, isHydrationModalVisible]);

  useEffect(() => {
    if (isSleepModalVisible) {
      setSleepHoursInput(formatNumberInput(sleepHours));
      setSleepQualityInput(sleepQuality ?? null);
    }
  }, [isSleepModalVisible, sleepHours, sleepQuality]);

  const handleSaveGoal = async () => {
    if (isGoalUnchanged) {
      setIsGoalModalVisible(false);
      return;
    }

    try {
      await onUpdateDailyStepGoal(selectedStepGoal);
      setIsGoalModalVisible(false);
    } catch (error) {
      const message = getUserFriendlyErrorMessage(
        error,
        "We couldn't update your daily goal right now. Please try again.",
      );

      showAlert({
        title: "Couldn't update goal",
        message,
      });
    }
  };

  const saveHydration = async (nextIntakeMl: number) => {
    const intakeMl = Math.max(0, Math.round(nextIntakeMl));
    const todayKey = getTodayDateKey();

    setIsSavingHydration(true);
    try {
      await upsertDailyLifestyleLog(user.uid, todayKey, {
        hydration: {
          intakeMl,
          goalMl: hydrationGoal.goalMl,
          updatedAt: new Date().toISOString(),
        },
      });
      setLifestyleLog((prev) =>
        normalizeLifestyleLog(
          {
            ...(prev ?? {}),
            hydration: {
              intakeMl,
              goalMl: hydrationGoal.goalMl,
              updatedAt: new Date().toISOString(),
            },
          },
          todayKey,
        ),
      );
      setHydrationInput(String(intakeMl));
    } finally {
      setIsSavingHydration(false);
    }
  };

  const handleAddWater = async (amountMl: number) => {
    try {
      const base = parseOptionalNumber(hydrationInput) ?? currentWaterMl;
      await saveHydration(base + amountMl);
    } catch (error) {
      showAlert({
        title: "Could not update water",
        message: getUserFriendlyErrorMessage(
          error,
          "Please try again in a moment.",
        ),
      });
    }
  };

  const handleSaveHydration = async () => {
    try {
      const next = parseOptionalNumber(hydrationInput) ?? 0;
      await saveHydration(next);
      setIsHydrationModalVisible(false);
    } catch (error) {
      showAlert({
        title: "Could not save hydration",
        message: getUserFriendlyErrorMessage(
          error,
          "Please try again in a moment.",
        ),
      });
    }
  };

  const handleSaveSleep = async () => {
    try {
      const sleepHoursValue = parseOptionalNumber(sleepHoursInput);

      if (sleepHoursValue !== null && (sleepHoursValue < 0 || sleepHoursValue > 24)) {
        showAlert({
          title: "Invalid sleep hours",
          message: "Sleep hours must be between 0 and 24.",
        });
        return;
      }

      const todayKey = getTodayDateKey();
      const recovery: RecoveryLog = {
        ...(lifestyleLog?.recovery ?? EMPTY_RECOVERY),
        sleepHours: sleepHoursValue,
        sleepQuality: sleepQualityInput,
        loggedAt: new Date().toISOString(),
      };

      setIsSavingSleep(true);
      try {
        await upsertDailyLifestyleLog(user.uid, todayKey, { recovery });
        setLifestyleLog((prev) =>
          normalizeLifestyleLog({ ...(prev ?? {}), recovery }, todayKey),
        );
        setIsSleepModalVisible(false);
      } finally {
        setIsSavingSleep(false);
      }
    } catch (error) {
      showAlert({
        title: "Could not save sleep",
        message: getUserFriendlyErrorMessage(
          error,
          "Please try again in a moment.",
        ),
      });
    }
  };

  const linkEmailPassword = async (password: string) => {
    const currentUser = auth.currentUser;

    if (!currentUser?.email) {
      throw new Error("Email not available.");
    }

    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await linkWithCredential(currentUser, credential);
  };

  const reauthenticateGoogleUser = async () => {
    await GoogleSignin.hasPlayServices();

    let googleResult;

    try {
      googleResult = await GoogleSignin.signInSilently();
    } catch {
      googleResult = await GoogleSignin.signIn();
    }

    const idToken = googleResult.data?.idToken;

    if (!idToken || !auth.currentUser) {
      throw new Error("We couldn't verify your Google account. Please try again.");
    }

    const googleCredential = GoogleAuthProvider.credential(idToken);
    await reauthenticateWithCredential(auth.currentUser, googleCredential);
  };

  const handleAddPassword = async () => {
    if (!user.email) {
      showAlert({
        title: "Email not available",
        message: "We couldn't find an email for this account.",
      });
      return;
    }

    if (newPassword.length < 6) {
      showAlert({
        title: "Choose a stronger password",
        message: "Your password should be at least 6 characters long.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      showAlert({
        title: "Passwords don't match",
        message: "Please make sure both password fields are the same.",
      });
      return;
    }

    try {
      setIsSavingPassword(true);

      try {
        await linkEmailPassword(newPassword);
      } catch (error) {
        const needsRecentLogin =
          error instanceof Error &&
          /requires-recent-login|recent login/i.test(error.message);

        if (!needsRecentLogin) {
          throw error;
        }

        await reauthenticateGoogleUser();
        await linkEmailPassword(newPassword);
      }

      setHasPasswordLogin(true);
      setNewPassword("");
      setConfirmPassword("");

      showAlert({
        title: "Password added",
        message:
          "You can now sign in with either Google or your email and password.",
      });
    } catch (error) {
      const message = getUserFriendlyErrorMessage(
        error,
        "We couldn't add a password right now. Please try again.",
      );

      showAlert({
        title: "Couldn't add password",
        message,
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <SafeAreaView style={globalStyles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <AppCard style={styles.profileCard}>
            <Text style={styles.sectionLabel}>Welcome {user.displayName || "back"}!</Text>
          </AppCard>

          <Pressable
            onPress={() => setIsGoalModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Change daily step goal"
          >
            <AppCard style={styles.stepsCard}>
              <View style={styles.stepsRow}>
                <View style={styles.stepsInfo}>
                  {liveStepCounter.isLoading ? (
                    <View style={styles.stepsSkeletonWrap}>
                      <AppSkeleton width={156} height={42} borderRadius={12} variant="home" />
                      <AppSkeleton width={124} height={16} borderRadius={8} variant="home" />
                    </View>
                  ) : (
                    <Text style={styles.stepsValue}>{stepCountText}</Text>
                  )}
                  {!liveStepCounter.isLoading ? (
                    <View>
                      <Text style={styles.metricLabel}>{stepGoalText}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.stepsProgressWrap}>
                  {liveStepCounter.isLoading ? (
                    <AppSkeleton width={STEPS_RING_SIZE} height={STEPS_RING_SIZE} borderRadius={999} variant="home" />
                  ) : (
                    <>
                      <Svg width={STEPS_RING_SIZE} height={STEPS_RING_SIZE}>
                        <Circle
                          cx={STEPS_RING_SIZE / 2}
                          cy={STEPS_RING_SIZE / 2}
                          r={STEPS_RING_RADIUS}
                          stroke={appTheme.colors.border}
                          strokeWidth={STEPS_RING_STROKE}
                          fill={appTheme.colors.transparent}
                        />
                        <Circle
                          cx={STEPS_RING_SIZE / 2}
                          cy={STEPS_RING_SIZE / 2}
                          r={STEPS_RING_RADIUS}
                          stroke={appTheme.colors.primary}
                          strokeWidth={STEPS_RING_STROKE}
                          fill={appTheme.colors.transparent}
                          strokeLinecap="round"
                          strokeDasharray={`${STEPS_RING_CIRCUMFERENCE} ${STEPS_RING_CIRCUMFERENCE}`}
                          strokeDashoffset={stepsRingStrokeOffset}
                          rotation="-90"
                          originX={STEPS_RING_SIZE / 2}
                          originY={STEPS_RING_SIZE / 2}
                        />
                      </Svg>
                      <View style={styles.ringCenter}>
                        <Text style={styles.ringPercentText}>{goalProgressLabel}</Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            </AppCard>
          </Pressable>

          <AppCard style={styles.metricsCard}>
            <View style={styles.summaryHeaderRow}>
              <Text style={styles.metricsTitle}>Today's summary</Text>
              <View style={styles.streakPill}>
                <Flame size={14} color={appTheme.colors.primary} strokeWidth={2.2} />
                <Text style={styles.streakText}>{String(workoutStreak)}</Text>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{stepCountText}</Text>
                <Text style={styles.metricLabel}>Steps today</Text>
              </View>
              <View style={[styles.metricItem, styles.metricItemDivider]}>
                <Text style={styles.metricValue}>
                  {isLoadingCaloriesIntake ? 0 : totalCaloriesBurned} kcal
                </Text>
                <Text style={styles.metricLabel}>Calories burned</Text>
              </View>
              <View style={[styles.metricItem, styles.metricItemDivider]}>
                <Text style={styles.metricValue}>
                  {isLoadingCaloriesIntake ? 0 : caloriesIntake}
                </Text>
                <Text style={styles.metricLabel}>Calories consumed</Text>
              </View>
            </View>
          </AppCard>

          <View style={styles.lifestyleRow}>
            <Pressable
              onPress={() => setIsHydrationModalVisible(true)}
              disabled={isLoadingLifestyle}
              accessibilityRole="button"
              accessibilityLabel="Log water intake"
              style={styles.lifestylePressable}
            >
              <AppCard style={styles.lifestyleCard}>
                <View style={styles.lifestyleHeaderRow}>
                  <Droplets size={16} color={appTheme.colors.accent} strokeWidth={2.2} />
                  <Text style={styles.lifestyleTitle}>Water</Text>
                </View>
                <Text style={styles.lifestyleValue}>
                  {isLoadingLifestyle ? "--" : formatMl(currentWaterMl)}
                </Text>
                <Text style={styles.lifestyleMeta}>
                  Goal {formatMl(hydrationGoal.goalMl)} · {String(hydrationProgressPercent)}%
                </Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: hydrationProgressWidth }]} />
                </View>
              </AppCard>
            </Pressable>

            <Pressable
              onPress={() => setIsSleepModalVisible(true)}
              disabled={isLoadingLifestyle}
              accessibilityRole="button"
              accessibilityLabel="Log sleep"
              style={styles.lifestylePressable}
            >
              <AppCard style={styles.lifestyleCard}>
                <View style={styles.lifestyleHeaderRow}>
                  <Moon size={16} color={appTheme.colors.primary} strokeWidth={2.2} />
                  <Text style={styles.lifestyleTitle}>Sleep</Text>
                </View>
                <Text style={styles.lifestyleValue}>
                  {isLoadingLifestyle ? "Loading..." : sleepSummary}
                </Text>
                <Text style={styles.lifestyleMeta}>
                  Quality {sleepQuality ?? "-"}
                </Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: sleepProgressWidth }]} />
                </View>
              </AppCard>
            </Pressable>
          </View>

          
            <AppCard style={styles.trendCard}>
              <View style={styles.trendHeaderRow}>
                <Text style={styles.trendTitle}>Steps trend</Text>
                <Pressable
            onPress={() => setIsStepsModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open steps trend chart"
          ><Text style={styles.trendMeta}>View History</Text></Pressable>
              </View>

              <View
                style={styles.trendChartWrap}
                onLayout={({ nativeEvent }) => {
                  const nextWidth = Math.round(nativeEvent.layout.width);
                  if (nextWidth > 0 && nextWidth !== trendChartWidth) {
                    setTrendChartWidth(nextWidth);
                  }
                }}
              >
                {isLoadingStepHistory ? (
                  <AppSkeleton width={stepTrendWidth} height={MINI_CHART_HEIGHT} borderRadius={16} variant="home" />
                ) : stepTrendPoints.length > 0 ? (
                  <View style={{ width: stepTrendWidth }}>
                    <StepBarChart
                      points={stepTrendPoints}
                      width={stepTrendWidth}
                      height={MINI_CHART_HEIGHT}
                      goalLineValue={liveStepCounter.goal}
                      pointSpacing={stepTrendSpacing}
                      padding={MINI_CHART_PADDING}
                    />
                    {stepTrendLabels.length > 0 ? (
                      <View
                        style={[
                          styles.trendLabelsRow,
                          {
                            width: stepTrendWidth,
                            paddingHorizontal: MINI_CHART_PADDING,
                            position: "relative",
                            minHeight: 16,
                          },
                        ]}
                      >
                        {stepTrendLabels.map((label, index) => {
                          const baseLeft =
                            MINI_CHART_PADDING + index * stepTrendSpacing - stepTrendLabelWidth / 2;
                          const maxLeft = Math.max(0, stepTrendWidth - stepTrendLabelWidth);
                          const clampedLeft = Math.min(Math.max(baseLeft, 0), maxLeft);

                          return (
                            <Text
                              key={`trend-label-${label}-${index}`}
                              style={[
                                styles.trendLabel,
                                { width: stepTrendLabelWidth, left: clampedLeft, position: "absolute" },
                              ]}
                              numberOfLines={1}
                            >
                              {label}
                            </Text>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>Step history will appear once available.</Text>
                )}
              </View>
            </AppCard>

          {shouldShowPasswordSetup ? (
            <AppCard style={styles.passwordCard}>
              <Text style={styles.passwordTitle}>Add password</Text>
              <Text style={styles.passwordSubtitle}>
                Add a password once so you can also log in later with email and
                password, not only Google.
              </Text>

              <AppTextField
                label="New password"
                placeholder="Create a password"
                value={newPassword}
                onChangeText={setNewPassword}
                isPasswordField
              />

              <AppTextField
                label="Confirm password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                isPasswordField
              />

              <AppButton
                title="Save password"
                variant="secondary"
                onPress={handleAddPassword}
                loading={isSavingPassword}
                disabled={isSavingPassword}
              />
            </AppCard>
          ) : null}
        </View>
      </ScrollView>

      <StepsHistoryModal
        visible={isStepsModalVisible}
        onClose={() => setIsStepsModalVisible(false)}
        dailyGoal={liveStepCounter.goal}
        userId={user.uid}
      />

      <Modal
        animationType="fade"
        transparent
        visible={isHydrationModalVisible}
        onRequestClose={() => {
          if (!isSavingHydration) {
            setIsHydrationModalVisible(false);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissLayer}
            onPress={() => {
              if (!isSavingHydration) {
                setIsHydrationModalVisible(false);
              }
            }}
          />

          <View style={styles.sheetCard}>
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetHeaderText}>
                <Text style={styles.sheetTitle}>Water intake</Text>
                <Text style={styles.sheetSubtitle}>Goal adapts to workouts and weather.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close water log"
                onPress={() => {
                  if (!isSavingHydration) {
                    setIsHydrationModalVisible(false);
                  }
                }}
                disabled={isSavingHydration}
                style={styles.sheetCloseButton}
              >
                <X size={18} color={appTheme.colors.textSecondary} strokeWidth={2.2} />
              </Pressable>
            </View>

            <View style={styles.sheetMetricsGrid}>
              <View style={styles.sheetMetricItem}>
                <Text style={styles.sheetMetricValue}>{formatMl(currentWaterMl)}</Text>
                <Text style={styles.sheetMetricLabel}>Logged</Text>
              </View>
              <View style={styles.sheetMetricItem}>
                <Text style={styles.sheetMetricValue}>{formatMl(hydrationGoal.goalMl)}</Text>
                <Text style={styles.sheetMetricLabel}>Goal</Text>
              </View>
              <View style={styles.sheetMetricItem}>
                <Text style={styles.sheetMetricValue}>{formatMl(hydrationRemainingMl)}</Text>
                <Text style={styles.sheetMetricLabel}>Remaining</Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: hydrationProgressWidth }]} />
            </View>

            <View style={styles.quickButtonRow}>
              {QUICK_WATER_AMOUNTS.map((amount) => (
                <Pressable
                  key={amount}
                  style={styles.quickButton}
                  onPress={() => {
                    void handleAddWater(amount);
                  }}
                  disabled={isSavingHydration}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${String(amount)} ml water`}
                >
                  <Text style={styles.quickButtonText}>{String(amount)} ml</Text>
                </Pressable>
              ))}
            </View>

            <AppTextField
              label="Total water today (ml)"
              placeholder="Example: 1800"
              value={hydrationInput}
              onChangeText={(value) => setHydrationInput(sanitizeDecimalInput(value))}
              keyboardType="decimal-pad"
              editable={!isSavingHydration}
            />

            <AppButton
              title={isSavingHydration ? "Saving..." : "Save Hydration"}
              onPress={() => {
                void handleSaveHydration();
              }}
              loading={isSavingHydration}
              disabled={isSavingHydration}
            />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={isSleepModalVisible}
        onRequestClose={() => {
          if (!isSavingSleep) {
            setIsSleepModalVisible(false);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissLayer}
            onPress={() => {
              if (!isSavingSleep) {
                setIsSleepModalVisible(false);
              }
            }}
          />

          <View style={styles.sheetCard}>
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetHeaderText}>
                <Text style={styles.sheetTitle}>Sleep log</Text>
                <Text style={styles.sheetSubtitle}>Track recovery so Drona can coach better.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close sleep log"
                onPress={() => {
                  if (!isSavingSleep) {
                    setIsSleepModalVisible(false);
                  }
                }}
                disabled={isSavingSleep}
                style={styles.sheetCloseButton}
              >
                <X size={18} color={appTheme.colors.textSecondary} strokeWidth={2.2} />
              </Pressable>
            </View>

            <AppTextField
              label="Sleep hours"
              placeholder="Example: 7.5"
              value={sleepHoursInput}
              onChangeText={(value) => setSleepHoursInput(sanitizeDecimalInput(value))}
              keyboardType="decimal-pad"
              editable={!isSavingSleep}
            />

            <Text style={styles.helperText}>Sleep quality</Text>
            <View style={styles.chipRow}>
              {RATING_OPTIONS.map((rating) => {
                const active = sleepQualityInput === rating;
                return (
                  <Pressable
                    key={`sleep-${rating}`}
                    style={[styles.chip, active ? styles.chipActive : null]}
                    onPress={() => setSleepQualityInput(active ? null : rating)}
                    disabled={isSavingSleep}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                      {String(rating)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <AppButton
              title={isSavingSleep ? "Saving..." : "Save Sleep"}
              onPress={() => {
                void handleSaveSleep();
              }}
              loading={isSavingSleep}
              disabled={isSavingSleep}
            />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={isGoalModalVisible}
        onRequestClose={() => {
          if (!isSavingStepGoal) {
            setIsGoalModalVisible(false);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissLayer}
            onPress={() => {
              if (!isSavingStepGoal) {
                setIsGoalModalVisible(false);
              }
            }}
          />

          <View style={styles.goalModalCard}>
            <Text style={styles.goalModalTitle}>Choose your daily step goal</Text>

            <View style={styles.goalListContainer}>
              <FlatList
                data={stepGoalOptions}
                keyExtractor={(goal) => String(goal)}
                contentContainerStyle={styles.goalListContent}
                showsVerticalScrollIndicator
                initialScrollIndex={selectedGoalIndex}
                getItemLayout={(_data, index) => ({
                  length: GOAL_ROW_HEIGHT,
                  offset: GOAL_ROW_HEIGHT * index,
                  index,
                })}
                renderItem={({ item: goal }) => {
                  const isSelected = goal === selectedStepGoal;

                  return (
                    <Pressable
                      style={[
                        styles.goalListItem,
                        isSelected ? styles.goalListItemSelected : null,
                      ]}
                      onPress={() => {
                        setSelectedStepGoal(goal);
                      }}
                      disabled={isSavingStepGoal}
                    >
                      <Text
                        style={[
                          styles.goalListItemText,
                          isSelected ? styles.goalListItemTextSelected : null,
                        ]}
                      >
                        {goal.toLocaleString()} steps
                      </Text>
                    </Pressable>
                  );
                }}
              />
            </View>

            <View style={styles.goalModalActionsRow}>
              <Pressable
                style={styles.goalModalCloseButton}
                onPress={() => setIsGoalModalVisible(false)}
                disabled={isSavingStepGoal}
              >
                <Text style={styles.goalModalCloseText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.goalModalSaveButton,
                  isSavingStepGoal || isGoalUnchanged
                    ? styles.goalModalSaveButtonDisabled
                    : null,
                ]}
                onPress={() => {
                  handleSaveGoal().catch(() => {
                    // handled in handleSaveGoal
                  });
                }}
                disabled={isSavingStepGoal || isGoalUnchanged}
              >
                <Text style={styles.goalModalSaveText}>
                  {isSavingStepGoal ? "Saving..." : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
