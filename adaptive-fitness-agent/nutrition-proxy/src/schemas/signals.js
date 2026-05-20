import { z } from "zod";
import {
  DateKeySchema,
  CoercedFiniteNumberSchema,
  NonNegativeIntSchema,
  NonNegativeNumberSchema,
  NullableNumberSchema,
  SerializableValueSchema,
} from "./primitives.js";
import { ContextWindowSchema, UserProfileSchema } from "./firestore.js";

export const ScoreLevelSchema = z.enum(["very_low", "low", "moderate", "high"]);
export const TrendDirectionSchema = z.enum(["up", "down", "flat"]);
export const CoachingStateSchema = z.enum([
  "READY",
  "FATIGUED",
  "RECOVERING",
  "OVERTRAINING_RISK",
  "HIGH_MOMENTUM",
  "LOW_ADHERENCE",
  "PLATEAUING",
  "steady",
  "overtrainingRisk",
  "recoveryNeeded",
  "motivationDrop",
  "decliningActivity",
  "plateauDetected",
  "calorieDeficit",
  "calorieSurplus",
  "highConsistency",
]);

export const TrendSchema = z
  .object({
    slope: CoercedFiniteNumberSchema,
    direction: TrendDirectionSchema,
    currentAvg: CoercedFiniteNumberSchema,
    previousAvg: CoercedFiniteNumberSchema,
    changePct: CoercedFiniteNumberSchema,
  })
  .strict();

const ScoreSchema = z
  .object({
    score: NonNegativeNumberSchema.max(100),
    level: ScoreLevelSchema,
    components: z.record(z.string(), SerializableValueSchema).optional(),
  })
  .strict();

export const DeterministicScoresSchema = z
  .object({
    targets: z
      .object({
        workoutsPerWeek: NonNegativeNumberSchema,
        calorieTarget: NullableNumberSchema,
        proteinTarget: NullableNumberSchema,
        stepGoal: NullableNumberSchema,
        sleepHoursTarget: NonNegativeNumberSchema,
        bmr: NullableNumberSchema,
        tdee: NullableNumberSchema,
      })
      .strict(),
    consistency: ScoreSchema,
    recovery: ScoreSchema,
    fatigue: ScoreSchema,
    nutrition: ScoreSchema,
    adherence: ScoreSchema,
    motivation: ScoreSchema,
    progress: ScoreSchema,
  })
  .strict();

export const CoachStateSummarySchema = z
  .object({
    primary: CoachingStateSchema.or(z.string().min(1)),
    active: z.array(CoachingStateSchema.or(z.string().min(1))),
    details: z.record(
      z.string(),
      z
        .object({
          id: z.string(),
          severity: NonNegativeIntSchema,
          reasons: z.array(z.string()),
        })
        .strict(),
    ),
    goal: z.string(),
  })
  .strict();

export const DecisionSchema = z
  .object({
    coachingTone: z.string(),
    recommendedWorkout: z
      .object({
        type: z.string(),
        intensity: z.string(),
        durationMin: NonNegativeNumberSchema,
        focus: z.string(),
      })
      .strict(),
    calorieAdjustment: CoercedFiniteNumberSchema,
    recoveryRecommendation: z.string(),
    habitFocus: z.array(z.string()),
    streakAction: z.string(),
    rationale: z.array(z.string()),
  })
  .strict();

export const SignalPacketSchema = z
  .object({
    version: z.string(),
    generatedAt: z.string(),
    currentDateKey: DateKeySchema,
    window: ContextWindowSchema,
    profile: UserProfileSchema,
    scores: z.record(
      z.string(),
      z
        .object({
          score: NonNegativeNumberSchema.max(100),
          level: ScoreLevelSchema,
        })
        .strict(),
    ),
    targets: DeterministicScoresSchema.shape.targets,
    states: z
      .object({
        primary: z.string(),
        active: z.array(z.string()),
      })
      .strict(),
    decisions: DecisionSchema,
    trends: z.record(z.string(), TrendSchema),
    recency: z.record(z.string(), SerializableValueSchema),
    memory: z.record(z.string(), SerializableValueSchema),
    dataCoverage: z.record(z.string(), SerializableValueSchema),
    signals: z.array(z.string()),
    safety: z
      .object({
        state: CoachingStateSchema,
        safeToTrainHard: z.boolean(),
        violations: z.array(
          z
            .object({
              id: z.string(),
              severity: z.enum(["low", "medium", "high"]),
              message: z.string(),
            })
            .strict(),
        ),
      })
      .strict()
      .optional(),
  })
  .strict();

export const DeterministicEngineOutputSchema = z
  .object({
    version: z.string(),
    generatedAt: z.string(),
    scores: DeterministicScoresSchema,
    states: CoachStateSummarySchema,
    decisions: DecisionSchema,
    trends: z.record(z.string(), TrendSchema),
    memory: z.record(z.string(), SerializableValueSchema),
    compact: SignalPacketSchema,
  })
  .strict();
