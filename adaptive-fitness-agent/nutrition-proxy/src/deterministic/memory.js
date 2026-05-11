import { mean, normalizeGoal, toNumber } from "./utils.js";
import { computeSlope } from "./trend.js";

function buildWeightSummary(profileHistory) {
  const entries = Array.isArray(profileHistory?.entries) ? profileHistory.entries : [];
  const points = entries
    .map((entry) => {
      const weight = toNumber(entry?.snapshot?.weightKg, null);
      const dateRaw = typeof entry?.changedAt === "string" ? entry.changedAt : null;
      if (!Number.isFinite(weight) || !dateRaw) {
        return null;
      }
      const date = new Date(dateRaw);
      if (Number.isNaN(date.getTime())) {
        return null;
      }
      return { date, weight };
    })
    .filter((point) => point !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (points.length < 2) {
    return null;
  }

  const weights = points.map((point) => point.weight);
  const slope = computeSlope(weights);
  const delta = points[points.length - 1].weight - points[0].weight;

  return {
    startWeight: points[0].weight,
    endWeight: points[points.length - 1].weight,
    delta,
    slope,
    startDate: points[0].date.toISOString(),
    endDate: points[points.length - 1].date.toISOString(),
  };
}

function resolveWorkoutModePreference(workoutEntries) {
  const counts = { cardio: 0, strength: 0, sports: 0 };
  for (const entry of Array.isArray(workoutEntries) ? workoutEntries : []) {
    if (entry?.workoutMode === "strength") counts.strength += 1;
    else if (entry?.workoutMode === "sports") counts.sports += 1;
    else counts.cardio += 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? "cardio";
}

export function buildMemorySummary({ context, dailyMetrics, scores }) {
  const profile = context.profile ?? {};
  const goal = normalizeGoal(profile.fitnessGoal);
  const weightSummary = buildWeightSummary(context.profileHistory);
  const workoutModePreference = resolveWorkoutModePreference(context.workouts?.allEntries ?? []);

  const lastWorkout = context.recency?.lastWorkoutDateKey
    ? {
        dateKey: context.recency.lastWorkoutDateKey,
        name: context.recency.lastWorkoutName ?? null,
      }
    : null;

  const shortTerm = {
    avgDailySteps: dailyMetrics.avgDailySteps,
    avgDailyCalories: dailyMetrics.avgDailyCalories,
    avgSleepHours: dailyMetrics.avgSleepHours || null,
    workoutsThisWeek: Math.round(dailyMetrics.workoutSessions * (7 / dailyMetrics.windowDays)),
    lastWorkout,
    lastNutritionDateKey: context.recency?.lastNutritionDateKey ?? null,
  };

  const longTerm = {
    goal,
    lifestyle: profile.lifestyle ?? null,
    dietType: profile.dietType ?? null,
    baseline: {
      calorieTarget: scores.targets?.calorieTarget ?? null,
      proteinTarget: scores.targets?.proteinTarget ?? null,
      workoutsPerWeek: scores.targets?.workoutsPerWeek ?? null,
      stepGoal: scores.targets?.stepGoal ?? null,
    },
  };

  const episodic = {
    streakDays: dailyMetrics.streakDays,
    weightChange: weightSummary
      ? {
          deltaKg: Math.round(weightSummary.delta * 10) / 10,
          startDate: weightSummary.startDate,
          endDate: weightSummary.endDate,
        }
      : null,
  };

  const semantic = {
    injuries: profile.injuries ?? null,
    medicalConditions: profile.medicalConditions ?? null,
    allergies: Array.isArray(profile.allergies) ? profile.allergies : [],
    foodRestrictions: profile.foodRestrictions ?? null,
    workoutPreference: workoutModePreference,
  };

  const compact = {
    shortTerm,
    longTerm,
    episodic,
    semantic,
  };

  return {
    shortTerm,
    longTerm,
    episodic,
    semantic,
    compact,
  };
}
