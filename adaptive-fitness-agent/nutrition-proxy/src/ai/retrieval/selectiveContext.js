const DEFAULT_RECENT_LIMIT = 6;

function pickRecent(entries, limit = DEFAULT_RECENT_LIMIT) {
  return (Array.isArray(entries) ? entries : [])
    .slice()
    .sort((left, right) =>
      String(right.loggedAt ?? right.dateKey ?? "").localeCompare(String(left.loggedAt ?? left.dateKey ?? "")),
    )
    .slice(0, limit);
}

function compactWorkout(entry) {
  return {
    dateKey: entry.dateKey,
    name: entry.workoutName,
    mode: entry.workoutMode,
    durationMin: entry.durationMin,
    intensity: entry.intensity,
    activeCalories: entry.caloriesActive,
  };
}

function compactMeal(entry) {
  return {
    dateKey: entry.dateKey,
    mealType: entry.mealType,
    name: entry.name,
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
  };
}

function compactLifestyle(entry) {
  return {
    dateKey: entry.dateKey,
    hydration: entry.hydration,
    recovery: entry.recovery,
    weather: entry.weather,
  };
}

export function retrieveSelectiveContext({ context, signalPacket, intent, conversationMemory = [] }) {
  const required = new Set(intent.requiredSources ?? ["signals"]);
  const result = {
    currentDateKey: context.currentDateKey,
    intent,
    signalPacket,
    sources: {},
  };

  if (required.has("profile")) {
    result.sources.profile = context.profile;
  }

  if (required.has("workouts")) {
    result.sources.workouts = {
      summary: {
        sessions: context.workouts?.sessions ?? 0,
        avgDailyDurationMin: context.workouts?.avgDailyDurationMin ?? 0,
        avgDailyActiveCalories: context.workouts?.avgDailyActiveCalories ?? 0,
        intensityCounts: context.workouts?.intensityCounts ?? {},
      },
      recent: pickRecent(context.workouts?.allEntries).map(compactWorkout),
    };
  }

  if (required.has("nutrition")) {
    result.sources.nutrition = {
      summary: {
        avgDailyCalories: context.nutrition?.avgDailyCalories ?? 0,
        avgDailyProtein: context.nutrition?.avgDailyProtein ?? 0,
        totalMealsLogged: context.nutrition?.totalMealsLogged ?? 0,
      },
      recent: pickRecent(context.nutrition?.allEntries).map(compactMeal),
    };
  }

  if (required.has("lifestyle")) {
    result.sources.lifestyle = {
      summary: {
        avgSleepHours: context.lifestyle?.avgSleepHours ?? null,
        avgStressLevel: context.lifestyle?.avgStressLevel ?? null,
        avgHydrationProgressPercent: context.lifestyle?.avgHydrationProgressPercent ?? null,
        poorRecoveryDays: context.lifestyle?.poorRecoveryDays ?? 0,
      },
      recent: pickRecent(context.lifestyle?.allEntries).map(compactLifestyle),
    };
  }

  if (required.has("steps")) {
    result.sources.steps = {
      avgDailySteps: context.steps?.avgDailySteps ?? 0,
      stepsToday: context.steps?.stepsToday ?? 0,
      stepGoalToday: context.steps?.stepGoalToday ?? null,
      recent: pickRecent(context.steps?.daily, DEFAULT_RECENT_LIMIT),
    };
  }

  if (required.has("memory")) {
    result.sources.memory = {
      deterministic: signalPacket?.memory ?? {},
      conversations: conversationMemory.slice(0, 3),
    };
  }

  return result;
}

