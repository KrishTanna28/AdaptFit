import { FieldValue } from "firebase-admin/firestore";

import {
  CoachToolDecisionSchema,
  repairCoachToolDecision,
} from "../schemas/aiOutputs.js";
import { DateKeySchema } from "../schemas/primitives.js";
import { parseLlmJsonWithSchema } from "../schemas/validators.js";
import { publishIntelligenceEvent } from "../events/eventBus.js";
import { errorToLog, logger } from "../observability/logger.js";

const TOOL_CONFIDENCE_THRESHOLD = Number(process.env.COACH_TOOL_CONFIDENCE_THRESHOLD ?? 0.65);

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getPlannerDates() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    currentDateKey: toDateKey(today),
    yesterdayDateKey: toDateKey(addDays(today, -1)),
  };
}

function normalizeDateKey(value, fallback) {
  const text = String(value ?? "").trim();
  return DateKeySchema.safeParse(text).success ? text : fallback;
}

function toStringValue(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function toNonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : fallback;
}

function toPositiveIntOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Math.round(n);
}

function toPositiveInt(value, fallback = 1) {
  return toPositiveIntOrNull(value) ?? fallback;
}

function hasAnyNumber(values) {
  return values.some((value) => Number.isFinite(Number(value)) && Number(value) > 0);
}

function buildToolPlannerSystemPrompt() {
  return [
    "You are Aether's tool planner. Decide whether the user is asking the app to write a log entry.",
    "Return ONLY valid JSON. Do not include markdown.",
    "Available toolName values:",
    "none: no write action should run.",
    "log_meal: log a completed meal or food item.",
    "log_workout: log a completed workout or exercise session.",
    "log_steps: log a completed step count.",
    "Rules:",
    "Use a logging tool only when the user clearly wants to save, record, add, track, or log completed data.",
    "Do not call tools for advice, explanations, plans, future workouts, future meal plans, or vague mentions.",
    "If required details are missing, still choose the matching tool and put missing field names in arguments.missingFields.",
    "Use currentDateKey for today or no date, and yesterdayDateKey for yesterday.",
    "Omit optional argument fields when unknown. Do not use null.",
    "Schema:",
    JSON.stringify({
      toolName: "none | log_meal | log_workout | log_steps",
      confidence: "number from 0 to 1",
      arguments: {
        dateKey: "YYYY-MM-DD",
        mealType: "breakfast | lunch | dinner | snacks",
        name: "meal or food name",
        calories: "number",
        protein: "grams",
        carbs: "grams",
        fat: "grams",
        fiber: "grams",
        workoutName: "exercise or session name",
        workoutMode: "cardio | strength | sports",
        durationMin: "number",
        sets: "integer",
        reps: "integer",
        activeCalories: "number",
        intensity: "low | moderate | vigorous",
        steps: "integer",
        goal: "integer",
        missingFields: ["fieldName"],
      },
    }),
  ].join("\n");
}

function buildToolPlannerUserPrompt({ message, currentDateKey, yesterdayDateKey }) {
  return [
    `currentDateKey: ${currentDateKey}`,
    `yesterdayDateKey: ${yesterdayDateKey}`,
    "User message:",
    message,
  ].join("\n");
}

async function planCoachToolCall({ aiProvider, message }) {
  if (!aiProvider?.generateCoachText) {
    return null;
  }

  const dates = getPlannerDates();
  try {
    const response = await aiProvider.generateCoachText({
      systemPrompt: buildToolPlannerSystemPrompt(),
      userPrompt: buildToolPlannerUserPrompt({
        message,
        ...dates,
      }),
      history: [],
    });

    return parseLlmJsonWithSchema({
      text: response.text,
      schema: CoachToolDecisionSchema,
      repair: repairCoachToolDecision,
      fallback: null,
      label: "coach-tool-decision",
    });
  } catch (error) {
    logger.warn({ err: errorToLog(error) }, "Coach tool planner failed; continuing without tool call.");
    return null;
  }
}

function userRef(db, uid) {
  return db.collection("users").doc(uid);
}

async function publishToolEvent(event) {
  try {
    await publishIntelligenceEvent({
      ...event,
      source: "coach-tool",
    });
  } catch {
    // Tool writes are the user-facing action; event delivery should not fail the chat.
  }
}

function needsInput(toolName, message, missingFields = []) {
  return {
    toolName,
    status: "needs_input",
    message,
    payload: {
      missingFields,
    },
  };
}

