import dotenv from "dotenv";
import express from "express";
import { createClient } from "redis";
import { mountCoachRoutes } from "./coach/routes.js";
import { generatePlateFoodVisionResponse } from "./coach/geminiClient.js";
import { mountFormAnalysisRoutes } from "./formAnalysis/routes.js";
import { mountHomeRoutes } from "./home/routes.js";
import { mountEmailOtpRoutes } from "./auth/emailOtp.js";
import { mountEventRoutes } from "./events/routes.js";
import { mountMetricsEndpoint, metricsMiddleware } from "./observability/metrics.js";
import { logger } from "./observability/logger.js";
import { closeIntelligenceQueue } from "./queues/intelligenceQueue.js";
import { closeQueueConnection } from "./queues/connection.js";
import { closeIntelligenceWorker, startIntelligenceWorker } from "./queues/worker.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const USDA_API_KEY = (process.env.USDA_API_KEY ?? "").trim();
const OFF_USER_AGENT = (process.env.OPENFOODFACTS_USER_AGENT ?? "AdaptiveFitnessAgent/1.0 (contact@example.com)").trim();
const GOOGLE_VISION_API_KEY = (process.env.GOOGLE_VISION_API_KEY ?? "").trim();
const GOOGLE_VISION_MIN_CONFIDENCE = Math.max(
  0,
  Math.min(toNumber(process.env.GOOGLE_VISION_MIN_CONFIDENCE, 0.6), 1),
);
const GOOGLE_VISION_MAX_RESULTS = toPositiveInt(process.env.GOOGLE_VISION_MAX_RESULTS, 12);

app.use(express.json({ limit: "15mb" }));
app.use(metricsMiddleware);

function toNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback
  }
  return Math.floor(n);
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function normalizeFoodLabel(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeDetectedNutritionQuery(value) {
  const normalized = normalizeFoodLabel(value);
  const compact = normalized.replace(/\s+/g, "");

  if (compact.startsWith("dish") && compact.length > 4) {
    return compact.slice(4).replace(/-/g, " ");
  }

  if (compact.startsWith("ing") && compact.length > 3) {
    return compact.slice(3).replace(/-/g, " ");
  }

  return normalized;
}

const NON_FOOD_DETECTION_LABELS = new Set([
  "plate",
  "bowl",
  "dishware",
  "tableware",
  "serveware",
  "spoon",
  "fork",
  "knife",
  "cutlery",
  "napkin",
  "table",
  "tray",
  "cup",
  "glass",
  "hand",
  "person",
  "package",
  "packaging",
  "container",
  "kitchen utensil",
]);

function isLikelyNonFoodDetection(value) {
  const normalized = normalizeFoodLabel(value);
  return NON_FOOD_DETECTION_LABELS.has(normalized);
}

function extractJsonText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return "";
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return String(fenced[1] ?? "").trim();
  }

  const firstCurly = raw.indexOf("{");
  const lastCurly = raw.lastIndexOf("}");
  if (firstCurly !== -1 && lastCurly > firstCurly) {
    return raw.slice(firstCurly, lastCurly + 1).trim();
  }

  return raw;
}

function clampRatio(value) {
  const n = toNumber(value, 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n);
}

function buildGeminiPlatePrompt(totalWeightGrams) {
  const hasKnownWeight = Number.isFinite(totalWeightGrams) && totalWeightGrams > 0;

  return [
    "Analyze this image for food logging.",
    "Return ONLY valid JSON with this shape:",
    '{ "isFoodPlate": boolean, "items": [{ "name": string, "displayName": string, "estimatedWeightGrams": number, "portionRatio": number, "confidence": number }], "notes": string }',
    "Rules:",
    "Include only visible edible food or drink items. Exclude plates, bowls, cutlery, packaging, hands, tables, napkins, and non-food objects.",
    "Use common searchable food names such as rice, dal, chicken curry, banana, roti, salad, yogurt.",
    "If there are no clear foods, set isFoodPlate false and items to an empty array.",
    "portionRatio is the item's share of edible food on the plate from 0 to 1.",
    hasKnownWeight
      ? `The user's total edible plate weight is ${String(totalWeightGrams)} grams. Make item grams add up close to that total.`
      : "Estimate realistic edible grams from the image. Prefer conservative estimates when uncertain.",
    "confidence must be 0 to 1. Do not include uncertain non-food guesses.",
  ].join("\n");
}

function normalizeGeminiPlateAnalysis(text) {
  const cleaned = extractJsonText(text);
  if (!cleaned) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (!parsed?.isFoodPlate || !Array.isArray(parsed.items)) {
    return [];
  }

  const items = parsed.items
    .map((item) => {
      const label = String(item?.name ?? item?.displayName ?? "").trim();
      const displayName = String(item?.displayName ?? item?.name ?? "").trim();
      const normalizedLabel = normalizeFoodLabel(label);
      if (!normalizedLabel) return null;
      if (isLikelyNonFoodDetection(normalizedLabel)) return null;

      const confidence = toNumber(item?.confidence, 0.8);
      if (confidence < GOOGLE_VISION_MIN_CONFIDENCE) return null;

      const estimatedWeightGrams = Math.max(0, toNumber(item?.estimatedWeightGrams, 0));
      const portionRatio = clampRatio(item?.portionRatio);

      if (estimatedWeightGrams <= 0 && portionRatio <= 0) {
        return null;
      }

      return {
        label: displayName || label,
        normalizedLabel,
        nutritionQuery: normalizeDetectedNutritionQuery(label),
        confidence,
        estimatedWeightGrams,
        portionRatio,
        pixelArea: portionRatio > 0 ? portionRatio : Math.max(estimatedWeightGrams, 1),
      };
    })
    .filter(Boolean);

  const byLabel = new Map();
  for (const item of items) {
    const existing = byLabel.get(item.normalizedLabel);
    if (!existing) {
      byLabel.set(item.normalizedLabel, item);
      continue;
    }

    existing.confidence = Math.max(existing.confidence, item.confidence);
    existing.estimatedWeightGrams += item.estimatedWeightGrams;
    existing.portionRatio += item.portionRatio;
    existing.pixelArea += item.pixelArea;
  }

  return Array.from(byLabel.values());
}

