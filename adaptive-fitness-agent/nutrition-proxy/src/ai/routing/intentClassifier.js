import { z } from "zod";

import { parseLlmJsonWithSchema } from "../../schemas/validators.js";
import { buildIntentPrompt } from "./intentPrompt.js";

export const IntentSchema = z
  .object({
    primaryIntent: z.enum([
      "workout",
      "nutrition",
      "recovery",
      "fatigue",
      "motivation",
      "adherence",
      "hydration",
      "progress",
      "general",
    ]),
    secondaryIntents: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    urgency: z.enum(["low", "medium", "high"]),
    requiredSources: z.array(z.enum(["signals", "workouts", "nutrition", "lifestyle", "steps", "profile", "memory"])),
    requestsWorkoutPlan: z.boolean().default(false),
    requestsMealPlan: z.boolean().default(false),
  })
  .strict();

const SOURCES_BY_INTENT = {
  workout: ["signals", "workouts", "lifestyle", "steps", "profile"],
  nutrition: ["signals", "nutrition", "profile", "lifestyle"],
  recovery: ["signals", "lifestyle", "workouts", "steps"],
  fatigue: ["signals", "lifestyle", "workouts", "steps"],
  motivation: ["signals", "memory", "steps", "workouts"],
  adherence: ["signals", "memory", "workouts", "nutrition", "steps"],
  hydration: ["signals", "lifestyle", "profile"],
  progress: ["signals", "workouts", "nutrition", "steps", "profile", "memory"],
  general: ["signals", "profile", "memory"],
};

const ALLOWED_INTENTS = new Set([
  "workout",
  "nutrition",
  "recovery",
  "fatigue",
  "motivation",
  "adherence",
  "hydration",
  "progress",
  "general",
]);

const ALLOWED_SOURCES = new Set(["signals", "workouts", "nutrition", "lifestyle", "steps", "profile", "memory"]);

function buildDefaultIntent() {
  return IntentSchema.parse({
    primaryIntent: "general",
    secondaryIntents: [],
    confidence: 0,
    urgency: "low",
    requiredSources: SOURCES_BY_INTENT.general,
    requestsWorkoutPlan: false,
    requestsMealPlan: false,
  });
}

function normalizeIntent(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ALLOWED_INTENTS.has(normalized) ? normalized : "";
}

function normalizeUrgency(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["low", "medium", "high"].includes(normalized) ? normalized : "low";
}

function repairIntent(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const primaryIntent = normalizeIntent(raw.primaryIntent) || "general";
  const secondaryIntents = Array.isArray(raw.secondaryIntents)
    ? raw.secondaryIntents
        .map(normalizeIntent)
        .filter((intent) => intent && intent !== primaryIntent)
    : [];
  const requiredSources = Array.isArray(raw.requiredSources)
    ? raw.requiredSources
        .map((source) => String(source ?? "").trim().toLowerCase())
        .filter((source) => ALLOWED_SOURCES.has(source))
    : [];
  const intentSources = [primaryIntent, ...secondaryIntents]
    .flatMap((intent) => SOURCES_BY_INTENT[intent] ?? []);

  return {
    primaryIntent,
    secondaryIntents: [...new Set(secondaryIntents)],
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.45)),
    urgency: normalizeUrgency(raw.urgency),
    requiredSources: requiredSources.length
      ? [...new Set([...requiredSources, ...intentSources])]
      : [...new Set(intentSources.length ? intentSources : SOURCES_BY_INTENT.general)],
    requestsWorkoutPlan: Boolean(raw.requestsWorkoutPlan),
    requestsMealPlan: Boolean(raw.requestsMealPlan),
  };
}

function buildIntentGenerationConfig() {
  return {
    temperature: 0,
    topP: 0.8,
    responseMimeType: "application/json",
    responseSchema: {
      type: "object",
      properties: {
        primaryIntent: {
          type: "string",
          enum: [
            "workout",
            "nutrition",
            "recovery",
            "fatigue",
            "motivation",
            "adherence",
            "hydration",
            "progress",
            "general",
          ],
        },
        secondaryIntents: {
          type: "array",
          items: { type: "string" },
        },
        confidence: { type: "number" },
        urgency: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        requiredSources: {
          type: "array",
          items: {
            type: "string",
            enum: ["signals", "workouts", "nutrition", "lifestyle", "steps", "profile", "memory"],
          },
        },
        requestsWorkoutPlan: { type: "boolean" },
        requestsMealPlan: { type: "boolean" },
      },
      required: [
        "primaryIntent",
        "secondaryIntents",
        "confidence",
        "urgency",
        "requiredSources",
        "requestsWorkoutPlan",
        "requestsMealPlan",
      ],
    },
  };
}

export async function classifyIntent(message, { aiProvider } = {}) {
  const fallback = buildDefaultIntent();

  if (!aiProvider?.generateCoachText) {
    return fallback;
  }

  try {
    const prompt = buildIntentPrompt(message);
    const response = await aiProvider.generateCoachText({
      ...prompt,
      history: [],
      generationConfig: buildIntentGenerationConfig(),
    });
    return parseLlmJsonWithSchema({
      text: response.text,
      schema: IntentSchema,
      repair: repairIntent,
      fallback,
      label: "coach-intent",
    });
  } catch {
    return fallback;
  }
}
