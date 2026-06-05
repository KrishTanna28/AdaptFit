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
import { runCoachCriticRefiner } from "./critic.js";
import { getCoachFirestore, verifyCoachIdToken } from "./firebaseAdmin.js";
import {
  generateHomeInsightsResponse,
  transcribeAudioWithVertex,
} from "./geminiClient.js";
import { executeCoachToolActions, hasSuccessfulToolResult } from "./toolRouter.js";
import {
  buildCacheKey,
  getCachedJson as cacheGetJson,
  setCachedJson as cacheSetJson,
} from "../cache/cacheManager.js";
import { compressPromptContext } from "../ai/compression/semanticCompressor.js";
import { buildCompressedCoachSystemPrompt, buildCompressedCoachUserPrompt } from "../ai/prompts/coachPrompt.js";
import { createAiProvider } from "../ai/providers/index.js";
import { loadCoachContextForSources } from "../ai/retrieval/contextQueries.js";
import { retrieveSelectiveContext } from "../ai/retrieval/selectiveContext.js";
import { classifyIntent } from "../ai/routing/intentClassifier.js";
import { publishIntelligenceEvent } from "../events/eventBus.js";
import { recomputeUserSignalState } from "../intelligence/signalEngine.js";
import { loadSignalState } from "../intelligence/signalStore.js";
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
  CoachPlanBundleSchema,
  CoachMealPlanSchema,
  CoachWorkoutPlanSchema,
  HomeInsightSchema,
  repairCoachPlanBundle,
  repairCoachMealPlan,
  repairCoachWorkoutPlan,
  repairHomeInsight,
} from "../schemas/aiOutputs.js";
import {
  extractJsonText,
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

function parsePlanBundle(text) {
  const cleaned = extractJsonText(text);
  if (!cleaned) {
    return null;
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
  } catch {
    return null;
  }

  return parseLlmJsonWithSchema({
    text,
    schema: CoachPlanBundleSchema,
    repair: repairCoachPlanBundle,
    fallback: null,
    label: "coach-plan-bundle",
  });
}

function parseCoachPlans(text, requestedPlanKinds = { workout: false, meal: false }) {
  const planBundle = parsePlanBundle(text);
  let workoutPlan = null;
  let mealPlan = null;
  let replyFallback = null;

  if (planBundle) {
    workoutPlan = planBundle.workoutPlan ?? null;
    mealPlan = planBundle.mealPlan ?? null;
  } else {
    try {
      const cleaned = extractJsonText(text);
      if (cleaned) {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.reply === "string") {
            replyFallback = parsed.reply;
          }
          if (requestedPlanKinds.workout && parsed.workoutPlan && typeof parsed.workoutPlan === "object") {
             workoutPlan = parseWorkoutPlan(JSON.stringify(parsed.workoutPlan));
          }
          if (requestedPlanKinds.meal && parsed.mealPlan && typeof parsed.mealPlan === "object") {
             mealPlan = parseMealPlan(JSON.stringify(parsed.mealPlan));
          }
        }
      }
    } catch {
      // Ignore parser errors for fallback
    }

    if (requestedPlanKinds.workout && !workoutPlan) {
      workoutPlan = parseWorkoutPlan(text);
    }
    if (requestedPlanKinds.meal && !mealPlan) {
      mealPlan = parseMealPlan(text);
    }
  }

  return {
    planBundle,
    workoutPlan,
    mealPlan,
    replyFallback,
  };
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
    signalPacket: context.signalPacket,
    signals: context.signals,
    window: context.window,
    previousCoachChats: context.previousCoachChats,
  };

  return createHash("sha256")
    .update(JSON.stringify(signatureInput))
    .digest("hex")
    .slice(0, 32);
}

