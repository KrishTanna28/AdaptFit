import { createHash } from "node:crypto";

import {
  buildContextSignature,
  DEFAULT_CONTEXT_SOURCES,
  loadCoachContextForSources,
  normalizeContextSources,
} from "../ai/retrieval/contextQueries.js";
import { observeCache } from "../observability/metrics.js";
import { SignalPacketSchema } from "../schemas/signals.js";
import { validateOrThrow } from "../schemas/validators.js";
import { saveSignalState } from "./signalStore.js";
import { validateSafetyForSignalPacket } from "./validators/safety.js";

const SIGNAL_VERSION = "v2";
const DEFAULT_SLEEP_TARGET_HOURS = 8;

function hashSignalPacket(signalPacket) {
  return createHash("sha256")
    .update(JSON.stringify(signalPacket))
    .digest("hex")
    .slice(0, 32);
}

function toNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function safeDivide(numerator, denominator, fallback = 0) {
  return denominator ? numerator / denominator : fallback;
}

function mean(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function roundTo(value, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(toNumber(value, 0) * factor) / factor;
}

function scoreLevel(score) {
  if (score >= 75) return "high";
  if (score >= 50) return "moderate";
  if (score >= 25) return "low";
  return "very_low";
}

function score(value) {
  const rounded = Math.round(clamp(toNumber(value, 0), 0, 100));
  return {
    score: rounded,
    level: scoreLevel(rounded),
  };
}

function normalizeGoal(goal) {
  const normalized = String(goal ?? "").trim().toUpperCase();
  if (normalized.includes("LOSE")) return "LOSE_WEIGHT";
  if (normalized.includes("GAIN") || normalized.includes("MUSCLE")) return "GAIN_MUSCLE";
  return "MAINTAIN";
}

function normalizeLifestyle(lifestyle) {
  const normalized = String(lifestyle ?? "").trim().toUpperCase();
  if (normalized.includes("VERY")) return "VERY_ACTIVE";
  if (normalized.includes("ACTIVE")) return "ACTIVE";
  if (normalized.includes("LIGHT")) return "LIGHT";
  if (normalized.includes("SEDENTARY")) return "SEDENTARY";
  return "MODERATE";
}

function activityMultiplier(lifestyle) {
  switch (normalizeLifestyle(lifestyle)) {
    case "SEDENTARY":
      return 1.2;
    case "LIGHT":
      return 1.375;
    case "ACTIVE":
      return 1.725;
    case "VERY_ACTIVE":
      return 1.9;
    case "MODERATE":
    default:
      return 1.55;
  }
}

function estimateBmr(profile) {
  const weightKg = toNumber(profile?.weightKg, null);
  const heightCm = toNumber(profile?.heightCm, null);
  const age = toNumber(profile?.age, null);
  const gender = String(profile?.gender ?? "").trim().toLowerCase();

  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || !Number.isFinite(age)) {
    return null;
  }

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === "male") return Math.round(base + 5);
  if (gender === "female") return Math.round(base - 161);
  return Math.round(base);
}

function resolveProteinTarget(weightKg, goal) {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }

  const normalized = normalizeGoal(goal);
  const gramsPerKg = normalized === "GAIN_MUSCLE" ? 1.6 : normalized === "LOSE_WEIGHT" ? 1.2 : 1.0;
  return Math.round(weightKg * gramsPerKg);
}

function goalCalorieAdjustment(goal) {
  const normalized = normalizeGoal(goal);
  if (normalized === "LOSE_WEIGHT") return -300;
  if (normalized === "GAIN_MUSCLE") return 250;
  return 0;
}

function resolveWorkoutTarget(goal, lifestyle) {
  const normalizedGoal = normalizeGoal(goal);
  let target = normalizedGoal === "MAINTAIN" ? 3 : 4;
  const normalizedLifestyle = normalizeLifestyle(lifestyle);

  if (normalizedLifestyle === "ACTIVE") target += 1;
  if (normalizedLifestyle === "VERY_ACTIVE") target += 2;
  if (normalizedLifestyle === "SEDENTARY") target = Math.max(2, target - 1);

  return clamp(target, 2, 6);
}

function buildDailySeries(dateKeys, dailyRecords, selector, fallback = 0) {
  const map = new Map(
    (Array.isArray(dailyRecords) ? dailyRecords : []).map((record) => [record.dateKey, selector(record)]),
  );

  return dateKeys.map((dateKey) => {
    const value = map.get(dateKey);
    return Number.isFinite(value) ? value : fallback;
  });
}