async function runGeminiPlateFoodDetection(input) {
  const response = await generatePlateFoodVisionResponse({
    imageBase64: input.imageBase64,
    mimeType: input.mimeType,
    prompt: buildGeminiPlatePrompt(input.totalWeightGrams),
  });

  return {
    model: response.model,
    detections: normalizeGeminiPlateAnalysis(response.text),
  };
}

const REDIS_URL = (process.env.REDIS_URL ?? "").trim();
const REDIS_KEY_PREFIX = (process.env.REDIS_KEY_PREFIX ?? "adaptive_fitness:nutrition").trim();
const REDIS_CONNECT_TIMEOUT_MS = toPositiveInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 5000);
const REDIS_SOURCE_TTL_SECONDS = toPositiveInt(process.env.REDIS_SOURCE_TTL_SECONDS, 3600);
const REDIS_SEARCH_TTL_SECONDS = toPositiveInt(process.env.REDIS_SEARCH_TTL_SECONDS, 300);
const CACHE_SCHEMA_VERSION = "v3";
const CACHE_ENABLED =
  String(process.env.REDIS_CACHE_ENABLED ?? "true").toLowerCase() !== "false";

let redisClient = null;
let redisReady = false;

function normalizeKeyPart(value) {
  return encodeURIComponent(
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " "),
  );
}

function buildRedisKey(parts) {
  return [REDIS_KEY_PREFIX, CACHE_SCHEMA_VERSION, ...parts.map((part) => normalizeKeyPart(part))].join(":");
}

async function initRedis() {
  if (!REDIS_URL) {
    console.warn("Redis disabled: REDIS_URL is empty.");
    return;
  }

  const client = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS
    },
  });

  client.on("error", (error) => {
    console.warn("Redis client error", error instanceof Error ? error.message : "Unknown error")
  });

  try {
    await client.connect();
    redisClient = client;
    redisReady = true;
    console.log("Redis client connected.");
  } catch (error) {
    redisReady = false;
    redisClient = null;
    console.warn("Redis client connection failed.", error instanceof Error ? error.message : "Unknown error")
  }
}

await initRedis();

async function cacheGetJson(key) {
  if (!redisReady || !redisClient) {
    return null;
  }

  try {
    const raw = await redisClient.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Redis GET failed for key:", key);
    console.warn(error instanceof Error ? error.message : "Unknown Redis GET error");
    return null;
  }
}

async function cacheSetJson(key, value, ttlSeconds) {
  if (!redisReady || !redisClient) {
    return;
  }

  try {
    await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (error) {
    console.warn("Redis GET failed for key:", key);
    console.warn(error instanceof Error ? error.message : "Unknown Redis GET error");
  }
}

function parseServingSizeInGrams(value) {
  if (!value) return undefined;
  const match = String(value).match(/(\d+(?:\.\d+)?)\s*g/i);
  if (!match) return undefined;
  const grams = Number(match[1]);
  if (!Number.isFinite(grams) || grams <= 0) return undefined;
  return grams;
}

function parseServingSizeInMl(value) {
  if (!value) return undefined;
  const match = String(value).match(/(\d+(?:\.\d+)?)\s*(ml|milliliter|millilitre|l|liter|litre)\b/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = String(match[2]).toLowerCase();
  return unit === "l" || unit === "liter" || unit === "litre" ? amount * 1000 : amount;
}

function parseServingQuantityToMl(quantity, unit) {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) return undefined;

  const normalizedUnit = String(unit ?? "").trim().toLowerCase();
  if (normalizedUnit === "ml" || normalizedUnit === "milliliter" || normalizedUnit === "millilitre") {
    return q;
  }

  if (normalizedUnit === "l" || normalizedUnit === "liter" || normalizedUnit === "litre") {
    return q * 1000;
  }

  return undefined;
}

function parseServingQuantityToGrams(quantity, unit) {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) return undefined;

  const normalizedUnit = String(unit ?? "").trim().toLowerCase();
  if (normalizedUnit === "g" || normalizedUnit === "gram" || normalizedUnit === "grams") {
    return q;
  }

  if (normalizedUnit === "oz" || normalizedUnit === "ounce" || normalizedUnit === "ounces") {
    return q * 28.3495;
  }

  return undefined;
}

function normalizeOffNutritionDataPer(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized) return undefined;
  if (normalized === "serving") return "serving";
  if (normalized === "100ml") return "100ml";
  if (normalized === "100g") return "100g";
  return undefined;
}

