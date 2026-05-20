import express from "express";
import { createHash } from "node:crypto";

import {
  ensureConversation,
  appendConversationMessage,
  listConversationMessages,
  listConversations,
  listRecentConversationContext,
  deleteConversation,
} from "./conversationStore.js";
import { loadCoachContext } from "./context.js";
import { getCoachFirestore, verifyCoachIdToken } from "./firebaseAdmin.js";
import {
  generateHomeInsightsResponse,
  transcribeAudioWithVertex,
} from "./geminiClient.js";
import {
  buildCacheKey,
  getCachedJson as cacheGetJson,
  setCachedJson as cacheSetJson,
} from "../cache/cacheManager.js";
import { compressPromptContext } from "../ai/compression/semanticCompressor.js";
import { buildCompressedCoachSystemPrompt, buildCompressedCoachUserPrompt } from "../ai/prompts/coachPrompt.js";
import { createAiProvider } from "../ai/providers/index.js";
import { retrieveSelectiveContext } from "../ai/retrieval/selectiveContext.js";
import { classifyIntent } from "../ai/routing/intentClassifier.js";
import { publishIntelligenceEvent } from "../events/eventBus.js";
import { buildSignalPacketFromContext } from "../intelligence/signalEngine.js";
import { saveSignalState } from "../intelligence/signalStore.js";
import { validateCoachPlanSafety } from "../intelligence/validators/safety.js";
import {
  firstTokenLatencyMs,
  streamingInterruptions,
  tokenCountHistogram,
} from "../observability/metrics.js";
import {
  CoachChatRequestSchema,
  CoachChatResponseSchema,
  ConversationMessagesResponseSchema,
  ConversationsResponseSchema,
  DeleteConversationResponseSchema,
  HomeInsightsQuerySchema,
  HomeInsightsResponseSchema,
  TranscribeRequestSchema,
  TranscribeResponseSchema,
} from "../schemas/api.js";
import {
  CoachMealPlanSchema,
  CoachWorkoutPlanSchema,
  HomeInsightSchema,
  repairCoachMealPlan,
  repairCoachWorkoutPlan,
  repairHomeInsight,
} from "../schemas/aiOutputs.js";
import {
  parseLlmJsonWithSchema,
  safeValidate,
  sendValidatedJson,
  validationErrorResponse,
} from "../schemas/validators.js";
import { errorToLog, logger } from "../observability/logger.js";

const HOME_INSIGHT_TTL_SECONDS = 7 * 24 * 60 * 60;
const HOME_INSIGHT_CACHE_VERSION = "v1";
const aiProvider = createAiProvider();

const PROVIDER_ACCESS_DENIED_PATTERN =
  /denied access|permission[_\s-]?denied|api key not valid|insufficient permissions|contact support|forbidden|status:\s*403|api has not been used|disabled/i;
const PROVIDER_AUTH_FAILED_PATTERN =
  /unable to authenticate your request|no credentials|could not refresh access token|genai-api-key-missing|genai-project-id-missing|gemini-api-key-missing|vertex-project-id-missing|vertex-credentials-missing|api key missing|api key not set/i;
const RATE_LIMIT_PATTERN =
  /quota|resource exhausted|rate limit|too many requests/i;
const PROVIDER_UNAVAILABLE_PATTERN =
  /unavailable|deadline exceeded|timed out|timeout|temporarily unavailable/i;

function inferCoachErrorStatus(detail, fallback = 500) {
  const text = String(detail ?? "").trim();
  if (!text) {
    return fallback;
  }

  if (PROVIDER_ACCESS_DENIED_PATTERN.test(text)) {
    return 403;
  }

  if (PROVIDER_AUTH_FAILED_PATTERN.test(text)) {
    return 403;
  }

  if (RATE_LIMIT_PATTERN.test(text)) {
    return 429;
  }

  if (PROVIDER_UNAVAILABLE_PATTERN.test(text)) {
    return 503;
  }

  return fallback;
}