function buildDailyNullableSeries(dateKeys, dailyRecords, selector) {
  const map = new Map(
    (Array.isArray(dailyRecords) ? dailyRecords : []).map((record) => [record.dateKey, selector(record)]),
  );

  return dateKeys.map((dateKey) => {
    const value = map.get(dateKey);
    return Number.isFinite(value) ? value : null;
  });
}

function computeSlope(values) {
  const points = values
    .map((value, index) => ({ x: index, y: toNumber(value, null) }))
    .filter((point) => Number.isFinite(point.y));

  if (points.length < 2) {
    return 0;
  }

  const meanX = mean(points.map((point) => point.x));
  const meanY = mean(points.map((point) => point.y));
  let numerator = 0;
  let denominator = 0;

  for (const point of points) {
    const dx = point.x - meanX;
    numerator += dx * (point.y - meanY);
    denominator += dx * dx;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

function averageWindow(values, window, offset = 0) {
  const sliced = values.slice(Math.max(0, values.length - window - offset), values.length - offset);
  const valid = sliced.map((value) => toNumber(value, null)).filter(Number.isFinite);
  return valid.length ? mean(valid) : 0;
}

function computeTrend(values, options = {}) {
  const window = Number.isFinite(options.window) ? Math.max(2, options.window) : 7;
  const slope = computeSlope(values);
  const currentAvg = averageWindow(values, window, 0);
  const prevAvg = averageWindow(values, window, window);
  const changePct = prevAvg > 0 ? safeDivide(currentAvg - prevAvg, prevAvg, 0) : 0;
  const threshold = Number.isFinite(options.threshold)
    ? options.threshold
    : Math.max(0.05, Math.abs(slope) > 0 ? Math.abs(slope) * 0.05 : 0.05);
  let direction = "flat";

  if (slope > threshold) direction = "up";
  if (slope < -threshold) direction = "down";

  return {
    slope: roundTo(slope, 3),
    direction,
    currentAvg: roundTo(currentAvg, 1),
    previousAvg: roundTo(prevAvg, 1),
    changePct: roundTo(changePct, 3),
  };
}

function buildDailyMetrics(context) {
  const dateKeysAsc = Array.isArray(context.recentDateKeys)
    ? [...context.recentDateKeys].sort()
    : [];
  const dateKeysDesc = [...dateKeysAsc].reverse();
  const nutritionDaily = context.nutrition?.daily ?? [];
  const workoutDaily = context.workouts?.daily ?? [];
  const lifestyleDaily = context.lifestyle?.daily ?? [];
  const stepsDaily = context.steps?.daily ?? [];

  const workouts = buildDailySeries(dateKeysAsc, workoutDaily, (day) => day.sessions, 0);
  const steps = buildDailySeries(dateKeysAsc, stepsDaily, (day) => day.steps, 0);
  const stepGoals = buildDailySeries(dateKeysAsc, stepsDaily, (day) => day.goal, 0);
  const activeDayMap = new Map(
    dateKeysAsc.map((dateKey, index) => [
      dateKey,
      workouts[index] > 0 || (stepGoals[index] > 0 && steps[index] >= stepGoals[index]),
    ]),
  );
  let streakDays = 0;
  for (const dateKey of dateKeysDesc) {
    if (!activeDayMap.get(dateKey)) break;
    streakDays += 1;
  }

  const sleepHours = buildDailyNullableSeries(dateKeysAsc, lifestyleDaily, (day) => day.sleepHours);
  const sleepQuality = buildDailyNullableSeries(dateKeysAsc, lifestyleDaily, (day) => day.sleepQuality);
  const stress = buildDailyNullableSeries(dateKeysAsc, lifestyleDaily, (day) => day.stressLevel);
  const hydration = buildDailyNullableSeries(dateKeysAsc, lifestyleDaily, (day) => day.hydrationProgressPercent);

  return {
    windowDays: Math.max(dateKeysAsc.length, 1),
    dateKeysAsc,
    series: {
      calories: buildDailySeries(dateKeysAsc, nutritionDaily, (day) => day.calories, 0),
      protein: buildDailySeries(dateKeysAsc, nutritionDaily, (day) => day.protein, 0),
      meals: buildDailySeries(dateKeysAsc, nutritionDaily, (day) => day.mealsLogged, 0),
      workouts,
      activeCalories: buildDailySeries(dateKeysAsc, workoutDaily, (day) => day.activeCalories, 0),
      steps,
      stepGoals,
      sleepHours,
      sleepQuality,
      stress,
      hydration,
    },
    workoutSessions: context.workouts?.sessions ?? 0,
    workoutDays: workouts.filter((value) => value > 0).length,
    nutritionDays: nutritionDaily.filter((day) => day.calories > 0 || day.mealsLogged > 0).length,
    stepsDays: steps.filter((value) => value > 0).length,
    lifestyleDays: sleepHours.filter((value) => Number.isFinite(value)).length,
    stepGoalDays: stepGoals.filter((goal) => goal > 0).length,
    stepGoalHitDays: stepGoals.filter((goal, index) => goal > 0 && steps[index] >= goal).length,
    streakDays,
    totalMealsLogged: context.nutrition?.totalMealsLogged ?? 0,
    avgDailyCalories: context.nutrition?.avgDailyCalories ?? 0,
    avgDailyProtein: context.nutrition?.avgDailyProtein ?? 0,
    avgDailySteps: context.steps?.avgDailySteps ?? 0,
    avgDailyActiveCalories: context.workouts?.avgDailyActiveCalories ?? 0,
    avgSleepHours: roundTo(mean(sleepHours.filter((value) => Number.isFinite(value))), 1),
    avgSleepQuality: roundTo(mean(sleepQuality.filter((value) => Number.isFinite(value))), 1),
    avgStressLevel: roundTo(mean(stress.filter((value) => Number.isFinite(value))), 1),
    avgHydrationProgress: roundTo(mean(hydration.filter((value) => Number.isFinite(value))), 1),
    intensityCounts: context.workouts?.intensityCounts ?? { low: 0, moderate: 0, vigorous: 0 },
  };
}

function buildTrends(dailyMetrics) {
  const activityComposite = dailyMetrics.series.workouts.map((value, index) => {
    const stepsBoost = dailyMetrics.series.steps[index] > 0 ? 1 : 0;
    return value + stepsBoost;
  });

  return {
    steps: computeTrend(dailyMetrics.series.steps),
    workouts: computeTrend(dailyMetrics.series.workouts),
    activeCalories: computeTrend(dailyMetrics.series.activeCalories),
    nutritionCalories: computeTrend(dailyMetrics.series.calories),
    sleepHours: computeTrend(dailyMetrics.series.sleepHours),
    activity: computeTrend(activityComposite),
  };
}

function buildScores(context, dailyMetrics, trends) {
  const profile = context.profile ?? {};
  const goal = normalizeGoal(profile.fitnessGoal);
  const lifestyle = normalizeLifestyle(profile.lifestyle);
  const windowDays = dailyMetrics.windowDays;
  const weeklyWorkoutTarget = resolveWorkoutTarget(goal, lifestyle);
  const weeklySessions = safeDivide(dailyMetrics.workoutSessions * 7, windowDays, 0);
  const workoutRate = clamp01(safeDivide(weeklySessions, weeklyWorkoutTarget, 0));
  const stepGoalHitRate = clamp01(safeDivide(dailyMetrics.stepGoalHitDays, dailyMetrics.stepGoalDays, 0));
  const streakRatio = clamp01(safeDivide(dailyMetrics.streakDays, Math.min(windowDays, 7), 0));
  const consistency = 100 * (0.5 * workoutRate + 0.3 * stepGoalHitRate + 0.2 * streakRatio);
  const sleepHoursScore = dailyMetrics.avgSleepHours ? clamp01((dailyMetrics.avgSleepHours - 5) / 3) : 0.5;
  const sleepQualityScore = dailyMetrics.avgSleepQuality ? clamp01((dailyMetrics.avgSleepQuality - 1) / 4) : 0.5;
  const stressScore = dailyMetrics.avgStressLevel ? clamp01(1 - (dailyMetrics.avgStressLevel - 1) / 4) : 0.5;
  const recovery = 100 * (0.5 * sleepHoursScore + 0.2 * sleepQualityScore + 0.3 * stressScore);
  const intensityWeight =
    dailyMetrics.intensityCounts.low * 0.3 +
    dailyMetrics.intensityCounts.moderate * 0.6 +
    dailyMetrics.intensityCounts.vigorous;
  const intensityAvg = dailyMetrics.workoutSessions
    ? clamp01(intensityWeight / dailyMetrics.workoutSessions)
    : 0;
  const sleepDeficitNorm = dailyMetrics.avgSleepHours
    ? clamp01((DEFAULT_SLEEP_TARGET_HOURS - dailyMetrics.avgSleepHours) / 4)
    : 0;
  const fatigue = 100 * (0.5 * intensityAvg + 0.3 * workoutRate + 0.2 * sleepDeficitNorm);
  const bmr = estimateBmr(profile);
  const tdee = bmr ? Math.round(bmr * activityMultiplier(lifestyle)) : null;
  const calorieTarget = tdee ? Math.round(tdee + goalCalorieAdjustment(goal)) : null;
  const proteinTarget = resolveProteinTarget(toNumber(profile.weightKg, null), goal);
  const calorieAdherence = calorieTarget
    ? clamp01(1 - Math.min(1, Math.abs(dailyMetrics.avgDailyCalories - calorieTarget) / calorieTarget))
    : 0;
  const proteinRatio = proteinTarget
    ? clamp01(safeDivide(dailyMetrics.avgDailyProtein, proteinTarget, 0))
    : 0;
  const avgMealsPerDay = safeDivide(dailyMetrics.totalMealsLogged, windowDays, 0);
  const mealRegularity = clamp01(safeDivide(avgMealsPerDay, 3, 0));
  const nutrition = 100 * (0.5 * calorieAdherence + 0.3 * proteinRatio + 0.2 * mealRegularity);
  const loggingRate = clamp01(safeDivide(dailyMetrics.nutritionDays, windowDays, 0));
  const adherence = 100 * (0.5 * workoutRate + 0.3 * calorieAdherence + 0.2 * loggingRate);
  const engagement = clamp01(
    safeDivide(dailyMetrics.workoutDays + dailyMetrics.nutritionDays + dailyMetrics.stepsDays, windowDays * 2, 0),
  );
  const adherenceTrendScore =
    trends.activity?.direction === "up"
      ? 1
      : trends.activity?.direction === "down"
        ? 0.2
        : 0.6;
  const motivation = 100 * (0.4 * streakRatio + 0.3 * engagement + 0.3 * adherenceTrendScore);
  const progress =
    trends.activeCalories?.direction === "up"
      ? 70
      : trends.activeCalories?.direction === "down"
        ? 40
        : 55;

  return {
    targets: {
      workoutsPerWeek: weeklyWorkoutTarget,
      calorieTarget,
      proteinTarget,
      stepGoal: context.stepGoal ?? null,
      sleepHoursTarget: DEFAULT_SLEEP_TARGET_HOURS,
      bmr,
      tdee,
    },
    consistency: score(consistency),
    recovery: score(recovery),
    fatigue: score(fatigue),
    nutrition: score(nutrition),
    adherence: score(adherence),
    motivation: score(motivation),
    progress: score(progress),
  };
}

function buildStates(scores, trends) {
  const active = [];

  if (scores.fatigue.score >= 75 && scores.recovery.score <= 50) active.push("overtrainingRisk");
  if (scores.recovery.score < 45) active.push("recoveryNeeded");
  if (scores.adherence.score < 45 || trends.activity.direction === "down") active.push("decliningActivity");
  if (scores.progress.score < 45) active.push("plateauDetected");
  if (scores.consistency.score >= 75 && trends.activity.direction !== "down") active.push("highConsistency");
  if (!active.length) active.push("steady");

  return {
    primary: active[0],
    active,
  };
}

function buildDecisions({ scores, states }) {
  const needsRecovery = states.active.includes("recoveryNeeded") || states.active.includes("overtrainingRisk");
  const lowAdherence = states.active.includes("decliningActivity");

  return {
    coachingTone: needsRecovery ? "supportive and recovery-aware" : lowAdherence ? "practical and low-friction" : "direct and encouraging",
    recommendedWorkout: {
      type: needsRecovery ? "mobility" : "balanced",
      intensity: needsRecovery ? "low" : scores.fatigue.score >= 70 ? "moderate" : "moderate",
      durationMin: needsRecovery ? 20 : 35,
      focus: needsRecovery ? "recovery, hydration, and sleep" : "consistent training with manageable volume",
    },
    calorieAdjustment: 0,
    recoveryRecommendation: needsRecovery ? "Prioritize sleep, hydration, and easy movement today." : "Keep recovery habits steady.",
    habitFocus: lowAdherence ? ["log one meal", "walk for 10 minutes"] : ["keep logs current", "protect sleep"],
    streakAction: scores.consistency.score >= 75 ? "Protect the current momentum." : "Make the next action small enough to start.",
    rationale: states.active,
  };
}

function buildMemory(context, dailyMetrics, states) {
  return {
    profileGoal: context.profile?.fitnessGoal ?? null,
    activeStates: states.active,
    streakDays: dailyMetrics.streakDays,
    recentSignals: Array.isArray(context.signals) ? context.signals.slice(0, 3) : [],
  };
}

export async function buildSignalPacketFromContext(context) {
  const dailyMetrics = buildDailyMetrics(context);
  const trends = buildTrends(dailyMetrics);
  const scores = buildScores(context, dailyMetrics, trends);
  const states = buildStates(scores, trends);
  const decisions = buildDecisions({ scores, states });
  const memory = buildMemory(context, dailyMetrics, states);
  const compactScores = Object.fromEntries(
    Object.entries(scores)
      .filter(([key]) => key !== "targets")
      .map(([key, value]) => [key, { score: value.score, level: value.level }]),
  );
  const basePacket = {
    version: SIGNAL_VERSION,
    generatedAt: context.generatedAt,
    currentDateKey: context.currentDateKey,
    window: context.window,
    profile: context.profile,
    scores: compactScores,
    targets: scores.targets,
    states,
    decisions,
    trends,
    recency: {
      lastWorkoutDateKey: context.recency?.lastWorkoutDateKey ?? null,
      lastWorkoutName: context.recency?.lastWorkoutName ?? null,
      lastNutritionDateKey: context.recency?.lastNutritionDateKey ?? null,
      daysSinceLastWorkout: context.recency?.daysSinceLastWorkout ?? null,
      daysSinceLastNutritionLog: context.recency?.daysSinceLastNutritionLog ?? null,
      workoutGoalAchievedToday: context.recency?.workoutGoalAchievedToday ?? false,
      nutritionCaloriesToday: context.recency?.nutritionCaloriesToday ?? 0,
      workoutActiveCaloriesToday: context.recency?.workoutActiveCaloriesToday ?? 0,
      stepsToday: context.steps?.stepsToday ?? 0,
      stepGoalToday: context.steps?.stepGoalToday ?? null,
    },
    memory,
    dataCoverage: {
      workoutDays: dailyMetrics.workoutDays,
      nutritionDays: dailyMetrics.nutritionDays,
      stepsDays: dailyMetrics.stepsDays,
      lifestyleDays: dailyMetrics.lifestyleDays,
      streakDays: dailyMetrics.streakDays,
      stepGoalHitDays: dailyMetrics.stepGoalHitDays,
      avgHydrationProgress: dailyMetrics.avgHydrationProgress,
      sources: [
        "profile",
        ...(context.window?.nutritionDays > 0 ? ["nutrition"] : []),
        ...(context.window?.workoutDays > 0 ? ["workouts"] : []),
        ...(context.lifestyle?.daily?.length ? ["lifestyle"] : []),
        ...(context.steps?.daily?.length ? ["steps"] : []),
      ],
    },
    signals: Array.isArray(context.signals) ? context.signals.slice(0, 5) : [],
  };
  const signalPacket = {
    ...basePacket,
    safety: validateSafetyForSignalPacket(basePacket),
  };
  const validatedPacket = validateOrThrow(SignalPacketSchema, signalPacket, "signal packet");

  return {
    signalPacket: validatedPacket,
    signature: hashSignalPacket(validatedPacket),
    contextSignature: buildContextSignature(context),
  };
}

export async function recomputeUserSignalState(db, uid, options = {}) {
  const windowDays = options.windowDays ?? 30;
  const context = await loadCoachContextForSources(db, uid, {
    windowDays,
    sources: options.sources ?? DEFAULT_CONTEXT_SOURCES,
  });
  const result = await buildSignalPacketFromContext(context);
  await saveSignalState(
    db,
    uid,
    {
      signalPacket: result.signalPacket,
      signature: result.signature,
      reason: options.reason ?? "recompute",
    },
    { windowDays },
  );

  observeCache({ layer: "signal-engine", outcome: "recompute", namespace: "intelligence" });
  return {
    ...result,
    context,
    sources: Array.from(normalizeContextSources(options.sources)),
  };
}