async function logMeal({ db, uid, args }) {
  const { currentDateKey } = getPlannerDates();
  const missingFields = Array.isArray(args.missingFields) ? args.missingFields : [];
  const hasNutrition = hasAnyNumber([
    args.calories,
    args.protein,
    args.carbs,
    args.fat,
    args.fiber,
  ]);
  const parsedName = toStringValue(args.name).slice(0, 90);

  if (missingFields.length || (!parsedName && !hasNutrition)) {
    return needsInput(
      "log_meal",
      "Tell me the meal name or nutrition details to log.",
      missingFields.length ? missingFields : ["name"],
    );
  }

  const dateKey = normalizeDateKey(args.dateKey, currentDateKey);
  const entryId = `coach-meal-${Date.now()}`;
  const mealType = args.mealType ?? "snacks";
  const entry = {
    id: entryId,
    mealType,
    name: parsedName || "Logged meal",
    source: "Manual",
    quantity: 1,
    unit: "serving",
    calories: toNonNegativeNumber(args.calories),
    protein: toNonNegativeNumber(args.protein),
    carbs: toNonNegativeNumber(args.carbs),
    fat: toNonNegativeNumber(args.fat),
    fiber: toNonNegativeNumber(args.fiber),
    sodiumMg: 0,
    potassiumMg: 0,
    calciumMg: 0,
    ironMg: 0,
    vitaminCMg: 0,
    loggedAt: new Date().toISOString(),
  };

  await Promise.all([
    userRef(db, uid).collection("nutritionLogs").doc(dateKey).collection("entries").doc(entryId).set(entry, { merge: true }),
    userRef(db, uid).collection("nutritionLogs").doc(dateKey).set(
      {
        dateKey,
        usesEntryDocs: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
  ]);

  await publishToolEvent({
    type: "meal_logged",
    uid,
    payload: {
      dateKey,
      entryId,
      mealType,
    },
  });

  return {
    toolName: "log_meal",
    status: "success",
    message: `Logged ${entry.name} to ${mealType}.`,
    payload: {
      dateKey,
      entryId,
      mealType,
      name: entry.name,
      calories: entry.calories,
      protein: entry.protein,
    },
  };
}

async function logWorkout({ db, uid, args }) {
  const { currentDateKey } = getPlannerDates();
  const missingFields = Array.isArray(args.missingFields) ? args.missingFields : [];
  const workoutName = toStringValue(args.workoutName).slice(0, 120);
  const sets = toPositiveIntOrNull(args.sets);
  const reps = toPositiveIntOrNull(args.reps);
  const hasWorkoutDetails = hasAnyNumber([args.durationMin, args.activeCalories]) || Boolean(sets || reps);

  if (missingFields.length || (!workoutName && !hasWorkoutDetails)) {
    return needsInput(
      "log_workout",
      "Tell me the workout name, duration, or sets and reps to log.",
      missingFields.length ? missingFields : ["workoutName"],
    );
  }

  const dateKey = normalizeDateKey(args.dateKey, currentDateKey);
  const entryId = `coach-workout-${Date.now()}`;
  const workoutMode = args.workoutMode ?? (sets || reps ? "strength" : "cardio");
  const entry = {
    id: entryId,
    exerciseId: "",
    workoutName: workoutName || "Logged workout",
    workoutMode,
    durationMin: Math.max(1, Math.round(toNonNegativeNumber(args.durationMin, 1))),
    sets,
    reps,
    secPerRep: null,
    restBetweenSetsSec: null,
    setupSec: null,
    minSessionMin: null,
    intensity: args.intensity ?? "moderate",
    metRowId: "",
    metActivity: "",
    metValue: 0,
    caloriesGross: 0,
    caloriesActive: Math.max(0, Math.round(toNonNegativeNumber(args.activeCalories))),
    datasetVersion: "",
    resolverVersion: "",
    mappingSource: "auto",
    loggedAt: new Date().toISOString(),
  };

  await Promise.all([
    userRef(db, uid).collection("workoutLogs").doc(dateKey).collection("entries").doc(entryId).set(entry, { merge: true }),
    userRef(db, uid).collection("workoutLogs").doc(dateKey).set(
      {
        dateKey,
        usesEntryDocs: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
  ]);

  await publishToolEvent({
    type: "workout_logged",
    uid,
    payload: {
      dateKey,
      entryId,
      workoutName: entry.workoutName,
    },
  });

  return {
    toolName: "log_workout",
    status: "success",
    message: `Logged ${entry.workoutName} for ${String(entry.durationMin)} min.`,
    payload: {
      dateKey,
      entryId,
      workoutName: entry.workoutName,
      durationMin: entry.durationMin,
      workoutMode,
    },
  };
}

async function logSteps({ db, uid, args }) {
  const { currentDateKey } = getPlannerDates();
  const missingFields = Array.isArray(args.missingFields) ? args.missingFields : [];
  const steps = toPositiveIntOrNull(args.steps);

  if (missingFields.length || steps === null) {
    return needsInput(
      "log_steps",
      "Tell me how many steps to log.",
      missingFields.length ? missingFields : ["steps"],
    );
  }

  const dateKey = normalizeDateKey(args.dateKey, currentDateKey);
  const goal = toPositiveIntOrNull(args.goal);
  const payload = {
    dateKey,
    steps,
    source: "none",
    loggedAt: new Date().toISOString(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (goal !== null) {
    payload.goal = goal;
  }

  await userRef(db, uid).collection("stepLogs").doc(dateKey).set(payload, { merge: true });

  await publishToolEvent({
    type: "steps_updated",
    uid,
    payload: {
      dateKey,
      steps,
      goal: goal ?? undefined,
      source: "coach",
    },
  });

  return {
    toolName: "log_steps",
    status: "success",
    message: `Logged ${steps.toLocaleString("en-US")} steps.`,
    payload: {
      dateKey,
      steps,
      goal: goal ?? undefined,
    },
  };
}

export async function executeCoachToolActions({ db, uid, message, aiProvider }) {
  const decision = await planCoachToolCall({ aiProvider, message });
  if (!decision || decision.toolName === "none" || decision.confidence < TOOL_CONFIDENCE_THRESHOLD) {
    return [];
  }

  const args = decision.arguments ?? {};
  if (decision.toolName === "log_meal") {
    return [await logMeal({ db, uid, args })];
  }

  if (decision.toolName === "log_workout") {
    return [await logWorkout({ db, uid, args })];
  }

  if (decision.toolName === "log_steps") {
    return [await logSteps({ db, uid, args })];
  }

  return [];
}

export function hasSuccessfulToolResult(toolResults) {
  return (Array.isArray(toolResults) ? toolResults : []).some((result) => result?.status === "success");
}
