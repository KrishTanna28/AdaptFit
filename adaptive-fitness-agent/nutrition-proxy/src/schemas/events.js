import { z } from "zod";
import { DateKeySchema, OptionalNonEmptyStringSchema, SerializableRecordSchema } from "./primitives.js";

export const IntelligenceEventTypeSchema = z.enum([
  "workout_logged",
  "meal_logged",
  "steps_updated",
  "hydration_updated",
  "sleep_updated",
  "lifestyle_updated",
  "profile_updated",
  "ai_chat_requested",
]);

const BaseEventSchema = z
  .object({
    eventId: OptionalNonEmptyStringSchema(128),
    uid: z.string().trim().min(1),
    occurredAt: z.string().trim().min(1),
    source: z.string().trim().min(1).default("app"),
  })
  .strict();

export const WorkoutLoggedEventSchema = BaseEventSchema.extend({
  type: z.literal("workout_logged"),
  payload: z
    .object({
      dateKey: DateKeySchema,
      entryId: OptionalNonEmptyStringSchema(128),
      workoutName: OptionalNonEmptyStringSchema(120),
    })
    .strict(),
}).strict();

export const MealLoggedEventSchema = BaseEventSchema.extend({
  type: z.literal("meal_logged"),
  payload: z
    .object({
      dateKey: DateKeySchema,
      entryId: OptionalNonEmptyStringSchema(128),
      mealType: OptionalNonEmptyStringSchema(40),
    })
    .strict(),
}).strict();

export const StepsUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal("steps_updated"),
  payload: z
    .object({
      dateKey: DateKeySchema,
      steps: z.coerce.number().int().min(0).optional(),
      goal: z.coerce.number().int().min(0).optional(),
      source: OptionalNonEmptyStringSchema(80),
    })
    .strict(),
}).strict();

export const HydrationUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal("hydration_updated"),
  payload: z
    .object({
      dateKey: DateKeySchema,
      intakeMl: z.coerce.number().min(0).optional(),
      goalMl: z.coerce.number().min(0).optional(),
    })
    .strict(),
}).strict();

export const SleepUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal("sleep_updated"),
  payload: z
    .object({
      dateKey: DateKeySchema,
      sleepHours: z.coerce.number().min(0).max(24).optional(),
      sleepQuality: z.coerce.number().min(1).max(5).optional(),
      stressLevel: z.coerce.number().min(1).max(5).optional(),
    })
    .strict(),
}).strict();

export const LifestyleUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal("lifestyle_updated"),
  payload: z
    .object({
      dateKey: DateKeySchema,
      changedFields: z.array(z.string()).default([]),
    })
    .passthrough(),
}).strict();

export const ProfileUpdatedEventSchema = BaseEventSchema.extend({
  type: z.literal("profile_updated"),
  payload: z
    .object({
      changedFields: z.array(z.string()).default([]),
    })
    .passthrough(),
}).strict();

export const AiChatRequestedEventSchema = BaseEventSchema.extend({
  type: z.literal("ai_chat_requested"),
  payload: z
    .object({
      conversationId: OptionalNonEmptyStringSchema(128),
      messageId: OptionalNonEmptyStringSchema(128),
      intent: OptionalNonEmptyStringSchema(80),
    })
    .strict(),
}).strict();

export const QueueEventSchema = z.discriminatedUnion("type", [
  WorkoutLoggedEventSchema,
  MealLoggedEventSchema,
  StepsUpdatedEventSchema,
  HydrationUpdatedEventSchema,
  SleepUpdatedEventSchema,
  LifestyleUpdatedEventSchema,
  ProfileUpdatedEventSchema,
  AiChatRequestedEventSchema,
]);

export const QueueJobEnvelopeSchema = z
  .object({
    event: QueueEventSchema,
    attempts: z.coerce.number().int().min(0).default(0),
    metadata: SerializableRecordSchema.default({}),
  })
  .strict();