function toMilligrams(value, unit, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;

  const normalized = String(unit ?? "").trim().toLowerCase();
  if (normalized === "g") return n * 1000;
  if (normalized === "mg" || normalized === "") return n;
  if (normalized === "ug" || normalized === "µg") return n / 1000;
  return n;
}

function pickUsdaNutrient(foodNutrients, nutrientNumber, nameHint) {
  const nutrients = Array.isArray(foodNutrients) ? foodNutrients : [];
  const byNumber = nutrients.find((n) => n?.nutrientNumber === nutrientNumber);
  if (byNumber && typeof byNumber.value === "number") return byNumber.value;

  const byName = nutrients.find((n) =>
    String(n?.nutrientName ?? "").toLowerCase().includes(nameHint.toLowerCase()),
  );
  if (byName && typeof byName.value === "number") return byName.value;

  return 0;
}

function getVisionBoundingArea(boundingPoly) {
  if (!boundingPoly || typeof boundingPoly !== "object") return 0;

  const vertices = Array.isArray(boundingPoly.normalizedVertices)
    ? boundingPoly.normalizedVertices
    : Array.isArray(boundingPoly.vertices)
      ? boundingPoly.vertices
      : [];

  if (!vertices.length) return 0;

  const xs = vertices.map((vertex) => toNumber(vertex?.x, 0));
  const ys = vertices.map((vertex) => toNumber(vertex?.y, 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  return width * height;
}

function normalizeVisionObjects(objects) {
  const byLabel = new Map();

  for (const raw of objects) {
    const label = String(raw?.name ?? "").trim();
    const normalizedLabel = normalizeFoodLabel(label);
    if (!normalizedLabel) continue;
    if (isLikelyNonFoodDetection(normalizedLabel)) continue;

    const confidence = toNumber(raw?.score ?? raw?.confidence, 1);
    if (confidence < GOOGLE_VISION_MIN_CONFIDENCE) continue;

    const pixelArea = getVisionBoundingArea(raw?.boundingPoly);
    if (pixelArea <= 0) continue;

    const existing = byLabel.get(normalizedLabel);
    if (existing) {
      existing.pixelArea += pixelArea;
      existing.confidence = Math.max(existing.confidence, confidence);
      continue;
    }

    byLabel.set(normalizedLabel, {
      label,
      normalizedLabel,
      nutritionQuery: normalizeDetectedNutritionQuery(label),
      confidence,
      pixelArea,
    });
  }

  return Array.from(byLabel.values());
}

function normalizeVisionLabels(labels) {
  const byLabel = new Map();

  for (const raw of labels) {
    const label = String(raw?.description ?? raw?.name ?? "").trim();
    const normalizedLabel = normalizeFoodLabel(label);
    if (!normalizedLabel) continue;
    if (isLikelyNonFoodDetection(normalizedLabel)) continue;

    const confidence = toNumber(raw?.score ?? raw?.confidence, 1);
    if (confidence < GOOGLE_VISION_MIN_CONFIDENCE) continue;

    const existing = byLabel.get(normalizedLabel);
    if (existing) {
      existing.confidence = Math.max(existing.confidence, confidence);
      continue;
    }

    byLabel.set(normalizedLabel, {
      label,
      normalizedLabel,
      nutritionQuery: normalizeDetectedNutritionQuery(label),
      confidence,
      pixelArea: 1,
    });
  }

  return Array.from(byLabel.values());
}

function normalizeVisionDetections(rawPayload) {
  const responseEntry = rawPayload?.responses?.[0] ?? {};
  const objects = Array.isArray(responseEntry.localizedObjectAnnotations)
    ? responseEntry.localizedObjectAnnotations
    : [];

  const objectDetections = objects.length > 0 ? normalizeVisionObjects(objects) : [];
  if (objectDetections.length > 0) {
    return objectDetections;
  }

  const labels = Array.isArray(responseEntry.labelAnnotations)
    ? responseEntry.labelAnnotations
    : [];
  return normalizeVisionLabels(labels);
}

async function runGoogleVisionDetection(input) {
  if (!GOOGLE_VISION_API_KEY) {
    const error = new Error("Plate image detection is not configured. Set GOOGLE_VISION_API_KEY in nutrition-proxy/.env.");
    error.statusCode = 501;
    throw error;
  }

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(GOOGLE_VISION_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content: input.imageBase64 },
            features: [
              { type: "OBJECT_LOCALIZATION", maxResults: GOOGLE_VISION_MAX_RESULTS },
              { type: "LABEL_DETECTION", maxResults: GOOGLE_VISION_MAX_RESULTS },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = String(payload?.error?.message ?? "").trim();
    } catch {
      detail = "";
    }
    throw new Error(detail || `Google Vision detection failed (${response.status}).`);
  }

  const payload = await response.json();
  const responseEntry = payload?.responses?.[0];
  if (responseEntry?.error?.message) {
    throw new Error(String(responseEntry.error.message));
  }

  return normalizeVisionDetections(payload);
}

function scaleFoodNutrients(food, grams) {
  const factor = grams / 100;
  return {
    calories: roundOne(toNumber(food?.caloriesPer100g, 0) * factor),
    protein: roundOne(toNumber(food?.proteinPer100g, 0) * factor),
    carbs: roundOne(toNumber(food?.carbsPer100g, 0) * factor),
    fat: roundOne(toNumber(food?.fatPer100g, 0) * factor),
    fiber: roundOne(toNumber(food?.fiberPer100g, 0) * factor),
    sodiumMg: roundOne(toNumber(food?.sodiumMgPer100g, 0) * factor),
    potassiumMg: roundOne(toNumber(food?.potassiumMgPer100g, 0) * factor),
    calciumMg: roundOne(toNumber(food?.calciumMgPer100g, 0) * factor),
    ironMg: roundOne(toNumber(food?.ironMgPer100g, 0) * factor),
    vitaminCMg: roundOne(toNumber(food?.vitaminCMgPer100g, 0) * factor),
  };
}

function addNutrients(left, right) {
  return {
    calories: roundOne(left.calories + right.calories),
    protein: roundOne(left.protein + right.protein),
    carbs: roundOne(left.carbs + right.carbs),
    fat: roundOne(left.fat + right.fat),
    fiber: roundOne(left.fiber + right.fiber),
    sodiumMg: roundOne(left.sodiumMg + right.sodiumMg),
    potassiumMg: roundOne(left.potassiumMg + right.potassiumMg),
    calciumMg: roundOne(left.calciumMg + right.calciumMg),
    ironMg: roundOne(left.ironMg + right.ironMg),
    vitaminCMg: roundOne(left.vitaminCMg + right.vitaminCMg),
  };
}

async function resolveNutritionForDetectedLabel(label) {
  const pageSize = 3;
  const [usdaResult, offResult] = await Promise.allSettled([
    searchUsda(label, pageSize),
    searchOpenFoodFacts(label, pageSize),
  ]);

  const usdaItems = usdaResult.status === "fulfilled" ? usdaResult.value : [];
  const offItems = offResult.status === "fulfilled" ? offResult.value : [];
  const candidates = [...usdaItems, ...offItems];

  return candidates.find((item) =>
    toNumber(item.caloriesPer100g, 0) > 0 ||
    toNumber(item.proteinPer100g, 0) > 0 ||
    toNumber(item.carbsPer100g, 0) > 0 ||
    toNumber(item.fatPer100g, 0) > 0,
  ) ?? null;
}

async function searchUsda(query, pageSize) {
  if (!USDA_API_KEY) return [];

  const key = buildRedisKey(["source", "usda", query, String(pageSize)]);
  if (CACHE_ENABLED) {
    const cached = await cacheGetJson(key);
    if (Array.isArray(cached)) {
      return cached;
    }
  }

  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(USDA_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        pageSize,
        dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`USDA failed (${response.status})`);
  }

  const json = await response.json();
  const foods = Array.isArray(json.foods) ? json.foods : [];

  const items = foods
    .map((food) => {
      const name = String(food.description ?? "").trim();
      if (!name) return null;

      const servingUnit = String(food.servingSizeUnit ?? "").trim();
      const servingUnitNormalized = servingUnit.toLowerCase();
      const servingSizeValue = toNumber(food.servingSize, 0);

      const servingSizeGrams =
        servingSizeValue > 0 &&
        (servingUnitNormalized === "g" ||
          servingUnitNormalized === "gram" ||
          servingUnitNormalized === "grams")
          ? servingSizeValue
          : undefined;

      const servingSizeMl = parseServingQuantityToMl(food.servingSize, food.servingSizeUnit);

      const servingText =
        servingSizeValue > 0 && servingUnit
          ? `${servingSizeValue} ${servingUnit}`
          : undefined;

      const isBranded = String(food.dataType ?? "").trim().toLowerCase() === "branded";
      const nutrientBasis = isBranded && servingSizeMl ? "100ml" : "100g";

      return {
        id: "usda-" + String(food.fdcId),
        name,
        brand: food.brandOwner ? String(food.brandOwner) : undefined,
        source: "USDA",
        nutrientBasis,
        caloriesPer100g: toNumber(pickUsdaNutrient(food.foodNutrients, "208", "energy"), 0),
        proteinPer100g: toNumber(pickUsdaNutrient(food.foodNutrients, "203", "protein"), 0),
        carbsPer100g: toNumber(pickUsdaNutrient(food.foodNutrients, "205", "carbohydrate"), 0),
        fatPer100g: toNumber(pickUsdaNutrient(food.foodNutrients, "204", "total lipid"), 0),
        fiberPer100g: toNumber(pickUsdaNutrient(food.foodNutrients, "291", "fiber"), 0),
        sodiumMgPer100g: toNumber(pickUsdaNutrient(food.foodNutrients, "307", "sodium"), 0),
        potassiumMgPer100g: toNumber(pickUsdaNutrient(food.foodNutrients, "306", "potassium"), 0),
        calciumMgPer100g: toNumber(pickUsdaNutrient(food.foodNutrients, "301", "calcium"), 0),
        ironMgPer100g: toNumber(pickUsdaNutrient(food.foodNutrients, "303", "iron"), 0),
        vitaminCMgPer100g: toNumber(pickUsdaNutrient(food.foodNutrients, "401", "vitamin c"), 0),
        servingSizeGrams,
        servingSizeMl,
        servingText,
      };
    })
    .filter(Boolean);

  if (CACHE_ENABLED) {
    await cacheSetJson(key, items, REDIS_SOURCE_TTL_SECONDS);
  }

  return items;
}