function buildHomeInsightContextFromSignal(signalPacket, previousCoachChats) {
  return {
    generatedAt: signalPacket.generatedAt,
    currentDateKey: signalPacket.currentDateKey,
    profile: signalPacket.profile,
    stepGoal: signalPacket.targets?.stepGoal ?? null,
    window: signalPacket.window,
    recency: signalPacket.recency,
    nutrition: {
      avgDailyCalories: signalPacket.trends?.nutritionCalories?.currentAvg ?? 0,
      totalMealsLogged: signalPacket.dataCoverage?.nutritionDays ?? 0,
      caloriesToday: signalPacket.recency?.nutritionCaloriesToday ?? 0,
    },
    workouts: {
      activeDays: signalPacket.dataCoverage?.workoutDays ?? 0,
      avgDailyActiveCalories: signalPacket.trends?.activeCalories?.currentAvg ?? 0,
      activeCaloriesToday: signalPacket.recency?.workoutActiveCaloriesToday ?? 0,
    },
    lifestyle: {
      daysLogged: signalPacket.dataCoverage?.lifestyleDays ?? 0,
      avgSleepHours: signalPacket.trends?.sleepHours?.currentAvg ?? null,
      avgHydrationProgressPercent: signalPacket.dataCoverage?.avgHydrationProgress ?? null,
    },
    steps: {
      stepsToday: signalPacket.recency?.stepsToday ?? 0,
      stepGoalToday: signalPacket.recency?.stepGoalToday ?? null,
      avgDailySteps: signalPacket.trends?.steps?.currentAvg ?? 0,
    },
    signals: signalPacket.signals ?? [],
    signalPacket,
    previousCoachChats,
  };
}

function buildEmptyContextWindow(windowDays, includeAllHistory = false) {
  const requestedDays = Number.isFinite(Number(windowDays)) ? Number(windowDays) : 7;
  return {
    includeAllHistory: Boolean(includeAllHistory),
    requestedDays,
    averagingDays: requestedDays,
    nutritionDays: requestedDays,
    workoutDays: requestedDays,
    fromDateKey: null,
    toDateKey: null,
  };
}

function isLightweightSinglePassCandidate(message, attachments = []) {
  if (Array.isArray(attachments) && attachments.length > 0) {
    return false;
  }

  const text = String(message ?? "").trim();
  if (!text || text.length > 90) {
    return false;
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 12) {
    return false;
  }

  const requiresAppData =
    /\b(plan|routine|program|schedule|split|prep|regimen|log|logged|today|yesterday|week|month|progress|calorie|protein|macro|steps?|sleep|hydration|water|weight|workout|exercise|meal|diet|nutrition|food|breakfast|lunch|dinner|snacks?|recovery|sore|pain|injur|dizzy|chest|faint|emergency)\b/i.test(text);
  if (requiresAppData) {
    return false;
  }

  return /^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening|howdy|thanks|thank you|bye|goodbye|cya|see ya|how are you|what's up|whats up)([\s,!.?]*)$/i.test(text);
}

function buildLightweightCoachSystemPrompt() {
  return [
    "You are Aether, a supportive virtual fitness coach.",
    "Answer this lightweight chat message directly without using user logs, app data, internal signals, or tool calls.",
    "Do not claim to have checked the user's data.",
    "Keep it to one short, natural sentence.",
    "Do not use markdown formatting.",
  ].join("\n");
}

function isPlanRequest(requestedPlanKinds) {
  return Boolean(requestedPlanKinds?.workout || requestedPlanKinds?.meal);
}

