import { normalizeGoal, toNumber } from "./utils.js";

const PRIORITY_ORDER = [
  "overtrainingRisk",
  "recoveryNeeded",
  "motivationDrop",
  "decliningActivity",
  "plateauDetected",
  "calorieDeficit",
  "calorieSurplus",
  "highConsistency",
];

function addState(stateMap, id, reason, severity) {
  if (!stateMap[id]) {
    stateMap[id] = { id, severity, reasons: [] };
  }
  if (reason) {
    stateMap[id].reasons.push(reason);
  }
  stateMap[id].severity = Math.max(stateMap[id].severity, severity);
}

export function classifyStates({ context, dailyMetrics, scores, trends }) {
  const states = {};
  const avgCalories = toNumber(dailyMetrics.avgDailyCalories, 0);
  const calorieTarget = toNumber(scores.targets?.calorieTarget, 0);

  if (scores.fatigue.score >= 70 && scores.recovery.score <= 45) {
    addState(states, "overtrainingRisk", "High fatigue with low recovery", 3);
  }

  if (scores.recovery.score < 40) {
    addState(states, "recoveryNeeded", "Recovery score is low", 3);
  }

  if (scores.motivation.score < 40) {
    addState(states, "motivationDrop", "Motivation score is low", 2);
  }

  if (scores.consistency.score < 40 || trends.activity?.direction === "down") {
    addState(states, "decliningActivity", "Activity trend is declining", 2);
  }

  if (scores.progress.score < 45 && scores.consistency.score >= 60) {
    addState(states, "plateauDetected", "Consistency is solid but progress is flat", 2);
  }

  if (calorieTarget > 0 && avgCalories > calorieTarget + 200) {
    addState(states, "calorieSurplus", "Average intake is above target", 1);
  }

  if (calorieTarget > 0 && avgCalories < calorieTarget - 200) {
    addState(states, "calorieDeficit", "Average intake is below target", 1);
  }

  if (scores.consistency.score >= 75) {
    addState(states, "highConsistency", "Consistency score is high", 1);
  }

  const active = Object.values(states).sort((a, b) => b.severity - a.severity);
  const primary = PRIORITY_ORDER.find((id) => states[id]) || "steady";

  return {
    primary,
    active: active.map((state) => state.id),
    details: states,
    goal: normalizeGoal(context.profile?.fitnessGoal),
  };
}
