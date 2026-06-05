import {
  CoachCriticResultSchema,
  repairCoachCriticResult,
} from "../schemas/aiOutputs.js";
import { parseLlmJsonWithSchema } from "../schemas/validators.js";
import { errorToLog, logger } from "../observability/logger.js";

const CRITIC_ENABLED = String(process.env.COACH_CRITIC_ENABLED ?? "true").toLowerCase() !== "false";
const INTERNAL_LABEL_PATTERN =
  /\b(READY|FATIGUED|RECOVERING|OVERTRAINING_RISK|HIGH_MOMENTUM|LOW_ADHERENCE|PLATEAUING|signalPacket|backend|deterministic|safety\.violations)\b/;

function buildCriticSystemPrompt() {
  return [
    "You are a strict response critic for Aether, a fitness and nutrition coach.",
    "Check the assistant reply for safety, clarity, structure, and alignment with the provided deterministic signals.",
    "If the reply is safe and clear, approve it.",
    "If the user requested a workout plan, meal plan or both and the assistant reply contains broken or invalid JSON, fix the JSON and return the valid JSON string in refinedReply.",
    "If it exposes internal labels, ignores safety, is confusing, or fails to acknowledge a tool result (and is not a structured plan), provide a refined plain-text reply.",
    "Do not add new facts, calculations, medical claims, or unsupported promises.",
    "Return ONLY valid JSON with this shape:",
    '{ "approved": boolean, "issues": string[], "refinedReply": string | null }',
  ].join("\n");
}

function buildCriticUserPrompt(input) {
  return [
    "User message:",
    input.message,
    "Intent:",
    JSON.stringify(input.intent ?? {}),
    "Signal summary:",
    JSON.stringify({
      signals: input.signalPacket?.signals ?? [],
      safety: input.signalPacket?.safety ?? null,
      recency: input.signalPacket?.recency ?? {},
    }),
    "Tool results:",
    JSON.stringify(input.toolResults ?? []),
    "Assistant reply:",
    input.replyText,
    "Plan metadata:",
    JSON.stringify({
      hasWorkoutPlan: Boolean(input.workoutPlan),
      hasMealPlan: Boolean(input.mealPlan),
    }),
  ].join("\n\n");
}

function heuristicIssues(replyText) {
  const issues = [];
  const text = String(replyText ?? "").trim();
  if (!text) {
    issues.push("empty reply");
  }
  if (INTERNAL_LABEL_PATTERN.test(text)) {
    issues.push("internal terminology exposed");
  }
  return issues;
}

export async function runCoachCriticRefiner(input) {
  const replyText = String(input.replyText ?? "").trim();
  if (!CRITIC_ENABLED) {
    return {
      replyText,
      refined: false,
      critic: null,
    };
  }

  const localIssues = heuristicIssues(replyText);
  try {
    const criticResponse = await input.aiProvider.generateCoachText({
      systemPrompt: buildCriticSystemPrompt(),
      userPrompt: buildCriticUserPrompt({
        ...input,
        replyText,
      }),
      history: [],
    });
    const critic = parseLlmJsonWithSchema({
      text: criticResponse.text,
      schema: CoachCriticResultSchema,
      repair: repairCoachCriticResult,
      fallback: null,
      label: "coach-critic",
    });

    if (!critic) {
      return {
        replyText,
        refined: false,
        critic: null,
      };
    }

    const refinedReply = String(critic.refinedReply ?? "").trim();
    const approved = critic.approved && localIssues.length === 0;
    if (!approved && refinedReply) {
      return {
        replyText: refinedReply,
        refined: true,
        critic: {
          ...critic,
          issues: [...localIssues, ...(critic.issues ?? [])],
          model: criticResponse.model,
          usage: criticResponse.usage,
        },
      };
    }

    return {
      replyText,
      refined: false,
      critic: {
        ...critic,
        issues: [...localIssues, ...(critic.issues ?? [])],
        model: criticResponse.model,
        usage: criticResponse.usage,
      },
    };
  } catch (error) {
    logger.warn({ err: errorToLog(error) }, "Coach critic/refiner failed; using primary reply.");
    return {
      replyText,
      refined: false,
      critic: null,
    };
  }
}