function buildCoachGenerationConfig(requestedPlanKinds) {
  if (!isPlanRequest(requestedPlanKinds)) {
    return undefined;
  }

  const responseSchema = {
    type: "object",
    properties: {
      type: { type: "string" },
      reply: { type: "string" },
    },
    required: ["type", "reply"],
  };

  if (requestedPlanKinds.workout) {
    responseSchema.properties.workoutPlan = {
      type: "object",
      properties: {
        title: { type: "string" },
        exercises: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              sets: { type: "integer" },
              reps: { type: "integer" },
            },
            required: ["name", "sets", "reps"],
          },
        },
      },
      required: ["title", "exercises"],
    };
    responseSchema.required.push("workoutPlan");
  }

  if (requestedPlanKinds.meal) {
    responseSchema.properties.mealPlan = {
      type: "object",
      properties: {
        title: { type: "string" },
        meals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              mealType: { type: "string" },
              name: { type: "string" },
              items: { type: "array", items: { type: "string" } },
              calories: { type: "number" },
              protein: { type: "number" },
              carbs: { type: "number" },
              fat: { type: "number" },
              fiber: { type: "number" },
              sodiumMg: { type: "number" },
              potassiumMg: { type: "number" },
              calciumMg: { type: "number" },
              ironMg: { type: "number" },
              vitaminCMg: { type: "number" },
            },
            required: [
              "mealType",
              "name",
              "items",
              "calories",
              "protein",
              "carbs",
              "fat",
              "fiber",
              "sodiumMg",
              "potassiumMg",
              "calciumMg",
              "ironMg",
              "vitaminCMg",
            ],
          },
        },
      },
      required: ["title", "meals"],
    };
    responseSchema.required.push("mealPlan");
  }

  return {
    temperature: 0.2,
    topP: 0.85,
    responseMimeType: "application/json",
    responseSchema,
  };
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

function buildCombinedPlanReply({ workoutPlan, mealPlan, modelReply }) {
  const fallbackParts = [];
  if (workoutPlan) {
    fallbackParts.push(buildWorkoutReply(workoutPlan));
  }
  if (mealPlan) {
    fallbackParts.push(buildMealReply(mealPlan));
  }

  const reply = String(modelReply ?? "").trim();
  return reply || fallbackParts.join(" ");
}

function buildPlanJsonRetrySystemPrompt(requestedPlanKinds) {
  const requirements = [
    "You are Aether's structured plan formatter.",
    "Return ONLY valid JSON. No markdown. No prose outside JSON.",
    "Generate a complete structured plan for the user's request.",
    "Use the provided context as source material, but do not mention backend labels.",
    "The JSON must match the response schema exactly.",
    "The reply field must be one short sentence.",
  ];

  if (requestedPlanKinds.workout && requestedPlanKinds.meal) {
    requirements.push("Set type to both and include both workoutPlan and mealPlan.");
  } else if (requestedPlanKinds.workout) {
    requirements.push("Set type to workout and include workoutPlan only.");
  } else if (requestedPlanKinds.meal) {
    requirements.push("Set type to meal and include mealPlan only.");
  }

  requirements.push(
    "Workout exercises must have name, sets, and reps.",
    "Meal plan meals must use mealType breakfast, lunch, dinner, or snacks.",
    "Every meal must include items, calories, protein, carbs, fat, fiber, sodiumMg, potassiumMg, calciumMg, ironMg, and vitaminCMg as numbers.",
  );

  return requirements.join("\n");
}

function buildPlanJsonRetryUserPrompt({ message, orchestration, firstResponseText }) {
  return [
    "User request:",
    message,
    "Requested plan kinds:",
    JSON.stringify(orchestration.requestedPlanKinds),
    "Deterministic context packet:",
    orchestration.userPrompt,
    "Previous invalid/non-JSON plan response to convert or replace:",
    String(firstResponseText ?? "").slice(0, 6000),
    "Return the final structured plan JSON now.",
  ].join("\n\n");
}

async function generateStructuredPlanRetry({ message, orchestration, firstResponseText }) {
  if (!isPlanRequest(orchestration.requestedPlanKinds)) {
    return null;
  }

  try {
    const retryResponse = await aiProvider.generateCoachText({
      systemPrompt: buildPlanJsonRetrySystemPrompt(orchestration.requestedPlanKinds),
      userPrompt: buildPlanJsonRetryUserPrompt({
        message,
        orchestration,
        firstResponseText,
      }),
      history: [],
      generationConfig: buildCoachGenerationConfig(orchestration.requestedPlanKinds),
    });

    return parseCoachPlans(retryResponse.text, orchestration.requestedPlanKinds);
  } catch (error) {
    logger.warn({ err: errorToLog(error) }, "Structured plan retry failed.");
    return null;
  }
}

