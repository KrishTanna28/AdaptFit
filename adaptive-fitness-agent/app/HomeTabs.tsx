import React, { useCallback, useEffect, useRef, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { User } from "firebase/auth/react-native";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Pizza, Dumbbell, House, BrainCircuit, User as UserIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AICoachScreen from "./AICoachScreen";
import HomeScreen from "./HomeScreen";
import NutritionScreen from "./NutritionScreen";
import ProfileScreen from "./ProfileScreen";
import WorkoutScreen from "./WorkoutScreen";
import useLiveStepCounter, { DAILY_STEP_GOAL } from "../hooks/useLiveStepCounter";
import { db } from "../services/firebase";
import { getTodayDateKey } from "../services/helperFunctions";
import { publishIntelligenceEvent } from "../services/intelligenceEvents";
import { upsertDailyStepLog } from "../services/stepLog";
import { appTheme } from "../theme/designSystem";

export type HomeTabParamList = {
  Home: undefined;
  Workout: undefined;
  Nutrition: undefined;
  Coach: undefined;
  Profile: undefined;
};

type HomeTabsProps = {
  user: User;
};

const MIN_STEP_GOAL = 100;
const STEP_GOAL_INCREMENT = 100;
const FIRESTORE_SAVE_TIMEOUT_MS = 8000;
const STEP_SAVE_INTERVAL_MS = 5 * 60 * 1000;
const STEP_SAVE_MIN_DELTA = 200;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_resolve, reject) => {
      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        reject(new Error("save-timeout"));
      }, timeoutMs);
    }),
  ]);
}

function normalizeDailyStepGoal(goal: number) {
  return Math.max(
    MIN_STEP_GOAL,
    Math.round(goal / STEP_GOAL_INCREMENT) * STEP_GOAL_INCREMENT,
  );
}

const Tab = createBottomTabNavigator<HomeTabParamList>();

