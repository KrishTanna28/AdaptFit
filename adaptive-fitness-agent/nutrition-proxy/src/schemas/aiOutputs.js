import { z } from "zod";
import {
  DateKeySchema,
  NonEmptyStringSchema,
  NonNegativeIntSchema,
  NonNegativeNumberSchema,
  PositiveIntSchema,
  RatioSchema,
} from "./primitives.js";

export const MAX_WORKOUT_TITLE_LENGTH = 80;
export const MAX_WORKOUT_NAME_LENGTH = 80;
export const MAX_WORKOUT_EXERCISES = 16;
export const MAX_MEAL_TITLE_LENGTH = 80;
export const MAX_MEAL_NAME_LENGTH = 90;
export const MAX_MEAL_ITEM_LENGTH = 60;
export const MAX_MEAL_ITEMS = 8;
export const MAX_PLAN_MEALS = 4;

const nonEmptyLimitedString = (maxLength) => NonEmptyStringSchema.max(maxLength);
const optionalNonNegativeNumber = NonNegativeNumberSchema.default(0);

export const AiUsageSchema = z
  .object({
    promptTokenCount: NonNegativeIntSchema,
    candidatesTokenCount: NonNegativeIntSchema,
    totalTokenCount: NonNegativeIntSchema,
  })
  .strict();

export const CoachWorkoutExerciseSchema = z
  .object({
    name: nonEmptyLimitedString(MAX_WORKOUT_NAME_LENGTH),
    sets: PositiveIntSchema,
    reps: PositiveIntSchema,
  })
  .strict();

export const CoachWorkoutPlanSchema = z
  .object({
    title: nonEmptyLimitedString(MAX_WORKOUT_TITLE_LENGTH),
    exercises: z.array(CoachWorkoutExerciseSchema).min(1).max(MAX_WORKOUT_EXERCISES),
  })
  .strict();

export const CoachMealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snacks"]);

export const CoachMealPlanMealSchema = z
  .object({
    mealType: CoachMealTypeSchema,
    name: nonEmptyLimitedString(MAX_MEAL_NAME_LENGTH),
    items: z.array(z.string().trim().max(MAX_MEAL_ITEM_LENGTH)).max(MAX_MEAL_ITEMS).default([]),
    calories: optionalNonNegativeNumber,
    protein: optionalNonNegativeNumber,
    carbs: optionalNonNegativeNumber,
    fat: optionalNonNegativeNumber,
    fiber: optionalNonNegativeNumber,
    sodiumMg: optionalNonNegativeNumber,
    potassiumMg: optionalNonNegativeNumber,
    calciumMg: optionalNonNegativeNumber,
    ironMg: optionalNonNegativeNumber,
    vitaminCMg: optionalNonNegativeNumber,
  })
  .strict();

export const CoachMealPlanSchema = z
  .object({
    title: nonEmptyLimitedString(MAX_MEAL_TITLE_LENGTH),
    meals: z.array(CoachMealPlanMealSchema).min(1).max(MAX_PLAN_MEALS),
  })
  .strict();

export const HomeInsightSchema = z
  .object({
    title: nonEmptyLimitedString(80),
    summary: nonEmptyLimitedString(180),
    focus: z.string().trim().max(80).default("Consistency"),
    actions: z.array(z.string().trim().min(1).max(120)).max(3).default([]),
  })
  .strict();

export const CoachCriticResultSchema = z
  .object({
    approved: z.boolean(),
    issues: z.array(z.string().trim().min(1).max(160)).max(6).default([]),
    refinedReply: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();

export const CoachToolArgumentsSchema = z
  .object({
    dateKey: DateKeySchema.optional(),
    mealType: CoachMealTypeSchema.optional(),
    name: z.string().trim().min(1).max(MAX_MEAL_NAME_LENGTH).optional(),
    calories: NonNegativeNumberSchema.optional(),
    protein: NonNegativeNumberSchema.optional(),
    carbs: NonNegativeNumberSchema.optional(),
    fat: NonNegativeNumberSchema.optional(),
    fiber: NonNegativeNumberSchema.optional(),
    workoutName: z.string().trim().min(1).max(120).optional(),
    workoutMode: z.enum(["cardio", "strength", "sports"]).optional(),
    durationMin: NonNegativeNumberSchema.optional(),
    sets: PositiveIntSchema.optional(),
    reps: PositiveIntSchema.optional(),
    activeCalories: NonNegativeNumberSchema.optional(),
    intensity: z.enum(["low", "moderate", "vigorous"]).optional(),
    steps: NonNegativeIntSchema.optional(),
    goal: NonNegativeIntSchema.optional(),
    missingFields: z.array(z.string().trim().min(1).max(60)).max(6).default([]),
  })
  .strict();

export const CoachToolDecisionSchema = z
  .object({
    toolName: z.enum(["none", "log_meal", "log_workout", "log_steps"]),
    confidence: RatioSchema,
    arguments: CoachToolArgumentsSchema.default({}),
  })
  .strict();

export const TranscriptionOutputSchema = z
  .object({
    text: NonEmptyStringSchema.max(10000),
    model: z.string().trim().min(1).optional(),
    usage: AiUsageSchema.nullable().optional(),
  })
  .strict();

export const AiOutputSchema = z.union([
  CoachWorkoutPlanSchema,
  CoachMealPlanSchema,
  HomeInsightSchema,
  CoachCriticResultSchema,
  CoachToolDecisionSchema,
  TranscriptionOutputSchema,
]);

function safeString(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function toPositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Math.round(n);
}

function toNonNegativeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.round(n * 10) / 10;
}

function normalizeMealType(value) {
  const normalized = safeString(value, 30).toLowerCase();
  if (normalized === "breakfast") return "breakfast";
  if (normalized === "lunch") return "lunch";
  if (normalized === "dinner") return "dinner";
  if (normalized === "snack" || normalized === "snacks") return "snacks";
  return "";
}

export function repairCoachWorkoutPlan(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const exercises = (Array.isArray(raw.exercises) ? raw.exercises : [])
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const name = safeString(item.name, MAX_WORKOUT_NAME_LENGTH);
      const sets = toPositiveInt(item.sets);
      const reps = toPositiveInt(item.reps);
      if (!name || !sets || !reps) {
        return null;
      }
      return { name, sets, reps };
    })
    .filter((item) => item !== null)
    .slice(0, MAX_WORKOUT_EXERCISES);

  return {
    title: safeString(raw.title, MAX_WORKOUT_TITLE_LENGTH),
    exercises,
  };
}