function splitMacroCalories(totalCalories) {
  const calories = Math.max(1200, Math.round(Number(totalCalories) || 2200));
  const protein = Math.round((calories * 0.22) / 4);
  const carbs = Math.round((calories * 0.48) / 4);
  const fat = Math.round((calories * 0.3) / 9);
  return { calories, protein, carbs, fat };
}

function buildFallbackMeal(mealType, name, items, calorieShare, targets) {
  const macros = splitMacroCalories(targets.calories * calorieShare);
  const micronutrientScale = Math.max(0.7, Math.min(1.6, macros.calories / 600));

  return {
    mealType,
    name,
    items,
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    fiber: Math.round(8 * micronutrientScale),
    sodiumMg: Math.round(350 * micronutrientScale),
    potassiumMg: Math.round(650 * micronutrientScale),
    calciumMg: Math.round(180 * micronutrientScale),
    ironMg: Math.round(3 * micronutrientScale * 10) / 10,
    vitaminCMg: Math.round(35 * micronutrientScale),
  };
}

function buildFallbackMealPlan(signalPacket) {
  const profile = signalPacket?.profile ?? {};
  const dietType = String(profile.dietType ?? "").toLowerCase();
  const isVegetarian = dietType.includes("veg") || dietType.includes("plant");
  const calorieTarget = Number(signalPacket?.targets?.calorieTarget ?? 0);
  const proteinTarget = Number(signalPacket?.targets?.proteinTarget ?? 0);
  const targets = {
    calories: calorieTarget > 0 ? calorieTarget : 2200,
    protein: proteinTarget > 0 ? proteinTarget : 110,
  };

  const meals = isVegetarian
    ? [
        buildFallbackMeal("breakfast", "Protein Oats and Yogurt Bowl", ["Oats", "Greek yogurt or soy yogurt", "Berries", "Chia seeds", "Nut butter"], 0.25, targets),
        buildFallbackMeal("lunch", "Lentil Rice Power Bowl", ["Lentils", "Brown rice or quinoa", "Mixed vegetables", "Olive oil dressing"], 0.3, targets),
        buildFallbackMeal("snacks", "Protein Shake and Nuts", ["Protein powder", "Banana", "Milk or soy milk", "Almonds"], 0.18, targets),
        buildFallbackMeal("dinner", "Chickpea Paneer Dinner", ["Chickpeas", "Paneer or tofu", "Spinach", "Whole-wheat roti", "Salad"], 0.27, targets),
      ]
    : [
        buildFallbackMeal("breakfast", "High Protein Breakfast Bowl", ["Oats", "Greek yogurt", "Berries", "Chia seeds", "Nut butter"], 0.25, targets),
        buildFallbackMeal("lunch", "Lean Protein Rice Bowl", ["Lean protein", "Brown rice or quinoa", "Mixed vegetables", "Olive oil dressing"], 0.3, targets),
        buildFallbackMeal("snacks", "Protein Shake and Fruit", ["Protein powder", "Banana", "Milk", "Nuts"], 0.18, targets),
        buildFallbackMeal("dinner", "Protein Dinner Plate", ["Protein source", "Potatoes or roti", "Vegetables", "Salad"], 0.27, targets),
      ];

  return {
    title: isVegetarian ? "Vegetarian Daily Meal Plan" : "Daily Meal Plan",
    meals,
  };
}

function buildFallbackWorkoutPlan(signalPacket) {
  const safeToTrainHard = signalPacket?.safety?.safeToTrainHard !== false;
  if (!safeToTrainHard) {
    return {
      title: "Recovery-Friendly Full Body Session",
      exercises: [
        { name: "Cat Cow", sets: 2, reps: 8 },
        { name: "Bodyweight Squat", sets: 2, reps: 10 },
        { name: "Incline Push-up", sets: 2, reps: 8 },
        { name: "Glute Bridge", sets: 2, reps: 10 },
        { name: "Dead Bug", sets: 2, reps: 8 },
      ],
    };
  }

  return {
    title: "Full Body Strength Plan",
    exercises: [
      { name: "Goblet Squat", sets: 3, reps: 10 },
      { name: "Push-up", sets: 3, reps: 10 },
      { name: "Dumbbell Row", sets: 3, reps: 10 },
      { name: "Dumbbell Overhead Press", sets: 3, reps: 10 },
      { name: "Plank", sets: 3, reps: 30 },
    ],
  };
}

