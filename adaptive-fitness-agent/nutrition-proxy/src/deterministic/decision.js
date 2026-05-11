import { normalizeGoal, safeDivide, toNumber } from "./utils.js";

function hasState(states, id) {
  return Array.isArray(states?.active) && states.active.includes(id);
}

function pickCoachingTone(states) {
  if (hasState(states, "overtrainingRisk") || hasState(states, "recoveryNeeded")) {
    return "calm";
  }
  if (hasState(states, "motivationDrop") || hasState(states, "decliningActivity")) {
    return "encouraging";
  }
  if (hasState(states, "highConsistency")) {
    return "celebratory";
  }
  return "supportive";
}

function buildWorkoutRecommendation(goal, states) {
  if (hasState(states, "overtrainingRisk") || hasState(states, "recoveryNeeded")) {
    return {
      type: "mobility and light cardio",
      intensity: "low",
      durationMin: 20,
      focus: "recovery",
    };
  }

  if (hasState(states, "motivationDrop") || hasState(states, "decliningActivity")) {
    return {
      type: "short walk plus light bodyweight",
      intensity: "low",
      durationMin: 20,
      focus: "consistency",
    };
  }

  if (hasState(states, "plateauDetected")) {
    return {
      type: "progressive strength with intervals",
      intensity: "moderate",
      durationMin: 40,
      focus: "progress",
    };
  }

  if (goal === "GAIN_MUSCLE") {
    return {
      type: "strength session",
      intensity: "moderate",
      durationMin: 45,
      focus: "strength",
    };
  }

  if (goal === "LOSE_WEIGHT") {
    return {
      type: "cardio plus full-body strength",
      intensity: "moderate",
      durationMin: 40,
      focus: "fat loss",
    };
  }

  return {
    type: "balanced cardio and strength",
    intensity: "moderate",
    durationMin: 35,
    focus: "maintenance",
  };
}

function resolveCalorieAdjustment({ goal, states, avgCalories, calorieTarget, recoveryScore }) {
  let adjustment = 0;

  if (hasState(states, "calorieSurplus") && calorieTarget > 0) {
    const surplus = avgCalories - calorieTarget;
    adjustment = surplus > 400 ? -250 : -150;
  }

  if (hasState(states, "calorieDeficit") && calorieTarget > 0) {
    adjustment = 150;
  }

  if (goal === "GAIN_MUSCLE" && adjustment === 0 && calorieTarget > 0) {
    adjustment = 100;
  }

  if (goal === "LOSE_WEIGHT" && adjustment === 0 && calorieTarget > 0) {
    adjustment = -100;
  }

  if (recoveryScore < 40) {
    adjustment += 100;
  }

  return adjustment;
}

export function buildDecision({ context, dailyMetrics, scores, states }) {
  const goal = normalizeGoal(context.profile?.fitnessGoal);
  const coachingTone = pickCoachingTone(states);
  const recommendedWorkout = buildWorkoutRecommendation(goal, states);

  const calorieAdjustment = resolveCalorieAdjustment({
    goal,
    states,
    avgCalories: dailyMetrics.avgDailyCalories,
    calorieTarget: toNumber(scores.targets?.calorieTarget, 0),
    recoveryScore: scores.recovery.score,
  });

  const habitFocus = [];
  const nutritionLoggingRate = safeDivide(dailyMetrics.nutritionDays, dailyMetrics.windowDays, 0);

  if (nutritionLoggingRate < 0.4) {
    habitFocus.push("log meals consistently");
  }

  if (scores.recovery.score < 45) {
    habitFocus.push("prioritize sleep and recovery");
  }

  if (dailyMetrics.stepGoalHitDays === 0) {
    habitFocus.push("add a short walk today");
  }

  if (dailyMetrics.avgHydrationProgress < 70) {
    habitFocus.push("increase hydration");
  }

  const streakAction = dailyMetrics.streakDays > 0
    ? "protect the streak with a short session"
    : "start a new streak with a 15-minute session";

  const rationale = [];
  if (hasState(states, "overtrainingRisk")) rationale.push("fatigue is high and recovery is low");
  if (hasState(states, "decliningActivity")) rationale.push("recent activity is trending down");
  if (hasState(states, "calorieSurplus")) rationale.push("calorie intake is above target");
  if (hasState(states, "calorieDeficit")) rationale.push("calorie intake is below target");
  if (hasState(states, "plateauDetected")) rationale.push("progress has plateaued despite consistency");

  return {
    coachingTone,
    recommendedWorkout,
    calorieAdjustment,
    recoveryRecommendation:
      scores.recovery.score < 45 ? "focus on sleep, hydration, and mobility" : "maintain balanced recovery",
    habitFocus: habitFocus.slice(0, 3),
    streakAction,
    rationale,
  };
}