async function searchOpenFoodFacts(query, pageSize) {
  const key = buildRedisKey(["source", "off", query, String(pageSize)]);
  if (CACHE_ENABLED) {
    const cached = await cacheGetJson(key);
    if (Array.isArray(cached)) {
      return cached;
    }
  }

  const url =
    "https://world.openfoodfacts.org/cgi/search.pl" +
    `?search_terms=${encodeURIComponent(query)}` +
    "&search_simple=1&action=process&json=1" +
    `&page_size=${encodeURIComponent(String(pageSize))}` +
    "&fields=code,product_name,brands,serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,quantity,nutriments,image_front_small_url";

  const response = await fetch(url, {
    headers: {
      "User-Agent": OFF_USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Open Food Facts failed (${response.status})`);
  }

  const json = await response.json();
  const products = Array.isArray(json.products) ? json.products : [];

  const items = products
    .map((product) => {
      const name = String(product.product_name ?? "").trim();
      if (!name) return null;

      const nutriments = product.nutriments ?? {};
      const code = String(product.code ?? "").trim();
      const servingSizeGramsFromText = parseServingSizeInGrams(product.serving_size);
      const servingSizeGramsFromQuantity = parseServingQuantityToGrams(
        product.serving_quantity,
        product.serving_quantity_unit,
      );
      const servingSizeGrams = servingSizeGramsFromText ?? servingSizeGramsFromQuantity;

      const servingSizeMlFromText = parseServingSizeInMl(product.serving_size);
      const servingSizeMlFromQuantity = parseServingQuantityToMl(
        product.serving_quantity,
        product.serving_quantity_unit,
      );
      const servingSizeMl = servingSizeMlFromText ?? servingSizeMlFromQuantity;
      const servingText =
        (product.serving_size ? String(product.serving_size).trim() : "") ||
        (product.serving_quantity && product.serving_quantity_unit
          ? `${product.serving_quantity} ${product.serving_quantity_unit}`
          : "") ||
        (product.quantity ? String(product.quantity).trim() : "") ||
        undefined;

      const hasPer100ml = [
        nutriments["energy-kcal_100ml"],
        nutriments.proteins_100ml,
        nutriments.carbohydrates_100ml,
        nutriments.fat_100ml,
        nutriments.fiber_100ml,
        nutriments.sodium_100ml,
        nutriments.potassium_100ml,
        nutriments.calcium_100ml,
        nutriments.iron_100ml,
        nutriments["vitamin-c_100ml"],
      ].some((value) => Number.isFinite(Number(value)));

      const nutritionDataPer = normalizeOffNutritionDataPer(product.nutrition_data_per);

      let basisFromDataPer;
      if (nutritionDataPer === "100ml") {
        basisFromDataPer = "100ml";
      } else if (nutritionDataPer === "100g") {
        basisFromDataPer = "100g";
      } else if (nutritionDataPer === "serving") {
        if (servingSizeMl && !servingSizeGrams) {
          basisFromDataPer = "100ml";
        } else if (servingSizeGrams) {
          basisFromDataPer = "100g";
        }
      }

      const nutrientBasis =
        basisFromDataPer ??
        (hasPer100ml ? "100ml" : servingSizeMl && !servingSizeGrams ? "100ml" : "100g");

      return {
        id: code ? `off-${code}` : `off-${name.toLowerCase().replace(/\s+/g, "-")}`,
        name,
        brand: product.brands ? String(product.brands) : undefined,
        source: "OpenFoodFacts",
        nutrientBasis,
        caloriesPer100g:
          nutrientBasis === "100ml"
            ? toNumber(nutriments["energy-kcal_100ml"], toNumber(nutriments["energy-kcal_100g"], 0))
            : toNumber(nutriments["energy-kcal_100g"], 0),
        proteinPer100g:
          nutrientBasis === "100ml"
            ? toNumber(nutriments.proteins_100ml, toNumber(nutriments.proteins_100g, 0))
            : toNumber(nutriments.proteins_100g, 0),
        carbsPer100g:
          nutrientBasis === "100ml"
            ? toNumber(nutriments.carbohydrates_100ml, toNumber(nutriments.carbohydrates_100g, 0))
            : toNumber(nutriments.carbohydrates_100g, 0),
        fatPer100g:
          nutrientBasis === "100ml"
            ? toNumber(nutriments.fat_100ml, toNumber(nutriments.fat_100g, 0))
            : toNumber(nutriments.fat_100g, 0),
        fiberPer100g:
          nutrientBasis === "100ml"
            ? toNumber(nutriments.fiber_100ml, toNumber(nutriments.fiber_100g, 0))
            : toNumber(nutriments.fiber_100g, 0),
        sodiumMgPer100g:
          nutrientBasis === "100ml"
            ? toMilligrams(
                nutriments.sodium_100ml,
                nutriments.sodium_unit ?? "g",
                toMilligrams(nutriments.sodium_100g, nutriments.sodium_unit ?? "g", 0),
              )
            : toMilligrams(nutriments.sodium_100g, nutriments.sodium_unit ?? "g", 0),
        potassiumMgPer100g:
          nutrientBasis === "100ml"
            ? toMilligrams(
                nutriments.potassium_100ml,
                nutriments.potassium_unit ?? "mg",
                toMilligrams(nutriments.potassium_100g, nutriments.potassium_unit ?? "mg", 0),
              )
            : toMilligrams(nutriments.potassium_100g, nutriments.potassium_unit ?? "mg", 0),
        calciumMgPer100g:
          nutrientBasis === "100ml"
            ? toMilligrams(
                nutriments.calcium_100ml,
                nutriments.calcium_unit ?? "mg",
                toMilligrams(nutriments.calcium_100g, nutriments.calcium_unit ?? "mg", 0),
              )
            : toMilligrams(nutriments.calcium_100g, nutriments.calcium_unit ?? "mg", 0),
        ironMgPer100g:
          nutrientBasis === "100ml"
            ? toMilligrams(
                nutriments.iron_100ml,
                nutriments.iron_unit ?? "mg",
                toMilligrams(nutriments.iron_100g, nutriments.iron_unit ?? "mg", 0),
              )
            : toMilligrams(nutriments.iron_100g, nutriments.iron_unit ?? "mg", 0),
        vitaminCMgPer100g:
          nutrientBasis === "100ml"
            ? toMilligrams(
                nutriments["vitamin-c_100ml"],
                nutriments["vitamin-c_unit"] ?? "mg",
                toMilligrams(nutriments["vitamin-c_100g"], nutriments["vitamin-c_unit"] ?? "mg", 0),
              )
            : toMilligrams(nutriments["vitamin-c_100g"], nutriments["vitamin-c_unit"] ?? "mg", 0),
        servingSizeGrams,
        servingSizeMl,
        servingText,
        imageUrl: product.image_front_small_url ? String(product.image_front_small_url) : undefined,
      };
    })
    .filter(Boolean);

  if (CACHE_ENABLED) {
    await cacheSetJson(key, items, REDIS_SOURCE_TTL_SECONDS);
  }

  return items;
}

function mapOpenFoodFactsProduct(product) {
  const name = String(product?.product_name ?? "").trim();
  if (!name) return null;

  const nutriments = product.nutriments ?? {};
  const code = String(product.code ?? "").trim();
  const servingSizeGramsFromText = parseServingSizeInGrams(product.serving_size);
  const servingSizeGramsFromQuantity = parseServingQuantityToGrams(
    product.serving_quantity,
    product.serving_quantity_unit,
  );
  const servingSizeGrams = servingSizeGramsFromText ?? servingSizeGramsFromQuantity;

  const servingSizeMlFromText = parseServingSizeInMl(product.serving_size);
  const servingSizeMlFromQuantity = parseServingQuantityToMl(
    product.serving_quantity,
    product.serving_quantity_unit,
  );
  const servingSizeMl = servingSizeMlFromText ?? servingSizeMlFromQuantity;
  const servingText =
    (product.serving_size ? String(product.serving_size).trim() : "") ||
    (product.serving_quantity && product.serving_quantity_unit
      ? `${product.serving_quantity} ${product.serving_quantity_unit}`
      : "") ||
    (product.quantity ? String(product.quantity).trim() : "") ||
    undefined;

  const hasPer100ml = [
    nutriments["energy-kcal_100ml"],
    nutriments.proteins_100ml,
    nutriments.carbohydrates_100ml,
    nutriments.fat_100ml,
    nutriments.fiber_100ml,
    nutriments.sodium_100ml,
    nutriments.potassium_100ml,
    nutriments.calcium_100ml,
    nutriments.iron_100ml,
    nutriments["vitamin-c_100ml"],
  ].some((value) => Number.isFinite(Number(value)));

  const nutritionDataPer = normalizeOffNutritionDataPer(product.nutrition_data_per);

  let basisFromDataPer;
  if (nutritionDataPer === "100ml") {
    basisFromDataPer = "100ml";
  } else if (nutritionDataPer === "100g") {
    basisFromDataPer = "100g";
  } else if (nutritionDataPer === "serving") {
    if (servingSizeMl && !servingSizeGrams) {
      basisFromDataPer = "100ml";
    } else if (servingSizeGrams) {
      basisFromDataPer = "100g";
    }
  }

  const nutrientBasis =
    basisFromDataPer ??
    (hasPer100ml ? "100ml" : servingSizeMl && !servingSizeGrams ? "100ml" : "100g");

  return {
    id: code ? `off-${code}` : `off-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    brand: product.brands ? String(product.brands) : undefined,
    source: "OpenFoodFacts",
    nutrientBasis,
    caloriesPer100g:
      nutrientBasis === "100ml"
        ? toNumber(nutriments["energy-kcal_100ml"], toNumber(nutriments["energy-kcal_100g"], 0))
        : toNumber(nutriments["energy-kcal_100g"], 0),
    proteinPer100g:
      nutrientBasis === "100ml"
        ? toNumber(nutriments.proteins_100ml, toNumber(nutriments.proteins_100g, 0))
        : toNumber(nutriments.proteins_100g, 0),
    carbsPer100g:
      nutrientBasis === "100ml"
        ? toNumber(nutriments.carbohydrates_100ml, toNumber(nutriments.carbohydrates_100g, 0))
        : toNumber(nutriments.carbohydrates_100g, 0),
    fatPer100g:
      nutrientBasis === "100ml"
        ? toNumber(nutriments.fat_100ml, toNumber(nutriments.fat_100g, 0))
        : toNumber(nutriments.fat_100g, 0),
    fiberPer100g:
      nutrientBasis === "100ml"
        ? toNumber(nutriments.fiber_100ml, toNumber(nutriments.fiber_100g, 0))
        : toNumber(nutriments.fiber_100g, 0),
    sodiumMgPer100g:
      nutrientBasis === "100ml"
        ? toMilligrams(
            nutriments.sodium_100ml,
            nutriments.sodium_unit ?? "g",
            toMilligrams(nutriments.sodium_100g, nutriments.sodium_unit ?? "g", 0),
          )
        : toMilligrams(nutriments.sodium_100g, nutriments.sodium_unit ?? "g", 0),
    potassiumMgPer100g:
      nutrientBasis === "100ml"
        ? toMilligrams(
            nutriments.potassium_100ml,
            nutriments.potassium_unit ?? "mg",
            toMilligrams(nutriments.potassium_100g, nutriments.potassium_unit ?? "mg", 0),
          )
        : toMilligrams(nutriments.potassium_100g, nutriments.potassium_unit ?? "mg", 0),
    calciumMgPer100g:
      nutrientBasis === "100ml"
        ? toMilligrams(
            nutriments.calcium_100ml,
            nutriments.calcium_unit ?? "mg",
            toMilligrams(nutriments.calcium_100g, nutriments.calcium_unit ?? "mg", 0),
          )
        : toMilligrams(nutriments.calcium_100g, nutriments.calcium_unit ?? "mg", 0),
    ironMgPer100g:
      nutrientBasis === "100ml"
        ? toMilligrams(
            nutriments.iron_100ml,
            nutriments.iron_unit ?? "mg",
            toMilligrams(nutriments.iron_100g, nutriments.iron_unit ?? "mg", 0),
          )
        : toMilligrams(nutriments.iron_100g, nutriments.iron_unit ?? "mg", 0),
    vitaminCMgPer100g:
      nutrientBasis === "100ml"
        ? toMilligrams(
            nutriments["vitamin-c_100ml"],
            nutriments["vitamin-c_unit"] ?? "mg",
            toMilligrams(nutriments["vitamin-c_100g"], nutriments["vitamin-c_unit"] ?? "mg", 0),
          )
        : toMilligrams(nutriments["vitamin-c_100g"], nutriments["vitamin-c_unit"] ?? "mg", 0),
    servingSizeGrams,
    servingSizeMl,
    servingText,
    imageUrl: product.image_front_small_url ? String(product.image_front_small_url) : undefined,
  };
}

async function getOpenFoodFactsProductByBarcode(barcode) {
  const fields = [
    "code",
    "product_name",
    "brands",
    "serving_size",
    "serving_quantity",
    "serving_quantity_unit",
    "nutrition_data_per",
    "quantity",
    "nutriments",
    "image_front_small_url",
  ].join(",");
  const url =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
    `?fields=${encodeURIComponent(fields)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": OFF_USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Open Food Facts barcode lookup failed (${response.status}).`);
  }

  const payload = await response.json();
  if (Number(payload.status) !== 1 || !payload.product) {
    return null;
  }

  return mapOpenFoodFactsProduct(payload.product);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/foods/search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const pageSizeRaw = Number(req.query.pageSize ?? 12);
    const pageSize = Number.isFinite(pageSizeRaw)
      ? Math.max(5, Math.min(Math.floor(pageSizeRaw), 20))
      : 12;

    if (q.length < 2) {
      return res.status(400).json({ message: "q must be at least 2 characters." });
    }

    const searchKey = buildRedisKey(["search", q, String(pageSize)]);
    if (CACHE_ENABLED) {
      const cachedPayload = await cacheGetJson(searchKey);
      if (cachedPayload && Array.isArray(cachedPayload.items)) {
        res.set("X-Search-Cache", "HIT");
        return res.json(cachedPayload);
      }
    }

    const [usdaResult, offResult] = await Promise.allSettled([
      searchUsda(q, pageSize),
      searchOpenFoodFacts(q, pageSize),
    ]);

    const usdaItems = usdaResult.status === "fulfilled" ? usdaResult.value : [];
    const offItems = offResult.status === "fulfilled" ? offResult.value : [];
    const items = [...usdaItems, ...offItems].slice(0, pageSize);

    const payload = {
      items,
      meta: {
        usda: usdaResult.status,
        openFoodFacts: offResult.status,
      },
    };

    if (CACHE_ENABLED) {
      await cacheSetJson(searchKey, payload, REDIS_SEARCH_TTL_SECONDS);
    }

    res.set("X-Search-Cache", "MISS");
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({
      message: "Search failed.",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/api/foods/barcode/:barcode", async (req, res) => {
  try {
    const barcode = String(req.params.barcode ?? "").replace(/\D/g, "");

    if (barcode.length < 6) {
      return res.status(400).json({ message: "Barcode must be at least 6 digits." });
    }

    const item = await getOpenFoodFactsProductByBarcode(barcode);
    if (!item) {
      return res.status(404).json({ message: "No Open Food Facts product found for this barcode." });
    }

    return res.json({ item });
  } catch (error) {
    return res.status(500).json({
      message: "Barcode lookup failed.",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/foods/plate/analyze", async (req, res) => {
  try {
    const imageBase64 = String(req.body?.imageBase64 ?? "").trim();
    const mimeType = String(req.body?.mimeType ?? "image/jpeg").trim() || "image/jpeg";
    const totalWeightGrams = toNumber(req.body?.totalWeightGrams, 0);

    if (!imageBase64) {
      return res.status(400).json({ message: "imageBase64 is required." });
    }

    let detections = [];
    let detectorMeta = { detector: "gemini-vision" };
    let geminiError = null;

    try {
      const geminiResult = await runGeminiPlateFoodDetection({
        imageBase64,
        mimeType,
        totalWeightGrams,
      });
      detections = geminiResult.detections;
      detectorMeta = {
        detector: "gemini-vision",
        model: geminiResult.model,
        minConfidence: GOOGLE_VISION_MIN_CONFIDENCE,
      };
    } catch (error) {
      geminiError = error instanceof Error ? error.message : "Gemini vision failed.";
    }

    if (detections.length === 0 && GOOGLE_VISION_API_KEY && totalWeightGrams > 0) {
      detections = await runGoogleVisionDetection({ imageBase64, mimeType });
      detectorMeta = {
        detector: "google-vision",
        minConfidence: GOOGLE_VISION_MIN_CONFIDENCE,
        geminiFallbackReason: geminiError,
      };
    }

    if (detections.length === 0) {
      return res.status(422).json({
        message: "No clear food items were detected in this image.",
        detail: geminiError || undefined,
      });
    }

    const resolvedDetections = (
      await Promise.all(
        detections.map(async (detection) => {
          const matchedFood = await resolveNutritionForDetectedLabel(detection.normalizedLabel);
          const matchedCleanedFood = matchedFood ?? await resolveNutritionForDetectedLabel(detection.nutritionQuery);
          if (!matchedCleanedFood) return null;
          return {
            detection,
            matchedFood: matchedCleanedFood,
          };
        }),
      )
    ).filter(Boolean);

    if (resolvedDetections.length === 0) {
      return res.status(422).json({
        message: "No detected items matched food nutrition data.",
        detectedLabels: detections.map((detection) => detection.label),
      });
    }

    const totalEstimatedWeight = resolvedDetections.reduce(
      (sum, item) => sum + Math.max(0, toNumber(item.detection.estimatedWeightGrams, 0)),
      0,
    );
    const totalPixelArea = resolvedDetections.reduce((sum, item) => sum + item.detection.pixelArea, 0);
    if (totalPixelArea <= 0 && totalEstimatedWeight <= 0) {
      return res.status(422).json({
        message: "Detected food items did not include usable quantity estimates.",
      });
    }

    const items = await Promise.all(
      resolvedDetections.map(async ({ detection, matchedFood }) => {
        const knownWeightScale =
          totalWeightGrams > 0 && totalEstimatedWeight > 0
            ? totalWeightGrams / totalEstimatedWeight
            : 1;
        const areaRatio = detection.portionRatio > 0
          ? detection.portionRatio
          : totalPixelArea > 0
            ? detection.pixelArea / totalPixelArea
            : detection.estimatedWeightGrams / totalEstimatedWeight;
        const estimatedWeightGrams = detection.estimatedWeightGrams > 0
          ? detection.estimatedWeightGrams * knownWeightScale
          : totalWeightGrams > 0
            ? totalWeightGrams * areaRatio
            : totalEstimatedWeight * areaRatio;
        const nutrients = scaleFoodNutrients(matchedFood, estimatedWeightGrams);

        return {
          label: detection.normalizedLabel,
          displayName: detection.label,
          confidence: roundOne(detection.confidence),
          pixelArea: roundOne(detection.pixelArea),
          areaRatio: Number(areaRatio.toFixed(4)),
          estimatedWeightGrams: roundOne(estimatedWeightGrams),
          matchedFood,
          ...nutrients,
        };
      }),
    );

    const emptyTotals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sodiumMg: 0,
      potassiumMg: 0,
      calciumMg: 0,
      ironMg: 0,
      vitaminCMg: 0,
    };

    const totals = items.reduce((acc, item) => addNutrients(acc, item), emptyTotals);

    return res.json({
      totalWeightGrams: roundOne(
        totalWeightGrams > 0
          ? totalWeightGrams
          : items.reduce((sum, item) => sum + item.estimatedWeightGrams, 0),
      ),
      totalPixelArea: roundOne(totalPixelArea),
      items,
      totals,
      meta: detectorMeta,
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode);
    return res.status(Number.isFinite(statusCode) ? statusCode : 500).json({
      message: "Plate analysis failed.",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

mountCoachRoutes(app);
mountHomeRoutes(app);
mountFormAnalysisRoutes(app);
mountEmailOtpRoutes(app);
mountEventRoutes(app);
mountMetricsEndpoint(app);
startIntelligenceWorker();

app.listen(PORT, () => {
  logger.info({ port: PORT }, "Nutrition proxy running.");
});

async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down...`);
  if (redisClient && redisReady) {
    try {
      await redisClient.quit();
      logger.info("Redis client closed.");
    } catch (error) {

    }
  }
  await closeIntelligenceWorker();
  await closeIntelligenceQueue();
  await closeQueueConnection();
  process.exit(0);
}

process.on("SIGINT", () => {
  gracefulShutdown("SIGINT").catch(() => process.exit(0));
});

process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM").catch(() => process.exit(0));
})