function buildStructuredFallbackPlans(orchestration) {
  const workoutPlan = orchestration.requestedPlanKinds?.workout
    ? buildFallbackWorkoutPlan(orchestration.signalPacket)
    : null;
  const mealPlan = orchestration.requestedPlanKinds?.meal
    ? buildFallbackMealPlan(orchestration.signalPacket)
    : null;

  return {
    planBundle: {
      type: workoutPlan && mealPlan ? "both" : workoutPlan ? "workout" : "meal",
      reply: "I made a structured plan you can load into the app.",
      workoutPlan,
      mealPlan,
    },
    workoutPlan,
    mealPlan,
    replyFallback: null,
  };
}

function applySafetyFallback({ replyText, workoutPlan, mealPlan, signalPacket }) {
  const safety = validateCoachPlanSafety({ signalPacket, workoutPlan, mealPlan });
  if (safety.allowed) {
    return { replyText, workoutPlan, mealPlan, safety };
  }

  const primaryViolation = safety.violations.find((item) => item.severity === "high") ?? safety.violations[0];
  const removeWorkout = safety.violations.some((item) => item.id === "workout-volume-too-high");
  const removeMeal = safety.violations.some((item) => item.id === "meal-plan-too-low-calorie");

  return {
    replyText:
      primaryViolation?.message ||
      "I am adjusting this to stay aligned with your recovery and safety signals today.",
    workoutPlan: removeWorkout ? undefined : workoutPlan,
    mealPlan: removeMeal ? undefined : mealPlan,
    safety,
  };
}

function signalCoversSources(signalPacket, sources) {
  const requiredSources = (Array.isArray(sources) ? sources : [])
    .map((source) => String(source ?? "").trim())
    .filter((source) => source && source !== "signals" && source !== "memory");
  if (!requiredSources.length) {
    return true;
  }

  const coveredSources = signalPacket?.dataCoverage?.sources;
  if (!Array.isArray(coveredSources)) {
    return true;
  }

  const covered = new Set(coveredSources);
  return requiredSources.every((source) => source === "profile" || covered.has(source));
}