function messageForCoachStatus(statusCode) {
  if (statusCode === 403) {
    return "AI provider access denied or API disabled for this project.";
  }

  if (statusCode === 429) {
    return "AI provider quota/rate limit reached.";
  }

  if (statusCode === 503) {
    return "AI provider is temporarily unavailable.";
  }

  return "Coach request failed.";
}

function parseBearerToken(authorizationHeader) {
  const header = String(authorizationHeader ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

function parseWorkoutPlan(text) {
  return parseLlmJsonWithSchema({
    text,
    schema: CoachWorkoutPlanSchema,
    repair: repairCoachWorkoutPlan,
    fallback: null,
    label: "coach-workout-plan",
  });
}

function parseMealPlan(text) {
  return parseLlmJsonWithSchema({
    text,
    schema: CoachMealPlanSchema,
    repair: repairCoachMealPlan,
    fallback: null,
    label: "coach-meal-plan",
  });
}

function parseHomeInsights(text) {
  return parseLlmJsonWithSchema({
    text,
    schema: HomeInsightSchema,
    repair: repairHomeInsight,
    fallback: null,
    label: "home-insight",
  });
}

function buildHomeInsightsPrompt(context) {
  return [
    "Create a compact home-screen insight for this user.",
    "Return ONLY this JSON shape:",
    '{ "title": string, "summary": string, "focus": string, "actions": [string, string, string] }',
    "Requirements:",
    "Use currentDateKey as today.",
    "Base the insight on logged steps, nutrition, workouts, hydration, sleep, and context signals.",
    "Use previousCoachChats as conversational memory when it helps, but do not let old chat override fresh logs.",
    "Mention one thing the user could do better or one motivational next action.",
    "Keep title under 8 words, summary under 28 words, each action under 14 words.",
    "Do not invent data that is missing. If data is missing, suggest what to log next.",
    "Context JSON:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function buildHomeInsightSignature(context) {
  const signatureInput = {
    currentDateKey: context.currentDateKey,
    profile: context.profile,
    stepGoal: context.stepGoal,
    recency: context.recency,
    nutrition: {
      totalCalories: context.nutrition?.totalCalories,
      totalProtein: context.nutrition?.totalProtein,
      totalMealsLogged: context.nutrition?.totalMealsLogged,
      daily: context.nutrition?.daily,
    },
    workouts: {
      sessions: context.workouts?.sessions,
      totalDurationMin: context.workouts?.totalDurationMin,
      totalActiveCalories: context.workouts?.totalActiveCalories,
      daily: context.workouts?.daily,
    },
    lifestyle: {
      daysLogged: context.lifestyle?.daysLogged,
      avgSleepHours: context.lifestyle?.avgSleepHours,
      avgHydrationProgressPercent: context.lifestyle?.avgHydrationProgressPercent,
      daily: context.lifestyle?.daily,
    },
    steps: {
      totalSteps: context.steps?.totalSteps,
      stepsToday: context.steps?.stepsToday,
      stepGoalToday: context.steps?.stepGoalToday,
      daily: context.steps?.daily,
    },
    signals: context.signals,
    window: context.window,
    previousCoachChats: context.previousCoachChats,
  };

  return createHash("sha256")
    .update(JSON.stringify(signatureInput))
    .digest("hex")
    .slice(0, 32);
}

function buildWorkoutReply(workoutPlan) {
  const count = workoutPlan.exercises.length;
  const label = count === 1 ? "exercise" : "exercises";
  return `Workout ready: ${workoutPlan.title}. Tap "Load Workout to Today" to add ${String(
    count,
  )} ${label}.`;
}

function buildMealReply(mealPlan) {
  const count = mealPlan.meals.length;
  const label = count === 1 ? "meal" : "meals";
  return `Meal plan ready: ${mealPlan.title}. Tap "Log All Meals" or log an individual meal to add ${String(
    count,
  )} ${label} to today's nutrition log.`;
}

function applySafetyFallback({ replyText, workoutPlan, mealPlan, signalPacket }) {
  const safety = validateCoachPlanSafety({ signalPacket, workoutPlan, mealPlan });
  if (safety.allowed) {
    return { replyText, workoutPlan, mealPlan, safety };
  }

  const primaryViolation = safety.violations.find((item) => item.severity === "high") ?? safety.violations[0];
  return {
    replyText:
      primaryViolation?.message ||
      "I am adjusting this to stay aligned with your recovery and safety signals today.",
    workoutPlan: undefined,
    mealPlan: undefined,
    safety,
  };
}

async function buildCoachOrchestration({ db, uid, message, conversationId, history, context, previousCoachChats, attachments }) {
  const intent = classifyIntent(message);
  const signalResult = await buildSignalPacketFromContext(context);
  await saveSignalState(
    db,
    uid,
    {
      signalPacket: signalResult.signalPacket,
      signature: signalResult.signature,
      reason: "chat-request",
    },
    { windowDays: context.window?.requestedDays ?? 30 },
  );

  const retrieval = retrieveSelectiveContext({
    context,
    signalPacket: signalResult.signalPacket,
    intent,
    conversationMemory: previousCoachChats,
  });
  const compressed = compressPromptContext(retrieval);
  tokenCountHistogram.labels("prompt", "coach.chat").observe(compressed.tokenCount);

  publishIntelligenceEvent({
    type: "ai_chat_requested",
    uid,
    payload: {
      conversationId,
      intent: intent.primaryIntent,
    },
    source: "coach-route",
  }).catch(() => {});

  return {
    intent,
    signalPacket: signalResult.signalPacket,
    signalSignature: signalResult.signature,
    systemPrompt: buildCompressedCoachSystemPrompt(),
    userPrompt: buildCompressedCoachUserPrompt({
      promptPacket: compressed.packet,
      message,
      attachments,
      tokenCount: compressed.tokenCount,
    }),
    history,
    tokenCount: compressed.tokenCount,
  };
}

function sendSseEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function requireCoachUser(req, res, next) {
  try {
    const idToken = parseBearerToken(req.headers.authorization);
    if (!idToken) {
      return res.status(401).json({ message: "Missing auth token." });
    }

    const decoded = await verifyCoachIdToken(idToken);
    req.coachUser = {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : null,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired auth token.",
      detail: error instanceof Error ? error.message : "Auth verification failed.",
    });
  }
}

export function mountCoachRoutes(app) {
  const router = express.Router();

  router.post("/chat", requireCoachUser, async (req, res) => {
    try {
      const requestValidation = safeValidate(CoachChatRequestSchema, req.body ?? {}, "coach chat request");
      if (!requestValidation.ok) {
        return res.status(400).json(validationErrorResponse(requestValidation));
      }

      const chatRequest = requestValidation.data;
      const db = getCoachFirestore();
      const uid = req.coachUser.uid;
      logger.info(
        {
          uid,
          messageLength: String(chatRequest.message ?? "").length,
        },
        "Coach chat request received.",
      );
      const windowDays = chatRequest.contextWindowDays;
      const includeAllHistory = chatRequest.includeAllHistory;
      const attachments = chatRequest.attachments;
      const message = chatRequest.message;
      const conversationId = await ensureConversation(db, uid, chatRequest.conversationId);
      const history = await listConversationMessages(db, uid, conversationId, 10);
      const context = await loadCoachContext(db, uid, { windowDays, includeAllHistory });
      const previousCoachChats = await listRecentConversationContext(db, uid, conversationId);
      const contextWithChatHistory = {
        ...context,
        previousCoachChats,
      };

      const orchestration = await buildCoachOrchestration({
        db,
        uid,
        message,
        conversationId,
        history,
        context: contextWithChatHistory,
        previousCoachChats,
        attachments,
      });

      const coachResponse = await aiProvider.generateCoachText({
        systemPrompt: orchestration.systemPrompt,
        userPrompt: orchestration.userPrompt,
        history: orchestration.history,
      });

      let workoutPlan = parseWorkoutPlan(coachResponse.text);
      const mealPlan = workoutPlan ? null : parseMealPlan(coachResponse.text);
      let replyText = workoutPlan
        ? buildWorkoutReply(workoutPlan)
        : mealPlan
          ? buildMealReply(mealPlan)
          : coachResponse.text;
      const workoutGoalAchievedToday = Boolean(contextWithChatHistory?.recency?.workoutGoalAchievedToday);

      if (workoutPlan && workoutGoalAchievedToday) {
        workoutPlan = null;
        replyText = "You already hit today's workout goal. Prioritize recovery or mobility today, and we can plan the next session when you're ready.";
      }

      const safetyApplied = applySafetyFallback({
        replyText,
        workoutPlan,
        mealPlan,
        signalPacket: orchestration.signalPacket,
      });
      replyText = safetyApplied.replyText;
      workoutPlan = safetyApplied.workoutPlan ?? null;
      const safeMealPlan = safetyApplied.mealPlan ?? null;

      await appendConversationMessage(db, uid, conversationId, {
        role: "user",
        content: message,
      });

      await appendConversationMessage(db, uid, conversationId, {
        role: "assistant",
        content: replyText,
        model: coachResponse.model,
        usage: coachResponse.usage,
      });

      return sendValidatedJson(res, CoachChatResponseSchema, {
        conversationId,
        reply: replyText,
        model: coachResponse.model,
        usage: coachResponse.usage,
        contextSignals: orchestration.signalPacket.signals,
        contextWindow: contextWithChatHistory.window,
        attachmentsUsed: attachments.length,
        workoutPlan: workoutPlan ?? undefined,
        mealPlan: safeMealPlan ?? undefined,
      }, "coach chat response");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      const statusCode = inferCoachErrorStatus(detail, 500);

      logger.error(
        {
          err: errorToLog(error),
          statusCode,
        },
        "Coach chat request failed.",
      );

      return res.status(statusCode).json({
        message: messageForCoachStatus(statusCode),
        detail,
      });
    }
  });

  router.post("/chat/stream", requireCoachUser, async (req, res) => {
    let clientClosed = false;
    let headersStarted = false;

    req.on("close", () => {
      clientClosed = true;
    });

    try {
      const requestValidation = safeValidate(CoachChatRequestSchema, req.body ?? {}, "coach stream request");
      if (!requestValidation.ok) {
        return res.status(400).json(validationErrorResponse(requestValidation));
      }

      const chatRequest = requestValidation.data;
      const db = getCoachFirestore();
      const uid = req.coachUser.uid;
      logger.info(
        {
          uid,
          messageLength: String(chatRequest.message ?? "").length,
        },
        "Coach stream request received.",
      );
      const windowDays = chatRequest.contextWindowDays;
      const includeAllHistory = chatRequest.includeAllHistory;
      const attachments = chatRequest.attachments;
      const message = chatRequest.message;
      const conversationId = await ensureConversation(db, uid, chatRequest.conversationId);
      const history = await listConversationMessages(db, uid, conversationId, 10);
      const context = await loadCoachContext(db, uid, { windowDays, includeAllHistory });
      const previousCoachChats = await listRecentConversationContext(db, uid, conversationId);
      const contextWithChatHistory = {
        ...context,
        previousCoachChats,
      };

      const orchestration = await buildCoachOrchestration({
        db,
        uid,
        message,
        conversationId,
        history,
        context: contextWithChatHistory,
        previousCoachChats,
        attachments,
      });

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      headersStarted = true;
      res.flushHeaders?.();

      sendSseEvent(res, "metadata", {
        conversationId,
        intent: orchestration.intent,
        contextSignals: orchestration.signalPacket.signals,
        contextWindow: contextWithChatHistory.window,
        tokenCount: orchestration.tokenCount,
      });

      let firstTokenSeen = false;
      const streamStart = performance.now();
      const coachResponse = await aiProvider.streamCoachText({
        systemPrompt: orchestration.systemPrompt,
        userPrompt: orchestration.userPrompt,
        history: orchestration.history,
        onToken: async (token) => {
          if (clientClosed) {
            return;
          }
          if (!firstTokenSeen) {
            firstTokenSeen = true;
            firstTokenLatencyMs
              .labels(aiProvider.name, "unknown")
              .observe(performance.now() - streamStart);
          }
          sendSseEvent(res, "token", { token });
        },
      });

      if (clientClosed) {
        streamingInterruptions.labels("client-closed").inc();
        return undefined;
      }

      let workoutPlan = parseWorkoutPlan(coachResponse.text);
      const mealPlan = workoutPlan ? null : parseMealPlan(coachResponse.text);
      let replyText = workoutPlan
        ? buildWorkoutReply(workoutPlan)
        : mealPlan
          ? buildMealReply(mealPlan)
          : coachResponse.text;
      const workoutGoalAchievedToday = Boolean(contextWithChatHistory?.recency?.workoutGoalAchievedToday);

      if (workoutPlan && workoutGoalAchievedToday) {
        workoutPlan = null;
        replyText = "You already hit today's workout goal. Prioritize recovery or mobility today, and we can plan the next session when you're ready.";
      }

      const safetyApplied = applySafetyFallback({
        replyText,
        workoutPlan,
        mealPlan,
        signalPacket: orchestration.signalPacket,
      });
      replyText = safetyApplied.replyText;
      workoutPlan = safetyApplied.workoutPlan ?? null;
      const safeMealPlan = safetyApplied.mealPlan ?? null;

      await appendConversationMessage(db, uid, conversationId, {
        role: "user",
        content: message,
      });

      await appendConversationMessage(db, uid, conversationId, {
        role: "assistant",
        content: replyText,
        model: coachResponse.model,
        usage: coachResponse.usage,
      });

      const finalPayload = {
        conversationId,
        reply: replyText,
        model: coachResponse.model,
        usage: coachResponse.usage,
        contextSignals: orchestration.signalPacket.signals,
        contextWindow: contextWithChatHistory.window,
        attachmentsUsed: attachments.length,
        workoutPlan: workoutPlan ?? undefined,
        mealPlan: safeMealPlan ?? undefined,
      };
      const finalValidation = safeValidate(CoachChatResponseSchema, finalPayload, "coach stream final response");
      sendSseEvent(res, "final", finalValidation.ok ? finalValidation.data : finalPayload);
      sendSseEvent(res, "done", { ok: true });
      return res.end();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      const statusCode = inferCoachErrorStatus(detail, 500);

      logger.error(
        {
          err: errorToLog(error),
          statusCode,
        },
        "Coach stream request failed.",
      );

      if (clientClosed) {
        streamingInterruptions.labels("client-closed").inc();
        return undefined;
      }

      if (headersStarted) {
        sendSseEvent(res, "error", {
          message: messageForCoachStatus(statusCode),
          detail,
          statusCode,
        });
        return res.end();
      }

      return res.status(statusCode).json({
        message: messageForCoachStatus(statusCode),
        detail,
      });
    }
  });

  router.get("/home-insights", requireCoachUser, async (req, res) => {
    try {
      const queryValidation = safeValidate(
        HomeInsightsQuerySchema,
        req.query ?? {},
        "home insights query",
      );
      if (!queryValidation.ok) {
        return res.status(400).json(validationErrorResponse(queryValidation));
      }

      const db = getCoachFirestore();
      const uid = req.coachUser.uid;
      const windowDays = queryValidation.data.contextWindowDays ?? 7;
      const baseContext = await loadCoachContext(db, uid, {
        windowDays,
        includeAllHistory: true,
      });
      const previousCoachChats = await listRecentConversationContext(db, uid, "");
      const context = {
        ...baseContext,
        previousCoachChats,
      };
      const signature = buildHomeInsightSignature(context);
      const cacheKey = buildCacheKey(
        [HOME_INSIGHT_CACHE_VERSION, "home-insight", uid, String(windowDays), signature],
        "coach",
      );
      const cached = await cacheGetJson(cacheKey);

      if (cached?.insight) {
        res.set("X-Coach-Insight-Cache", "HIT");
        return sendValidatedJson(res, HomeInsightsResponseSchema, {
          ...cached,
          cached: true,
          contextSignals: context.signals,
          contextWindow: context.window,
        }, "cached home insight response");
      }

      const insightResponse = await generateHomeInsightsResponse({
        prompt: buildHomeInsightsPrompt(context),
      });
      const insight = parseHomeInsights(insightResponse.text);

      if (!insight) {
        return res.status(502).json({
          message: "AI insight response could not be parsed.",
          detail: insightResponse.text,
        });
      }

      const payload = {
        insight,
        model: insightResponse.model,
        usage: insightResponse.usage,
        contextSignals: context.signals,
        contextWindow: context.window,
        contextSignature: signature,
        cached: false,
      };

      await cacheSetJson(cacheKey, payload, HOME_INSIGHT_TTL_SECONDS);

      res.set("X-Coach-Insight-Cache", "MISS");
      return sendValidatedJson(res, HomeInsightsResponseSchema, payload, "home insight response");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      const statusCode = inferCoachErrorStatus(detail, 500);

      return res.status(statusCode).json({
        message: messageForCoachStatus(statusCode),
        detail,
      });
    }
  });

  router.post("/transcribe", requireCoachUser, async (req, res) => {
    try {
      const requestValidation = safeValidate(
        TranscribeRequestSchema,
        req.body ?? {},
        "transcription request",
      );
      if (!requestValidation.ok) {
        const isAudioTooLarge = requestValidation.issues?.some(
          (issue) => issue.path.join(".") === "audioBase64" && issue.code === "too_big",
        );
        return res
          .status(isAudioTooLarge ? 413 : 400)
          .json(validationErrorResponse(requestValidation));
      }

      const { audioBase64, mimeType } = requestValidation.data;

      const transcription = await transcribeAudioWithVertex({
        audioBase64,
        mimeType,
      });

      return sendValidatedJson(res, TranscribeResponseSchema, {
        text: transcription.text,
        model: transcription.model,
        usage: transcription.usage,
      }, "transcription response");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      const statusCode = /audio-payload-too-large/i.test(detail)
        ? 413
        : inferCoachErrorStatus(detail, 500);

      return res.status(statusCode).json({
        message: statusCode === 413 ? "Transcription failed." : messageForCoachStatus(statusCode),
        detail,
      });
    }
  });

  router.get("/conversations", requireCoachUser, async (req, res) => {
    try {
      const db = getCoachFirestore();
      const conversations = await listConversations(db, req.coachUser.uid, req.query.limit);

      return sendValidatedJson(res, ConversationsResponseSchema, {
        conversations,
      }, "conversations response");
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load conversations.",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/conversations/:conversationId/messages", requireCoachUser, async (req, res) => {
    try {
      const conversationId = String(req.params.conversationId ?? "").trim();
      if (!conversationId) {
        return res.status(400).json({ message: "conversationId is required." });
      }

      const db = getCoachFirestore();
      const messages = await listConversationMessages(
        db,
        req.coachUser.uid,
        conversationId,
        req.query.limit,
      );

      return sendValidatedJson(res, ConversationMessagesResponseSchema, {
        conversationId,
        messages,
      }, "conversation messages response");
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load conversation messages.",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.delete("/conversations/:conversationId", requireCoachUser, async (req, res) => {
    try {
      const conversationId = String(req.params.conversationId ?? "").trim();
      if (!conversationId) {
        return res.status(400).json({ message: "conversationId is required." });
      }

      const db = getCoachFirestore();
      const deleted = await deleteConversation(db, req.coachUser.uid, conversationId);

      return sendValidatedJson(res, DeleteConversationResponseSchema, {
        conversationId,
        deleted,
      }, "delete conversation response");
    } catch (error) {
      return res.status(500).json({
        message: "Failed to delete conversation.",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.use("/api/coach", router);
}
