import React, { useCallback, useEffect, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { User } from "firebase/auth/react-native";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Droplets, Pizza, Flame, House, Lightbulb, User as UserIcon } from "lucide-react-native";

import AICoachScreen from "./AICoachScreen";
import HomeScreen from "./HomeScreen";
import LifestyleScreen from "./LifestyleScreen";
import NutritionScreen from "./NutritionScreen";
import ProfileScreen from "./ProfileScreen";
import WorkoutScreen from "./WorkoutScreen";
import useLiveStepCounter, { DAILY_STEP_GOAL } from "../hooks/useLiveStepCounter";
import { db } from "../services/firebase";
import { appTheme } from "../theme/designSystem";

export type HomeTabParamList = {
  Home: undefined;
  Activity: undefined;
  Workout: undefined;
  Diet: undefined;
  Lifestyle: undefined;
  Coach: undefined;
  Profile: undefined;
};

type HomeTabsProps = {
  user: User;
};

const MIN_STEP_GOAL = 100;
const STEP_GOAL_INCREMENT = 100;
const FIRESTORE_SAVE_TIMEOUT_MS = 8000;

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

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: appTheme.colors.text,
        tabBarInactiveTintColor: appTheme.colors.mutedText,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
        tabBarStyle: {
          backgroundColor: appTheme.colors.cardAlt,
          borderTopColor: appTheme.colors.border,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          tabBarIcon: ({ color, size }) => (
            <House size={size} color={color} strokeWidth={2.2} />
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
          tabBarIcon: ({ color, size }) => (
            <Flame size={size} color={color} strokeWidth={2.2} />
          ),
        }}
      />

      <Tab.Screen
        name="Diet"
        component={NutritionScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Pizza size={size} color={color} strokeWidth={2.2} />
          ),
        }}
      />

      <Tab.Screen
        name="Lifestyle"
        component={LifestyleScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Droplets size={size} color={color} strokeWidth={2.2} />
          ),
        }}
      />

      <Tab.Screen
        name="Coach"
        component={AICoachScreen}
        options={{
          title: "AI Coach",
          tabBarIcon: ({ color, size }) => (
            <Lightbulb size={size} color={color} strokeWidth={2.2} />
          ),
        }}
      />

      <Tab.Screen
        name="Profile"
        options={{
          tabBarIcon: ({ color, size }) => (
            <UserIcon size={size} color={color} strokeWidth={2.2} />
          ),
        }}
      >
        {() => <ProfileScreen user={user} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
