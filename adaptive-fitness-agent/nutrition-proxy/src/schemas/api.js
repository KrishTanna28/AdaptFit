import { z } from "zod";
import {
  AiUsageSchema,
  CoachMealPlanSchema,
  CoachWorkoutPlanSchema,
  HomeInsightSchema,
} from "./aiOutputs.js";
import { ContextWindowSchema } from "./firestore.js";
import {
  NonEmptyStringSchema,
  NonNegativeIntSchema,
  OptionalNonEmptyStringSchema,
} from "./primitives.js";

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_CONTENT_LENGTH = 20000;
export const MAX_AUDIO_BASE64_LENGTH = 8 * 1024 * 1024;

export const CoachAttachmentSchema = z
  .object({
    name: NonEmptyStringSchema.max(255),
    mimeType: z.string().trim().min(1).max(120).default("application/octet-stream"),
    content: NonEmptyStringSchema.max(MAX_ATTACHMENT_CONTENT_LENGTH),
  })
  .strict();

export const CoachChatRequestSchema = z
  .object({
    message: NonEmptyStringSchema.max(MAX_MESSAGE_LENGTH),
    conversationId: OptionalNonEmptyStringSchema(128),
    contextWindowDays: z.coerce.number().int().min(7).max(30).default(7),
    includeAllHistory: z.boolean().default(true),
    attachments: z.array(CoachAttachmentSchema).max(MAX_ATTACHMENTS).default([]),
  })
  .strict();

export const HomeInsightsQuerySchema = z
  .object({
    contextWindowDays: z.coerce.number().int().min(7).max(30).default(7),
  })
  .partial()
  .strict();

export const TranscribeRequestSchema = z
  .object({
    audioBase64: NonEmptyStringSchema.max(MAX_AUDIO_BASE64_LENGTH),
    mimeType: z.string().trim().min(1).max(120).default("audio/mp4"),
  })
  .strict();

export const CoachChatResponseSchema = z
  .object({
    conversationId: NonEmptyStringSchema.max(128),
    reply: z.string(),
    model: z.string().optional(),
    usage: AiUsageSchema.nullable().optional(),
    contextSignals: z.array(z.string()).optional(),
    contextWindow: ContextWindowSchema.optional(),
    attachmentsUsed: NonNegativeIntSchema,
    workoutPlan: CoachWorkoutPlanSchema.optional(),
    mealPlan: CoachMealPlanSchema.optional(),
  })
  .strict();

export const HomeInsightsResponseSchema = z
  .object({
    insight: HomeInsightSchema,
    model: z.string().optional(),
    usage: AiUsageSchema.nullable().optional(),
    contextSignals: z.array(z.string()).optional(),
    contextWindow: ContextWindowSchema.optional(),
    contextSignature: z.string().optional(),
    cached: z.boolean().optional(),
  })
  .strict();

export const TranscribeResponseSchema = z
  .object({
    text: NonEmptyStringSchema.max(10000),
    model: z.string().optional(),
    usage: AiUsageSchema.nullable().optional(),
  })
  .strict();

export const ConversationMessagesResponseSchema = z
  .object({
    conversationId: NonEmptyStringSchema.max(128),
    messages: z.array(
      z
        .object({
          id: z.string(),
          role: z.enum(["user", "assistant"]),
          content: z.string(),
          createdAt: z.string().nullable(),
          workoutPlan: CoachWorkoutPlanSchema.optional(),
          mealPlan: CoachMealPlanSchema.optional(),
        })
        .passthrough(),
    ),
  })
  .strict();

export const ConversationsResponseSchema = z
  .object({
    conversations: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          lastMessagePreview: z.string(),
          lastMessageRole: z.enum(["user", "assistant"]),
          messageCount: NonNegativeIntSchema,
          createdAt: z.string().nullable(),
          updatedAt: z.string().nullable(),
          lastMessageAt: z.string().nullable(),
        })
        .passthrough(),
    ),
  })
  .strict();

export const DeleteConversationResponseSchema = z
  .object({
    conversationId: NonEmptyStringSchema.max(128),
    deleted: z.boolean(),
  })
  .strict();

export const ApiErrorResponseSchema = z
  .object({
    message: NonEmptyStringSchema,
    detail: z.string().optional(),
  })
  .strict();

export const FormAnalysisRequestSchema = z
  .object({
    exerciseName: NonEmptyStringSchema.max(80),
    summary: z.record(z.string(), z.unknown()).refine(
      (value) => JSON.stringify(value).length <= 90000,
      "summary must be <= 90000 serialized characters",
    ),
  })
  .strict();

export const FormAnalysisResponseSchema = z
  .object({
    exerciseName: NonEmptyStringSchema.max(80),
    repsDetected: NonNegativeIntSchema,
    insights: z.array(z.string().min(1)),
    model: z.string().optional(),
    usage: AiUsageSchema.nullable().optional(),
  })
  .strict();
