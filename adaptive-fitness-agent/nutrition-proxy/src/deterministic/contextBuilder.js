import { createHash } from "node:crypto";
import { buildDecision } from "./decision.js";
import { buildMemorySummary } from "./memory.js";
import { computeScores } from "./scoring.js";
import { classifyStates } from "./state.js";
import { buildDailyNullableSeries, buildDailySeries, computeTrend } from "./trend.js";
import { computeStreak, mean, roundTo, safeDivide, toNumber } from "./utils.js";

const DETERMINISTIC_VERSION = "v1";
const DEFAULT_SIGNAL_LIMIT = 5;

function buildDailyMetrics(context) {
  const dateKeysAsc = Array.isArray(context.recentDateKeys)
    ? [...context.recentDateKeys].sort()
    : [];
  const dateKeysDesc = [...dateKeysAsc].reverse();

  const nutritionDaily = context.nutrition?.daily ?? [];
  const workoutDaily = context.workouts?.daily ?? [];
  const lifestyleDaily = context.lifestyle?.daily ?? [];
  const stepsDaily = context.steps?.daily ?? [];

  const caloriesSeries = buildDailySeries(dateKeysAsc, nutritionDaily, (day) => day.calories, 0);
  const proteinSeries = buildDailySeries(dateKeysAsc, nutritionDaily, (day) => day.protein, 0);
  const mealsSeries = buildDailySeries(dateKeysAsc, nutritionDaily, (day) => day.mealsLogged, 0);

  const workoutSeries = buildDailySeries(dateKeysAsc, workoutDaily, (day) => day.sessions, 0);
  const activeCaloriesSeries = buildDailySeries(dateKeysAsc, workoutDaily, (day) => day.activeCalories, 0);

  const stepsSeries = buildDailySeries(dateKeysAsc, stepsDaily, (day) => day.steps, 0);
  const stepGoalSeries = buildDailySeries(dateKeysAsc, stepsDaily, (day) => day.goal, 0);

  const sleepSeries = buildDailyNullableSeries(dateKeysAsc, lifestyleDaily, (day) => day.sleepHours);
  const sleepQualitySeries = buildDailyNullableSeries(dateKeysAsc, lifestyleDaily, (day) => day.sleepQuality);
  const stressSeries = buildDailyNullableSeries(dateKeysAsc, lifestyleDaily, (day) => day.stressLevel);
  const hydrationSeries = buildDailyNullableSeries(dateKeysAsc, lifestyleDaily, (day) => day.hydrationProgressPercent);

  const stepGoalDays = stepGoalSeries.filter((goal) => goal > 0).length;
  const stepGoalHitDays = stepGoalSeries.filter((goal, index) => goal > 0 && stepsSeries[index] >= goal).length;
  const workoutDays = workoutSeries.filter((value) => value > 0).length;
  const nutritionDays = caloriesSeries.filter((value) => value > 0).length;
  const stepsDays = stepsSeries.filter((value) => value > 0).length;
  const lifestyleDays = sleepSeries.filter((value) => Number.isFinite(value)).length;

  const activeDayMap = new Map(
    dateKeysAsc.map((dateKey, index) => [
      dateKey,
      workoutSeries[index] > 0 || (stepGoalSeries[index] > 0 && stepsSeries[index] >= stepGoalSeries[index]),
    ]),
  );

  const streakDays = computeStreak(dateKeysDesc, activeDayMap);

  const avgSleepHours = mean(sleepSeries.filter((value) => Number.isFinite(value)));
  const avgSleepQuality = mean(sleepQualitySeries.filter((value) => Number.isFinite(value)));
  const avgStressLevel = mean(stressSeries.filter((value) => Number.isFinite(value)));
  const avgHydrationProgress = mean(hydrationSeries.filter((value) => Number.isFinite(value)));

  return {
    windowDays: Math.max(dateKeysAsc.length, 1),
    dateKeysAsc,
    dateKeysDesc,
    series: {
      calories: caloriesSeries,
      protein: proteinSeries,
      meals: mealsSeries,
      workouts: workoutSeries,
      activeCalories: activeCaloriesSeries,
      steps: stepsSeries,
      stepGoals: stepGoalSeries,
      sleepHours: sleepSeries,
      sleepQuality: sleepQualitySeries,
      stress: stressSeries,
      hydration: hydrationSeries,
    },
    workoutSessions: context.workouts?.sessions ?? 0,
    workoutDays,
    nutritionDays,
    stepsDays,
    lifestyleDays,
    stepGoalDays,
    stepGoalHitDays,
    streakDays,
    totalMealsLogged: context.nutrition?.totalMealsLogged ?? 0,
    avgDailyCalories: context.nutrition?.avgDailyCalories ?? 0,
    avgDailyProtein: context.nutrition?.avgDailyProtein ?? 0,
    avgDailySteps: context.steps?.avgDailySteps ?? 0,
    avgDailyActiveCalories: context.workouts?.avgDailyActiveCalories ?? 0,
    avgSleepHours: Number.isFinite(avgSleepHours) ? roundTo(avgSleepHours, 1) : 0,
    avgSleepQuality: Number.isFinite(avgSleepQuality) ? roundTo(avgSleepQuality, 1) : 0,
    avgStressLevel: Number.isFinite(avgStressLevel) ? roundTo(avgStressLevel, 1) : 0,
    avgHydrationProgress: Number.isFinite(avgHydrationProgress) ? roundTo(avgHydrationProgress, 1) : 0,
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

function compactSignals(signals) {
  if (!Array.isArray(signals)) {
    return [];
  }
  return signals.filter((signal) => typeof signal === "string").slice(0, DEFAULT_SIGNAL_LIMIT);
}

function buildCompactContext({ context, dailyMetrics, trends, scores, states, decisions, memory }) {
  return {
    version: DETERMINISTIC_VERSION,
    generatedAt: context.generatedAt,
    currentDateKey: context.currentDateKey,
    window: context.window,
    profile: context.profile,
    scores: {
      consistency: { score: scores.consistency.score, level: scores.consistency.level },
      recovery: { score: scores.recovery.score, level: scores.recovery.level },
      fatigue: { score: scores.fatigue.score, level: scores.fatigue.level },
      nutrition: { score: scores.nutrition.score, level: scores.nutrition.level },
      adherence: { score: scores.adherence.score, level: scores.adherence.level },
      motivation: { score: scores.motivation.score, level: scores.motivation.level },
      progress: { score: scores.progress.score, level: scores.progress.level },
    },
    targets: scores.targets,
    states: {
      primary: states.primary,
      active: states.active,
    },
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
    memory: memory.compact,
    dataCoverage: {
      workoutDays: dailyMetrics.workoutDays,
      nutritionDays: dailyMetrics.nutritionDays,
      stepsDays: dailyMetrics.stepsDays,
      lifestyleDays: dailyMetrics.lifestyleDays,
      streakDays: dailyMetrics.streakDays,
      stepGoalHitDays: dailyMetrics.stepGoalHitDays,
      avgHydrationProgress: dailyMetrics.avgHydrationProgress,
    },
    signals: compactSignals(context.signals),
  };
}

export function buildDeterministicContext(context) {
  const dailyMetrics = buildDailyMetrics(context);
  const trends = buildTrends(dailyMetrics);
  const scores = computeScores({ context, dailyMetrics, trends });
  const states = classifyStates({ context, dailyMetrics, scores, trends });
  const decisions = buildDecision({ context, dailyMetrics, scores, states });
  const memory = buildMemorySummary({ context, dailyMetrics, scores, states, decisions, trends });

  return {
    version: DETERMINISTIC_VERSION,
    generatedAt: context.generatedAt,
    scores,
    states,
    decisions,
    trends,
    memory,
    compact: buildCompactContext({
      context,
      dailyMetrics,
      trends,
      scores,
      states,
      decisions,
      memory,
    }),
  };
}

export function buildDeterministicSignature(context) {
  const signatureInput = {
    currentDateKey: context.currentDateKey,
    window: context.window,
    profile: context.profile,
    stepGoal: context.stepGoal,
    recency: context.recency,
    nutrition: context.nutrition?.daily ?? [],
    workouts: context.workouts?.daily ?? [],
    lifestyle: context.lifestyle?.daily ?? [],
    steps: context.steps?.daily ?? [],
  };

  return createHash("sha256")
    .update(JSON.stringify(signatureInput))
    .digest("hex")
    .slice(0, 32);
}