export default function HomeTabs({ user }: HomeTabsProps) {
  const [dailyStepGoal, setDailyStepGoal] = useState(DAILY_STEP_GOAL);
  const [isSavingStepGoal, setIsSavingStepGoal] = useState(false);
  const lastStepSaveRef = useRef({ dateKey: "", steps: -1, savedAt: 0 });
  const insets = useSafeAreaInsets();
  
  useEffect(() => {
    let isMounted = true;

    const loadStepGoal = async () => {
      setDailyStepGoal(DAILY_STEP_GOAL);

      try {
        const userRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(userRef);
        const storedGoal = snapshot.data()?.dailyStepGoal;

        if (
          isMounted &&
          typeof storedGoal === "number" &&
          Number.isFinite(storedGoal) &&
          storedGoal >= MIN_STEP_GOAL
        ) {
          setDailyStepGoal(normalizeDailyStepGoal(storedGoal));
        }
      } catch {
        // Keep local default goal when cloud value is unavailable.
      }
    };

    loadStepGoal().catch(() => {
      if (isMounted) {
        setDailyStepGoal(DAILY_STEP_GOAL);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [user.uid]);

  const handleUpdateDailyStepGoal = useCallback(
    async (nextGoal: number) => {
      const normalizedGoal = normalizeDailyStepGoal(nextGoal);

      if (normalizedGoal === dailyStepGoal) {
        return;
      }

      const previousGoal = dailyStepGoal;
      setDailyStepGoal(normalizedGoal);
      setIsSavingStepGoal(true);

      try {
        const userRef = doc(db, "users", user.uid);
        await withTimeout(
          setDoc(
            userRef,
            {
              dailyStepGoal: normalizedGoal,
              dailyStepGoalUpdatedAt: serverTimestamp(),
            },
            { merge: true },
          ),
          FIRESTORE_SAVE_TIMEOUT_MS,
        );
        void publishIntelligenceEvent({
          type: "profile_updated",
          payload: {
            changedFields: ["dailyStepGoal"],
          },
        });
      } catch (error) {
        setDailyStepGoal(previousGoal);

        const errorCode =
          typeof error === "object" && error && "code" in error
            ? String((error as { code: unknown }).code)
            : "";
        const errorText = error instanceof Error ? error.message : String(error ?? "");

        if (
          errorCode === "permission-denied" ||
          /permission-denied|firestore\.googleapis\.com/i.test(errorText)
        ) {
          throw new Error(
            "Firestore is disabled or blocked for this project. Enable Firestore API in Google Cloud Console and try again.",
          );
        }

        if (/save-timeout/i.test(errorText)) {
          throw new Error(
            "Couldn't reach Firebase in time. Check internet connection and try again.",
          );
        }

        throw error;
      } finally {
        setIsSavingStepGoal(false);
      }
    },
    [dailyStepGoal, user.uid],
  );

  const liveStepCounter = useLiveStepCounter(dailyStepGoal);

  const saveStepSnapshot = useCallback(() => {
    if (liveStepCounter.isLoading) {
      return;
    }

    const dateKey = getTodayDateKey();
    const nowMs = Date.now();
    const steps = Math.max(0, Math.round(liveStepCounter.stepsToday));
    const goal = Math.max(0, Math.round(liveStepCounter.goal));
    const last = lastStepSaveRef.current;
    const dateChanged = Boolean(last.dateKey) && last.dateKey !== dateKey;
    const stepsDelta = steps - Math.max(0, last.steps);
    const shouldSave =
      dateChanged ||
      stepsDelta >= STEP_SAVE_MIN_DELTA ||
      nowMs - last.savedAt >= STEP_SAVE_INTERVAL_MS;

    if (!shouldSave) {
      return;
    }

    lastStepSaveRef.current = { dateKey, steps, savedAt: nowMs };

    upsertDailyStepLog(user.uid, dateKey, {
      steps,
      goal,
      source: liveStepCounter.trackingSource,
    }).catch(() => {
      // Ignore background save failures.
    });
  }, [liveStepCounter.goal, liveStepCounter.isLoading, liveStepCounter.stepsToday, liveStepCounter.trackingSource, user.uid]);

  useEffect(() => {
    saveStepSnapshot();
  }, [saveStepSnapshot]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      saveStepSnapshot();
    }, STEP_SAVE_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [saveStepSnapshot]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: appTheme.colors.tabActive,
        tabBarInactiveTintColor: appTheme.colors.tabInactive,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: appTheme.colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: appTheme.colors.border,
          height: appTheme.sizes.tabBarHeight + insets.bottom,
          paddingBottom: Math.max(appTheme.spacing.sm, insets.bottom),
        },
        tabBarIconStyle: { marginTop: appTheme.spacing.xs },
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          tabBarIcon: ({ color }) => (
            <House size={appTheme.sizes.tabIcon} color={color} strokeWidth={2.2} />
          ),
        }}
      >
        {() => (
          <HomeScreen
            user={user}
            liveStepCounter={liveStepCounter}
            onUpdateDailyStepGoal={handleUpdateDailyStepGoal}
            isSavingStepGoal={isSavingStepGoal}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Workout"
        component={WorkoutScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Dumbbell size={appTheme.sizes.tabIcon} color={color} strokeWidth={2.2} />
          ),
        }}
      />

      <Tab.Screen
        name="Nutrition"
        component={NutritionScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <Pizza size={appTheme.sizes.tabIcon} color={color} strokeWidth={2.2} />
          ),
        }}
      />

      <Tab.Screen
        name="Coach"
        component={AICoachScreen}
        options={{
          title: "Aether",
          tabBarIcon: ({ color }) => (
            <BrainCircuit size={appTheme.sizes.tabIcon} color={color} strokeWidth={2.2} />
          ),
        }}
      />

      <Tab.Screen
        name="Profile"
        options={{
          tabBarIcon: ({ color }) => (
            <UserIcon size={appTheme.sizes.tabIcon} color={color} strokeWidth={2.2} />
          ),
        }}
      >
        {() => <ProfileScreen user={user} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
