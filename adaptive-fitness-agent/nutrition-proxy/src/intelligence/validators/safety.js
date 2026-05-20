import { resolveCoachingState, CoachingState } from "../stateMachines/coachingStateMachine.js";

function violation(id, severity, message) {
  return { id, severity, message };
}

export function validateSafetyForSignalPacket(signalPacket) {
  const violations = [];
  const state = resolveCoachingState(signalPacket);
  const scores = signalPacket?.scores ?? {};
  const recency = signalPacket?.recency ?? {};
  const targets = signalPacket?.targets ?? {};

  if (state === CoachingState.OVERTRAINING_RISK) {
    violations.push(
      violation("overtraining-risk", "high", "Avoid vigorous training until recovery improves."),
    );
  }

  if (state === CoachingState.RECOVERING || (scores.recovery?.score ?? 100) < 40) {
    violations.push(violation("low-recovery", "medium", "Favor mobility, sleep, hydration, and low intensity."));
  }

  if (recency.workoutGoalAchievedToday) {
    violations.push(
      violation("workout-goal-already-met", "medium", "Do not prescribe another hard workout today."),
    );
  }

  const calorieTarget = Number(targets.calorieTarget ?? 0);
  const caloriesToday = Number(recency.nutritionCaloriesToday ?? 0);
  if (calorieTarget > 0 && caloriesToday > 0 && caloriesToday < calorieTarget * 0.55) {
    violations.push(
      violation("unsafe-calorie-deficit", "high", "Avoid encouraging a deeper calorie deficit today."),
    );
  }

  return {
    state,
    safeToTrainHard: !violations.some((item) => item.id === "overtraining-risk" || item.id === "low-recovery"),
    violations,
  };
}

export function validateCoachPlanSafety({ signalPacket, workoutPlan, mealPlan }) {
  const baseSafety = validateSafetyForSignalPacket(signalPacket);
  const violations = [...baseSafety.violations];

  if (workoutPlan && !baseSafety.safeToTrainHard) {
    const totalSets = workoutPlan.exercises?.reduce((sum, item) => sum + Number(item.sets ?? 0), 0) ?? 0;
    if (totalSets >= 12) {
      violations.push(
        violation(
          "workout-volume-too-high",
          "high",
          "Workout plan volume conflicts with recovery and fatigue signals.",
        ),
      );
    }
  }

  if (mealPlan) {
    const totalCalories = mealPlan.meals?.reduce((sum, meal) => sum + Number(meal.calories ?? 0), 0) ?? 0;
    const calorieTarget = Number(signalPacket?.targets?.calorieTarget ?? 0);
    if (calorieTarget > 0 && totalCalories > 0 && totalCalories < calorieTarget * 0.35) {
      violations.push(
        violation("meal-plan-too-low-calorie", "high", "Meal plan calories are too low for the user's target."),
      );
    }
  }

  return {
    ...baseSafety,
    violations,
    allowed: !violations.some((item) => item.severity === "high"),
  };
}

