import {
  clamp,
  clamp01,
  mean,
  normalizeGender,
  normalizeGoal,
  normalizeLifestyle,
  roundTo,
  safeDivide,
  scoreLevel,
  toNumber,
} from "./utils.js";
import { computeSlope } from "./trend.js";

const DEFAULT_SLEEP_TARGET_HOURS = 8;

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
  const gender = normalizeGender(profile?.gender);

  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || !Number.isFinite(age)) {
    return null;
  }

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === "male") {
    return base + 5;
  }
  if (gender === "female") {
    return base - 161;
  }
  return base;
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

function resolveProteinTarget(weightKg, goal) {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }

  const normalized = normalizeGoal(goal);
  const gramsPerKg = normalized === "GAIN_MUSCLE" ? 1.6 : normalized === "LOSE_WEIGHT" ? 1.2 : 1.0;
  return Math.round(weightKg * gramsPerKg);
}

function buildWeightTrend(profileHistory) {
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
    slope,
    delta,
    startWeight: points[0].weight,
    endWeight: points[points.length - 1].weight,
  };
}

function scoreWeightTrend(trend, goal) {
  if (!trend) {
    return null;
  }

  const slope = trend.slope;
  const normalizedGoal = normalizeGoal(goal);

  if (normalizedGoal === "LOSE_WEIGHT") {
    if (slope <= -0.08) return 90;
    if (slope <= -0.03) return 75;
    if (slope < 0.01) return 55;
    return 35;
  }

  if (normalizedGoal === "GAIN_MUSCLE") {
    if (slope >= 0.08) return 90;
    if (slope >= 0.03) return 75;
    if (slope > -0.01) return 55;
    return 35;
  }

  if (Math.abs(slope) <= 0.02) return 80;
  if (Math.abs(slope) <= 0.05) return 60;
  return 40;
}

export function computeScores({ context, dailyMetrics, trends }) {
  const profile = context.profile ?? {};
  const goal = normalizeGoal(profile.fitnessGoal);
  const lifestyle = normalizeLifestyle(profile.lifestyle);

  const windowDays = dailyMetrics.windowDays;
  const weeklyWorkoutTarget = resolveWorkoutTarget(goal, lifestyle);
  const weeklySessions = safeDivide(dailyMetrics.workoutSessions * 7, windowDays, 0);
  const workoutRate = clamp01(safeDivide(weeklySessions, weeklyWorkoutTarget, 0));
  const stepGoalHitRate = clamp01(safeDivide(dailyMetrics.stepGoalHitDays, dailyMetrics.stepGoalDays, 0));
  const streakRatio = clamp01(safeDivide(dailyMetrics.streakDays, Math.min(windowDays, 7), 0));

  const consistencyScore = Math.round(100 * (0.5 * workoutRate + 0.3 * stepGoalHitRate + 0.2 * streakRatio));

  const sleepHoursScore = clamp01((dailyMetrics.avgSleepHours - 5) / 3);
  const sleepQualityScore = dailyMetrics.avgSleepQuality ? clamp01((dailyMetrics.avgSleepQuality - 1) / 4) : 0.5;
  const stressScore = dailyMetrics.avgStressLevel ? clamp01(1 - (dailyMetrics.avgStressLevel - 1) / 4) : 0.5;
  const recoveryScore = Math.round(100 * (0.5 * sleepHoursScore + 0.2 * sleepQualityScore + 0.3 * stressScore));

  const intensityWeight =
    dailyMetrics.intensityCounts.low * 0.3 +
    dailyMetrics.intensityCounts.moderate * 0.6 +
    dailyMetrics.intensityCounts.vigorous * 1.0;
  const intensityAvg = dailyMetrics.workoutSessions
    ? clamp01(intensityWeight / dailyMetrics.workoutSessions)
    : 0;
  const frequencyNorm = clamp01(safeDivide(weeklySessions, weeklyWorkoutTarget, 0));
  const sleepDeficitNorm = dailyMetrics.avgSleepHours
    ? clamp01((DEFAULT_SLEEP_TARGET_HOURS - dailyMetrics.avgSleepHours) / 4)
    : 0;
  const fatigueScore = Math.round(100 * (0.5 * intensityAvg + 0.3 * frequencyNorm + 0.2 * sleepDeficitNorm));

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
  const nutritionScore = Math.round(100 * (0.5 * calorieAdherence + 0.3 * proteinRatio + 0.2 * mealRegularity));

  const loggingRate = clamp01(safeDivide(dailyMetrics.nutritionDays, windowDays, 0));
  const adherenceScore = Math.round(
    100 * (0.5 * workoutRate + 0.3 * calorieAdherence + 0.2 * loggingRate),
  );

  const engagement = clamp01(
    safeDivide(dailyMetrics.workoutDays + dailyMetrics.nutritionDays + dailyMetrics.stepsDays, windowDays * 2, 0),
  );
  const adherenceTrendScore =
    trends.activity?.direction === "up"
      ? 1
      : trends.activity?.direction === "down"
        ? 0.2
        : 0.6;
  const motivationScore = Math.round(100 * (0.4 * streakRatio + 0.3 * engagement + 0.3 * adherenceTrendScore));

  const weightTrend = buildWeightTrend(context.profileHistory);
  const weightProgressScore = scoreWeightTrend(weightTrend, goal);
  const progressScore = weightProgressScore !== null
    ? weightProgressScore
    : trends.activeCalories?.direction === "up"
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
    consistency: {
      score: consistencyScore,
      level: scoreLevel(consistencyScore),
      components: {
        workoutRate: roundTo(workoutRate, 2),
        stepGoalHitRate: roundTo(stepGoalHitRate, 2),
        streakRatio: roundTo(streakRatio, 2),
      },
    },
    recovery: {
      score: recoveryScore,
      level: scoreLevel(recoveryScore),
      components: {
        sleepHoursScore: roundTo(sleepHoursScore, 2),
        sleepQualityScore: roundTo(sleepQualityScore, 2),
        stressScore: roundTo(stressScore, 2),
      },
    },
    fatigue: {
      score: fatigueScore,
      level: scoreLevel(fatigueScore),
      components: {
        intensityAvg: roundTo(intensityAvg, 2),
        frequencyNorm: roundTo(frequencyNorm, 2),
        sleepDeficitNorm: roundTo(sleepDeficitNorm, 2),
      },
    },
    nutrition: {
      score: nutritionScore,
      level: scoreLevel(nutritionScore),
      components: {
        calorieAdherence: roundTo(calorieAdherence, 2),
        proteinRatio: roundTo(proteinRatio, 2),
        mealRegularity: roundTo(mealRegularity, 2),
      },
    },
    adherence: {
      score: adherenceScore,
      level: scoreLevel(adherenceScore),
      components: {
        workoutRate: roundTo(workoutRate, 2),
        calorieAdherence: roundTo(calorieAdherence, 2),
        loggingRate: roundTo(loggingRate, 2),
      },
    },
    motivation: {
      score: motivationScore,
      level: scoreLevel(motivationScore),
      components: {
        streakRatio: roundTo(streakRatio, 2),
        engagement: roundTo(engagement, 2),
        adherenceTrendScore: roundTo(adherenceTrendScore, 2),
      },
    },
    progress: {
      score: Math.round(progressScore),
      level: scoreLevel(progressScore),
      components: {
        weightTrend: weightTrend
          ? {
              slope: roundTo(weightTrend.slope, 3),
              delta: roundTo(weightTrend.delta, 2),
            }
          : null,
      },
    },
  };
}