async function finalizeCoachResponse({ coachResponse, orchestration, message }) {
  console.log("=== RAW PRIMARY LLM RESPONSE ===");
  console.log(coachResponse.text);
  console.log("================================");

  let { planBundle, workoutPlan, mealPlan, replyFallback } = parseCoachPlans(coachResponse.text, orchestration.requestedPlanKinds);

  if (isPlanRequest(orchestration.requestedPlanKinds) && !workoutPlan && !mealPlan) {
    const retryPlans = await generateStructuredPlanRetry({
      message,
      orchestration,
      firstResponseText: coachResponse.text,
    });
    if (retryPlans?.workoutPlan || retryPlans?.mealPlan) {
      planBundle = retryPlans.planBundle;
      workoutPlan = retryPlans.workoutPlan;
      mealPlan = retryPlans.mealPlan;
      replyFallback = retryPlans.replyFallback;
    }
  }

  if (isPlanRequest(orchestration.requestedPlanKinds) && !workoutPlan && !mealPlan) {
    const fallbackPlans = buildStructuredFallbackPlans(orchestration);
    planBundle = fallbackPlans.planBundle;
    workoutPlan = fallbackPlans.workoutPlan;
    mealPlan = fallbackPlans.mealPlan;
    replyFallback = fallbackPlans.replyFallback;
  }

  let replyText = workoutPlan || mealPlan
    ? buildCombinedPlanReply({
        workoutPlan,
        mealPlan,
        modelReply: planBundle?.reply,
      })
    : (replyFallback ?? coachResponse.text);

  const safetyApplied = applySafetyFallback({
    replyText,
    workoutPlan,
    mealPlan,
    signalPacket: orchestration.signalPacket,
  });
  replyText = safetyApplied.replyText;
  workoutPlan = safetyApplied.workoutPlan ?? null;
  mealPlan = safetyApplied.mealPlan ?? null;

  const criticApplied = await runCoachCriticRefiner({
    aiProvider,
    message,
    intent: orchestration.intent,
    signalPacket: orchestration.signalPacket,
    toolResults: orchestration.toolResults,
    replyText,
    workoutPlan,
    mealPlan,
  });
  console.log(criticApplied);

  // If the critic refined the output and we didn't have a plan initially, 
  // it may have successfully fixed the broken JSON. Let's try to parse it again!
  let finalReplyText = criticApplied.replyText;
  if (criticApplied.refined && !workoutPlan && !mealPlan) {
    const reParsed = parseCoachPlans(finalReplyText, orchestration.requestedPlanKinds);
    if (reParsed.workoutPlan || reParsed.mealPlan) {
      workoutPlan = reParsed.workoutPlan ?? null;
      mealPlan = reParsed.mealPlan ?? null;
      finalReplyText = buildCombinedPlanReply({
        workoutPlan,
        mealPlan,
        modelReply: reParsed.planBundle?.reply,
      });
    }
  }

  if (isPlanRequest(orchestration.requestedPlanKinds) && !workoutPlan && !mealPlan) {
    const fallbackPlans = buildStructuredFallbackPlans(orchestration);
    workoutPlan = fallbackPlans.workoutPlan;
    mealPlan = fallbackPlans.mealPlan;
    finalReplyText = buildCombinedPlanReply({
      workoutPlan,
      mealPlan,
      modelReply: fallbackPlans.planBundle.reply,
    });
  }

  return {
    replyText: finalReplyText,
    workoutPlan,
    mealPlan,
    critic: criticApplied.critic,
    refined: criticApplied.refined,
  };
}

async function loadSignalForChat({ db, uid, windowDays, reason, sources }) {
  const cachedState = await loadSignalState(db, uid, { windowDays });
  if (cachedState && signalCoversSources(cachedState.signalPacket, sources)) {
    return {
      signalPacket: cachedState.signalPacket,
      signature: cachedState.signature,
      cacheSource: cachedState.cacheSource,
      context: null,
      recomputed: false,
    };
  }

  const recomputeResult = await recomputeUserSignalState(db, uid, {
    windowDays,
    reason,
    sources,
  });

  return {
    signalPacket: recomputeResult.signalPacket,
    signature: recomputeResult.signature,
    cacheSource: "recomputed",
    context: recomputeResult.context,
    recomputed: true,
  };
}

