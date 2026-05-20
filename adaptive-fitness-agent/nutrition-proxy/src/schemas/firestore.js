import { z } from "zod";
import {
  DateKeySchema,
  NonNegativeIntSchema,
  NonNegativeNumberSchema,
  NullableNumberSchema,
  NullableStringSchema,
  SerializableRecordSchema,
  SerializableValueSchema,
} from "./primitives.js";

export const UserProfileSchema = z
  .object({
    age: NullableNumberSchema,
    gender: NullableStringSchema,
    heightCm: NullableNumberSchema,
    weightKg: NullableNumberSchema,
    fitnessGoal: NullableStringSchema,
    lifestyle: NullableStringSchema,
    dietType: NullableStringSchema,
    injuries: NullableStringSchema,
    medicalConditions: NullableStringSchema,
    allergies: z.array(z.string()),
    foodRestrictions: NullableStringSchema,
  })
  .strict();

export const ProfileHistoryEntrySchema = z
  .object({
    id: NullableStringSchema,
    changedAt: SerializableValueSchema.nullable(),
    changedFields: z.array(z.string()),
    snapshot: UserProfileSchema,
    source: NullableStringSchema,
  })
  .strict();

export const NutritionEntryDocumentSchema = z
  .object({
    dateKey: DateKeySchema,
    id: z.string(),
    mealType: z.string(),
    name: z.string(),
    source: z.string(),
    quantity: NonNegativeNumberSchema,
    unit: z.string(),
    calories: NonNegativeNumberSchema,
    protein: NonNegativeNumberSchema,
    carbs: NonNegativeNumberSchema,
    fat: NonNegativeNumberSchema,
    fiber: NonNegativeNumberSchema,
    sodiumMg: NonNegativeNumberSchema,
    potassiumMg: NonNegativeNumberSchema,
    calciumMg: NonNegativeNumberSchema,
    ironMg: NonNegativeNumberSchema,
    vitaminCMg: NonNegativeNumberSchema,
    loggedAt: NullableStringSchema,
    raw: SerializableValueSchema,
  })
  .strict();

export const WorkoutEntryDocumentSchema = z
  .object({
    dateKey: DateKeySchema,
    id: z.string(),
    exerciseId: z.string(),
    workoutName: z.string(),
    workoutMode: z.string(),
    durationMin: NonNegativeNumberSchema,
    sets: NullableNumberSchema,
    reps: NullableNumberSchema,
    secPerRep: NullableNumberSchema,
    restBetweenSetsSec: NullableNumberSchema,
    setupSec: NullableNumberSchema,
    minSessionMin: NullableNumberSchema,
    intensity: z.string(),
    metRowId: z.string(),
    metActivity: z.string(),
    metValue: NonNegativeNumberSchema,
    caloriesActive: NonNegativeNumberSchema,
    caloriesGross: NonNegativeNumberSchema,
    datasetVersion: z.string(),
    resolverVersion: z.string(),
    mappingSource: z.string(),
    loggedAt: NullableStringSchema,
    raw: SerializableValueSchema,
  })
  .strict();

export const StepLogDocumentSchema = z
  .object({
    dateKey: DateKeySchema,
    steps: NonNegativeIntSchema,
    goal: NonNegativeIntSchema,
    source: z.string(),
    loggedAt: NullableStringSchema,
    updatedAt: NullableStringSchema,
  })
  .strict();

export const LifestyleLogDocumentSchema = z
  .object({
    dateKey: DateKeySchema,
    hydration: z
      .object({
        intakeMl: NonNegativeIntSchema,
        goalMl: NonNegativeIntSchema,
        progressPercent: NullableNumberSchema,
        updatedAt: NullableStringSchema,
      })
      .strict(),
    weather: z
      .object({
        locationName: z.string(),
        temperatureC: NullableNumberSchema,
        humidityPercent: NullableNumberSchema,
        condition: z.string(),
        fetchedAt: NullableStringSchema,
      })
      .strict(),
    recovery: z
      .object({
        sleepHours: NullableNumberSchema,
        sleepQuality: NullableNumberSchema,
        stressLevel: NullableNumberSchema,
        notes: z.string(),
        loggedAt: NullableStringSchema,
      })
      .strict(),
    raw: SerializableValueSchema,
  })
  .strict();

export const ContextWindowSchema = z
  .object({
    includeAllHistory: z.boolean(),
    requestedDays: NonNegativeIntSchema,
    averagingDays: NonNegativeIntSchema,
    nutritionDays: NonNegativeIntSchema,
    workoutDays: NonNegativeIntSchema,
    fromDateKey: DateKeySchema.nullable(),
    toDateKey: DateKeySchema.nullable(),
  })
  .strict();

export const CoachConversationMessageDocumentSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    createdAt: SerializableValueSchema.optional(),
    model: z.string().optional(),
    usage: SerializableValueSchema.optional(),
  })
  .passthrough();

const DailyNutritionSummarySchema = z
  .object({
    dateKey: DateKeySchema,
    calories: NonNegativeNumberSchema,
    protein: NonNegativeNumberSchema,
    carbs: NonNegativeNumberSchema,
    fat: NonNegativeNumberSchema,
    mealsLogged: NonNegativeIntSchema,
  })
  .strict();

const DailyWorkoutSummarySchema = z
  .object({
    dateKey: DateKeySchema,
    sessions: NonNegativeIntSchema,
    durationMin: NonNegativeNumberSchema,
    activeCalories: NonNegativeNumberSchema,
  })
  .strict();