export function repairCoachMealPlan(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const meals = (Array.isArray(raw.meals) ? raw.meals : [])
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const mealType = normalizeMealType(item.mealType);
      const name = safeString(item.name, MAX_MEAL_NAME_LENGTH);
      if (!mealType || !name) {
        return null;
      }

      return {
        mealType,
        name,
        items: Array.isArray(item.items)
          ? item.items
              .map((food) => safeString(food, MAX_MEAL_ITEM_LENGTH))
              .filter(Boolean)
              .slice(0, MAX_MEAL_ITEMS)
          : [],
        calories: toNonNegativeNumber(item.calories),
        protein: toNonNegativeNumber(item.protein),
        carbs: toNonNegativeNumber(item.carbs),
        fat: toNonNegativeNumber(item.fat),
        fiber: toNonNegativeNumber(item.fiber),
        sodiumMg: toNonNegativeNumber(item.sodiumMg),
        potassiumMg: toNonNegativeNumber(item.potassiumMg),
        calciumMg: toNonNegativeNumber(item.calciumMg),
        ironMg: toNonNegativeNumber(item.ironMg),
        vitaminCMg: toNonNegativeNumber(item.vitaminCMg),
      };
    })
    .filter((item) => item !== null)
    .slice(0, MAX_PLAN_MEALS);

  return {
    title: safeString(raw.title, MAX_MEAL_TITLE_LENGTH),
    meals,
  };
}

export function repairHomeInsight(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  return {
    title: safeString(raw.title, 80),
    summary: safeString(raw.summary, 180),
    focus: safeString(raw.focus, 80) || "Consistency",
    actions: Array.isArray(raw.actions)
      ? raw.actions.map((item) => safeString(item, 120)).filter(Boolean).slice(0, 3)
      : [],
  };
}

export function repairCoachCriticResult(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  return {
    approved: Boolean(raw.approved),
    issues: Array.isArray(raw.issues)
      ? raw.issues.map((item) => safeString(item, 160)).filter(Boolean).slice(0, 6)
      : [],
    refinedReply:
      typeof raw.refinedReply === "string" && raw.refinedReply.trim()
        ? safeString(raw.refinedReply, 4000)
        : null,
  };
}

function toOptionalDateKey(value) {
  const text = safeString(value, 10);
  return DateKeySchema.safeParse(text).success ? text : undefined;
}

function toOptionalMealType(value) {
  const mealType = normalizeMealType(value);
  return mealType || undefined;
}

function toOptionalNonNegativeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return undefined;
  }
  return Math.round(n * 10) / 10;
}

function toOptionalPositiveInt(value) {
  const n = toPositiveInt(value);
  return n ?? undefined;
}

function toOptionalEnum(value, allowed) {
  const normalized = safeString(value, 40).toLowerCase();
  return allowed.includes(normalized) ? normalized : undefined;
}

export function repairCoachToolDecision(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const rawArgs = raw.arguments && typeof raw.arguments === "object" && !Array.isArray(raw.arguments)
    ? raw.arguments
    : {};
  const normalizedToolName = safeString(raw.toolName, 40).toLowerCase();
  const toolName = ["none", "log_meal", "log_workout", "log_steps"].includes(normalizedToolName)
    ? normalizedToolName
    : "none";
  const args = {
    dateKey: toOptionalDateKey(rawArgs.dateKey),
    mealType: toOptionalMealType(rawArgs.mealType),
    name: safeString(rawArgs.name, MAX_MEAL_NAME_LENGTH) || undefined,
    calories: toOptionalNonNegativeNumber(rawArgs.calories),
    protein: toOptionalNonNegativeNumber(rawArgs.protein),
    carbs: toOptionalNonNegativeNumber(rawArgs.carbs),
    fat: toOptionalNonNegativeNumber(rawArgs.fat),
    fiber: toOptionalNonNegativeNumber(rawArgs.fiber),
    workoutName: safeString(rawArgs.workoutName, 120) || undefined,
    workoutMode: toOptionalEnum(rawArgs.workoutMode, ["cardio", "strength", "sports"]),
    durationMin: toOptionalNonNegativeNumber(rawArgs.durationMin),
    sets: toOptionalPositiveInt(rawArgs.sets),
    reps: toOptionalPositiveInt(rawArgs.reps),
    activeCalories: toOptionalNonNegativeNumber(rawArgs.activeCalories),
    intensity: toOptionalEnum(rawArgs.intensity, ["low", "moderate", "vigorous"]),
    steps: toOptionalPositiveInt(rawArgs.steps),
    goal: toOptionalPositiveInt(rawArgs.goal),
    missingFields: Array.isArray(rawArgs.missingFields)
      ? rawArgs.missingFields.map((item) => safeString(item, 60)).filter(Boolean).slice(0, 6)
      : [],
  };

  return {
    toolName,
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0)),
    arguments: Object.fromEntries(
      Object.entries(args).filter(([_key, value]) => value !== undefined),
    ),
  };
}
