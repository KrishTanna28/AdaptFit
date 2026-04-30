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
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { Pizza, Flame, Lightbulb, Target } from "lucide-react-native";
import { useFocusEffect } from "@react-navigation/native";
import { loadDailyNutritionLog } from "../services/nutritionLog";
import { loadDailyWorkoutLog } from "../services/workoutLog";
import { getTodayDateKey } from "@/services/helperFunctions";
import { auth } from "../services/firebase";
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

function normalizeGoalForPicker(goal: number) {
  return Math.min(
    MAX_STEP_GOAL,
    Math.max(MIN_STEP_GOAL, Math.round(goal / STEP_GOAL_INCREMENT) * STEP_GOAL_INCREMENT),
  );
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
  const suggestionText =
    liveStepCounter.remainingSteps > 0
      ? `Walk ${liveStepCounter.remainingSteps.toLocaleString()} more steps to reach your goal.`
      : "Daily goal reached. Great consistency today.";
  const currentGoalSelectionValue = normalizeGoalForPicker(liveStepCounter.goal);
  const isGoalUnchanged = selectedStepGoal === currentGoalSelectionValue;
  const selectedGoalIndex = Math.min(
    Math.max(Math.round((selectedStepGoal - MIN_STEP_GOAL) / STEP_GOAL_INCREMENT), 0),
    stepGoalOptions.length - 1,
  );
  const [caloriesIntake, setCaloriesIntake] = useState(0);
  const [workoutCaloriesBurned, setWorkoutCaloriesBurned] = useState(0);
  const [isLoadingCaloriesIntake, setIsLoadingCaloriesIntake] = useState(false);
  const loadCaloriesIntake = useCallback(async () => {
    setIsLoadingCaloriesIntake(true);
    try {
      const todayKey = getTodayDateKey();
      const [nutritionLog, workoutLog] = await Promise.all([
        loadDailyNutritionLog(user.uid, todayKey),
        loadDailyWorkoutLog(user.uid, todayKey),
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
    } catch (error) {
      setCaloriesIntake(0);
      setWorkoutCaloriesBurned(0);
    } finally {
      setIsLoadingCaloriesIntake(false);
    }
  }, [user.uid]);

  const totalCaloriesBurned = liveStepCounter.caloriesBurned + workoutCaloriesBurned;

  useFocusEffect(
    useCallback(() => {
      loadCaloriesIntake().catch(() => {
        setIsLoadingCaloriesIntake(false);
      });
    }, [loadCaloriesIntake])
  );

  useEffect(() => {
    if (isGoalModalVisible) {
      setSelectedStepGoal(currentGoalSelectionValue);
    }
  }, [isGoalModalVisible, currentGoalSelectionValue]);

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
                  <View
                    style={styles.stepsProgressIndicatorWrap}
                    onLayout={({ nativeEvent }) => {
                      setStepsTrackWidth(nativeEvent.layout.width);
                    }}
                  >
                    <View style={styles.progressTrack}>
                      {liveStepCounter.isLoading ? (
                        <AppSkeleton width="56%" height={10} borderRadius={999} variant="home" />
                      ) : (
                        <View style={[styles.progressFill, { width: goalProgressBarWidth }]} />
                      )}
                    </View>

                    {liveStepCounter.isLoading ? (
                      <AppSkeleton width={48} height={24} borderRadius={999} variant="home" />
                    ) : (
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.progressThumb,
                          { transform: [{ translateX: progressThumbTranslateX }] },
                        ]}
                      >
                        <Text style={styles.progressThumbText}>{goalProgressLabel}</Text>
                      </Animated.View>
                    )}
                  </View>
                </View>
              </View>
            </AppCard>
          </Pressable>

          <AppCard style={styles.metricsCard}>
            <Text style={styles.metricsTitle}>Daily snapshot</Text>
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <View style={styles.metricValueRow}>
                  <Flame size={18} color={appTheme.colors.text} strokeWidth={2.2} />
                  <Text style={styles.metricValue}>
                    {isLoadingCaloriesIntake ? 0 : totalCaloriesBurned} kcal
                  </Text>
                </View>
                <Text style={styles.metricLabel}>Calories burned</Text>
              </View>

              <View style={styles.metricItem}>
                <View style={styles.metricValueRow}>
                  <Pizza size={18} color={appTheme.colors.text} strokeWidth={2.2} />
                  <Text style={styles.metricValue}>{isLoadingCaloriesIntake ? 0 : caloriesIntake}</Text>
                </View>
                <Text style={styles.metricLabel}>Calories consumed</Text>
              </View>
            </View>
          </AppCard>

          <AppCard style={styles.suggestionCard}>
            <View style={styles.suggestionLabelRow}>
              <Lightbulb size={16} color={appTheme.colors.mutedText} strokeWidth={2.2} />
              <Text style={styles.suggestionLabel}>AI Suggestion</Text>
            </View>
            <Text style={styles.suggestionText}>{suggestionText}</Text>
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
                placeholderTextColor="#736A6A"
                value={newPassword}
                onChangeText={setNewPassword}
                isPasswordField
              />

              <AppTextField
                label="Confirm password"
                placeholder="Re-enter your password"
                placeholderTextColor="#736A6A"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                isPasswordField
              />

              <AppButton
                title="Save password"
                onPress={handleAddPassword}
                loading={isSavingPassword}
                disabled={isSavingPassword}
              />
            </AppCard>
          ) : null}
        </View>
      </ScrollView>

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
