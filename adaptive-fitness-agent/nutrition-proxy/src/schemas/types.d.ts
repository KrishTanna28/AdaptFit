import type { z } from "zod";
import {
  AiOutputSchema,
  AiUsageSchema,
  CoachMealPlanSchema,
  CoachWorkoutPlanSchema,
  HomeInsightSchema,
} from "./aiOutputs.js";
import {
  CoachChatRequestSchema,
  CoachChatResponseSchema,
  HomeInsightsResponseSchema,
  TranscribeRequestSchema,
  TranscribeResponseSchema,
} from "./api.js";
import { QueueEventSchema, QueueJobEnvelopeSchema } from "./events.js";
import {
  CoachContextSchema,
  LifestyleLogDocumentSchema,
  NutritionEntryDocumentSchema,
  StepLogDocumentSchema,
  UserProfileSchema,
  WorkoutEntryDocumentSchema,
} from "./firestore.js";
import { DeterministicEngineOutputSchema, SignalPacketSchema } from "./signals.js";

export type AiOutput = z.infer<typeof AiOutputSchema>;
export type AiUsage = z.infer<typeof AiUsageSchema>;
export type CoachWorkoutPlan = z.infer<typeof CoachWorkoutPlanSchema>;
export type CoachMealPlan = z.infer<typeof CoachMealPlanSchema>;
export type HomeInsight = z.infer<typeof HomeInsightSchema>;

export type CoachChatRequest = z.infer<typeof CoachChatRequestSchema>;
export type CoachChatResponse = z.infer<typeof CoachChatResponseSchema>;
export type HomeInsightsResponse = z.infer<typeof HomeInsightsResponseSchema>;
export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>;
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

export type QueueEvent = z.infer<typeof QueueEventSchema>;
export type QueueJobEnvelope = z.infer<typeof QueueJobEnvelopeSchema>;

export type UserProfile = z.infer<typeof UserProfileSchema>;
export type CoachContext = z.infer<typeof CoachContextSchema>;
export type NutritionEntryDocument = z.infer<typeof NutritionEntryDocumentSchema>;
export type WorkoutEntryDocument = z.infer<typeof WorkoutEntryDocumentSchema>;
export type LifestyleLogDocument = z.infer<typeof LifestyleLogDocumentSchema>;
export type StepLogDocument = z.infer<typeof StepLogDocumentSchema>;

export type SignalPacket = z.infer<typeof SignalPacketSchema>;
export type DeterministicEngineOutput = z.infer<typeof DeterministicEngineOutputSchema>;

