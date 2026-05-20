import { z } from "zod";

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
  })
  .strict();

const INTENT_PATTERNS = [
  { intent: "workout", pattern: /\b(workout|exercise|train|routine|sets?|reps?|lift|cardio|run|session|split)\b/i },
  { intent: "nutrition", pattern: /\b(meal|food|diet|calorie|protein|carb|fat|breakfast|lunch|dinner|snack|eat)\b/i },
  { intent: "recovery", pattern: /\b(recover|recovery|sleep|sore|rest|mobility|stretch)\b/i },
  { intent: "fatigue", pattern: /\b(fatigue|tired|exhausted|burnt out|overtrain|overtraining|low energy)\b/i },
  { intent: "motivation", pattern: /\b(motivat|discipline|stuck|lazy|encourage|mindset)\b/i },
  { intent: "adherence", pattern: /\b(consisten|habit|streak|missed|adherence|routine)\b/i },
  { intent: "hydration", pattern: /\b(water|hydrate|hydration|thirst|fluid)\b/i },
  { intent: "progress", pattern: /\b(progress|plateau|weight|trend|improve|results|goal)\b/i },
];

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

export function classifyIntent(message) {
  const text = String(message ?? "");
  const matched = INTENT_PATTERNS.filter((item) => item.pattern.test(text)).map((item) => item.intent);
  const primaryIntent = matched[0] ?? "general";
  const secondaryIntents = [...new Set(matched.slice(1))];
  const confidence = matched.length ? Math.min(0.95, 0.72 + matched.length * 0.06) : 0.45;
  const urgency = /\b(pain|dizzy|injury|hurt|chest|faint|emergency|can't breathe)\b/i.test(text)
    ? "high"
    : /\b(today|now|right now|asap|tonight)\b/i.test(text)
      ? "medium"
      : "low";

  return IntentSchema.parse({
    primaryIntent,
    secondaryIntents,
    confidence,
    urgency,
    requiredSources: SOURCES_BY_INTENT[primaryIntent] ?? SOURCES_BY_INTENT.general,
  });
}