const DailyLifestyleSummarySchema = z
  .object({
    dateKey: DateKeySchema,
    hydrationMl: NonNegativeNumberSchema,
    hydrationGoalMl: NonNegativeNumberSchema,
    hydrationProgressPercent: NullableNumberSchema,
    sleepHours: NullableNumberSchema,
    sleepQuality: NullableNumberSchema,
    stressLevel: NullableNumberSchema,
    weatherCondition: NullableStringSchema,
    temperatureC: NullableNumberSchema,
    humidityPercent: NullableNumberSchema,
  })
  .strict();

const EntriesByDaySchema = (entrySchema) =>
  z
    .object({
      dateKey: DateKeySchema,
      dayMeta: SerializableValueSchema.nullable(),
      entries: z.array(entrySchema),
    })
    .strict();

export const CoachContextSchema = z
  .object({
    generatedAt: z.string(),
    currentDateKey: DateKeySchema,
    recentDateKeys: z.array(DateKeySchema),
    user: z
      .object({
        uid: z.string().min(1),
        displayName: NullableStringSchema,
        email: NullableStringSchema,
        rawDocument: SerializableRecordSchema,
      })
      .strict(),
    profile: UserProfileSchema,
    profileHistory: z
      .object({
        entries: z.array(ProfileHistoryEntrySchema),
        entryCount: NonNegativeIntSchema,
      })
      .strict(),
    stepGoal: NullableNumberSchema,
    window: ContextWindowSchema,
    recency: z
      .object({
        currentDateKey: DateKeySchema,
        hasNutritionLoggedToday: z.boolean(),
        mealsLoggedToday: NonNegativeIntSchema,
        nutritionCaloriesToday: NonNegativeNumberSchema,
        lastNutritionDateKey: DateKeySchema.nullable(),
        daysSinceLastNutritionLog: NullableNumberSchema,
        hasWorkoutLoggedToday: z.boolean(),
        workoutsLoggedToday: NonNegativeIntSchema,
        workoutDurationMinToday: NonNegativeNumberSchema,
        workoutActiveCaloriesToday: NonNegativeNumberSchema,
        lastWorkoutDateKey: DateKeySchema.nullable(),
        lastWorkoutName: NullableStringSchema,
        daysSinceLastWorkout: NullableNumberSchema,
        workoutGoalTargetActiveCalories: NonNegativeNumberSchema,
        workoutActiveCalorieGapToday: NullableNumberSchema,
        workoutGoalTargetMin: NullableNumberSchema,
        workoutGoalAchievedToday: z.boolean(),
      })
      .strict(),
    nutrition: z
      .object({
        totalCalories: NonNegativeNumberSchema,
        totalProtein: NonNegativeNumberSchema,
        totalCarbs: NonNegativeNumberSchema,
        totalFat: NonNegativeNumberSchema,
        totalMealsLogged: NonNegativeIntSchema,
        avgDailyCalories: NonNegativeNumberSchema,
        avgDailyProtein: NonNegativeNumberSchema,
        avgDailyCarbs: NonNegativeNumberSchema,
        avgDailyFat: NonNegativeNumberSchema,
        daily: z.array(DailyNutritionSummarySchema),
        allEntries: z.array(NutritionEntryDocumentSchema),
        entriesByDay: z.array(EntriesByDaySchema(NutritionEntryDocumentSchema)),
      })
      .strict(),
    workouts: z
      .object({
        sessions: NonNegativeIntSchema,
        totalDurationMin: NonNegativeNumberSchema,
        totalActiveCalories: NonNegativeNumberSchema,
        avgDailyDurationMin: NonNegativeNumberSchema,
        avgDailyActiveCalories: NonNegativeNumberSchema,
        intensityCounts: z
          .object({
            low: NonNegativeIntSchema,
            moderate: NonNegativeIntSchema,
            vigorous: NonNegativeIntSchema,
          })
          .strict(),
        daily: z.array(DailyWorkoutSummarySchema),
        allEntries: z.array(WorkoutEntryDocumentSchema),
        entriesByDay: z.array(EntriesByDaySchema(WorkoutEntryDocumentSchema)),
      })
      .strict(),
    lifestyle: z
      .object({
        daysLogged: NonNegativeIntSchema,
        hydrationDays: NonNegativeIntSchema,
        avgHydrationProgressPercent: NullableNumberSchema,
        recoveryDays: NonNegativeIntSchema,
        avgSleepHours: NullableNumberSchema,
        avgStressLevel: NullableNumberSchema,
        poorRecoveryDays: NonNegativeIntSchema,
        daily: z.array(DailyLifestyleSummarySchema),
        allEntries: z.array(LifestyleLogDocumentSchema),
        entriesByDay: z.array(
          z
            .object({
              dateKey: DateKeySchema,
              log: LifestyleLogDocumentSchema,
            })
            .strict(),
        ),
      })
      .strict(),
    steps: z
      .object({
        totalSteps: NonNegativeIntSchema,
        avgDailySteps: NonNegativeIntSchema,
        daysLogged: NonNegativeIntSchema,
        stepsToday: NonNegativeIntSchema,
        stepGoalToday: NullableNumberSchema,
        goalMetToday: z.boolean().nullable(),
        lastStepDateKey: DateKeySchema.nullable(),
        daysSinceLastStepLog: NullableNumberSchema,
        daily: z.array(StepLogDocumentSchema),
      })
      .strict(),
    signals: z.array(z.string()),
  })
  .strict();