async function buildCoachOrchestration({ db, uid, message, conversationId, windowDays, includeAllHistory, attachments, intent, requestedPlanKinds }) {
  let signalState = await loadSignalForChat({
    db,
    uid,
    windowDays,
    reason: "chat-cache-miss",
    sources: intent.requiredSources,
  });

  const toolResults = await executeCoachToolActions({
    db,
    uid,
    message,
    aiProvider,
    intent,
  });

  if (hasSuccessfulToolResult(toolResults)) {
    const refreshed = await recomputeUserSignalState(db, uid, {
      windowDays,
      reason: "coach-tool-call",
      sources: intent.requiredSources,
    });
    signalState = {
      signalPacket: refreshed.signalPacket,
      signature: refreshed.signature,
      cacheSource: "tool-refresh",
      context: refreshed.context,
      recomputed: true,
    };
  }

  const context = signalState.context ?? await loadCoachContextForSources(db, uid, {
    windowDays,
    sources: intent.requiredSources,
  });
  const previousCoachChats = intent.requiredSources.includes("memory")
    ? await listRecentConversationContext(db, uid, conversationId)
    : [];
  const contextWithChatHistory = {
    ...context,
    previousCoachChats,
  };
  const history = await listConversationMessages(db, uid, conversationId, 10);

  const retrieval = retrieveSelectiveContext({
    context: contextWithChatHistory,
    signalPacket: signalState.signalPacket,
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

  const systemPrompt = buildCompressedCoachSystemPrompt(requestedPlanKinds);

  return {
    requestedPlanKinds,
    intent,
    signalPacket: signalState.signalPacket,
    signalSignature: signalState.signature,
    signalCacheSource: signalState.cacheSource,
    signalRecomputed: signalState.recomputed,
    systemPrompt,
    userPrompt: buildCompressedCoachUserPrompt({
      promptPacket: compressed.packet,
      message,
      attachments,
      tokenCount: compressed.tokenCount,
      toolResults,
    }),
    history,
    tokenCount: compressed.tokenCount,
    context: contextWithChatHistory,
    previousCoachChats,
    toolResults,
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
      const messageTrimmed = String(message ?? "").trim();
      const conversationId = await ensureConversation(db, uid, chatRequest.conversationId);

      let orchestration;
      let requestedPlanKinds = { workout: false, meal: false };

      if (isLightweightSinglePassCandidate(messageTrimmed, attachments)) {
        const history = await listConversationMessages(db, uid, conversationId, 2);
        orchestration = {
          requestedPlanKinds,
          intent: { primaryIntent: "general", requiredSources: [], secondaryIntents: [], confidence: 1, urgency: "low" },
          signalPacket: { signals: [] },
          context: { window: buildEmptyContextWindow(windowDays, includeAllHistory) },
          tokenCount: 10,
          toolResults: [],
          systemPrompt: buildLightweightCoachSystemPrompt(),
          userPrompt: messageTrimmed,
          history,
        };
      } else {
        const intent = await classifyIntent(message, { aiProvider });
        requestedPlanKinds = {
          workout: Boolean(intent.requestsWorkoutPlan),
          meal: Boolean(intent.requestsMealPlan),
        };
        orchestration = await buildCoachOrchestration({
          db,
          uid,
          message,
          conversationId,
          windowDays,
          includeAllHistory,
          attachments,
          intent,
          requestedPlanKinds,
        });
      }

      const coachResponse = await aiProvider.generateCoachText({
        systemPrompt: orchestration.systemPrompt,
        userPrompt: orchestration.userPrompt,
        history: orchestration.history,
        generationConfig: buildCoachGenerationConfig(requestedPlanKinds),
      });

      const finalReply = await finalizeCoachResponse({
        coachResponse,
        orchestration,
        message,
      });

      await appendConversationMessage(db, uid, conversationId, {
        role: "user",
        content: message,
      });

      await appendConversationMessage(db, uid, conversationId, {
        role: "assistant",
        content: finalReply.replyText,
        model: finalReply.model ?? coachResponse.model,
        usage: finalReply.usage ?? coachResponse.usage,
        workoutPlan: finalReply.workoutPlan,
        mealPlan: finalReply.mealPlan,
      });

      const payload = {
        conversationId,
        reply: finalReply.replyText,
        model: finalReply.model ?? coachResponse.model,
        usage: finalReply.usage ?? coachResponse.usage,
        contextSignals: orchestration.signalPacket.signals,
        contextWindow: orchestration.context.window,
        attachmentsUsed: attachments.length,
        workoutPlan: finalReply.workoutPlan ?? undefined,
        mealPlan: finalReply.mealPlan ?? undefined,
        toolResults: orchestration.toolResults.length ? orchestration.toolResults : undefined,
      };

      return sendValidatedJson(res, CoachChatResponseSchema, payload, "coach chat response");
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
    let responseFinished = false;

    res.on("close", () => {
      if (!responseFinished) {
        clientClosed = true;
      }
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
      const messageTrimmed = String(message ?? "").trim();
      const conversationId = await ensureConversation(db, uid, chatRequest.conversationId);

      let orchestration;
      let requestedPlanKinds = { workout: false, meal: false };

      if (isLightweightSinglePassCandidate(messageTrimmed, attachments)) {
        const history = await listConversationMessages(db, uid, conversationId, 2);
        orchestration = {
          requestedPlanKinds,
          intent: { primaryIntent: "general", requiredSources: [], secondaryIntents: [], confidence: 1, urgency: "low" },
          signalPacket: { signals: [] },
          context: { window: buildEmptyContextWindow(windowDays, includeAllHistory) },
          tokenCount: 10,
          toolResults: [],
          systemPrompt: buildLightweightCoachSystemPrompt(),
          userPrompt: messageTrimmed,
          history,
        };
      } else {
        const intent = await classifyIntent(message, { aiProvider });
        requestedPlanKinds = {
          workout: Boolean(intent.requestsWorkoutPlan),
          meal: Boolean(intent.requestsMealPlan),
        };
        orchestration = await buildCoachOrchestration({
          db,
          uid,
          message,
          conversationId,
          windowDays,
          includeAllHistory,
          attachments,
          intent,
          requestedPlanKinds,
        });
      }

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
        contextWindow: orchestration.context.window,
        tokenCount: orchestration.tokenCount,
        toolResults: orchestration.toolResults,
      });

      let firstTokenSeen = false;
      const streamStart = performance.now();
      const streamResult = await aiProvider.streamCoachText({
        systemPrompt: orchestration.systemPrompt,
        userPrompt: orchestration.userPrompt,
        history: orchestration.history,
        generationConfig: buildCoachGenerationConfig(requestedPlanKinds),
        onToken: async (token) => {
          if (isPlanRequest(requestedPlanKinds)) {
            return;
          }
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

      // If the provider returned the raw stream generator, we MUST consume it to trigger execution
      let coachResponse;
      if (streamResult && typeof streamResult.stream?.[Symbol.asyncIterator] === "function") {
        for await (const _chunk of streamResult.stream) {
          // The onToken callback passed above automatically fires and sends the SSE events
        }
        coachResponse = await streamResult.response;
      } else {
        coachResponse = streamResult;
      }

      if (clientClosed) {
        streamingInterruptions.labels("client-closed").inc();
        return undefined;
      }

      const finalReply = await finalizeCoachResponse({
        coachResponse,
        orchestration,
        message,
      });

      if (finalReply.refined) {
        sendSseEvent(res, "refinement", { reply: finalReply.replyText });
      }

      await appendConversationMessage(db, uid, conversationId, {
        role: "user",
        content: message,
      });

      await appendConversationMessage(db, uid, conversationId, {
        role: "assistant",
        content: finalReply.replyText,
        model: finalReply.model ?? coachResponse.model,
        usage: finalReply.usage ?? coachResponse.usage,
        workoutPlan: finalReply.workoutPlan,
        mealPlan: finalReply.mealPlan,
      });

      const finalPayload = {
        conversationId,
        reply: finalReply.replyText,
        model: finalReply.model ?? coachResponse.model,
        usage: finalReply.usage ?? coachResponse.usage,
        contextSignals: orchestration.signalPacket.signals,
        contextWindow: orchestration.context.window,
        attachmentsUsed: attachments.length,
        workoutPlan: finalReply.workoutPlan ?? undefined,
        mealPlan: finalReply.mealPlan ?? undefined,
        toolResults: orchestration.toolResults.length ? orchestration.toolResults : undefined,
      };
      const finalValidation = safeValidate(CoachChatResponseSchema, finalPayload, "coach stream final response");
      sendSseEvent(res, "final", finalValidation.ok ? finalValidation.data : finalPayload);
      sendSseEvent(res, "done", { ok: true });
      responseFinished = true;
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
        responseFinished = true;
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
      const requiredHomeSources = ["profile", "nutrition", "workouts", "lifestyle", "steps"];
      const cachedSignalState = await loadSignalState(db, uid, { windowDays });
      const signalState = cachedSignalState && signalCoversSources(cachedSignalState.signalPacket, requiredHomeSources)
        ? cachedSignalState
        : await recomputeUserSignalState(db, uid, {
            windowDays,
            reason: "home-insights-cache-miss",
            sources: requiredHomeSources,
          });
      const previousCoachChats = await listRecentConversationContext(db, uid, "");
      const context = buildHomeInsightContextFromSignal(signalState.signalPacket, previousCoachChats);
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
