import dotenv from "dotenv";
import express from "express";
import { createClient } from "redis";
import { mountCoachRoutes } from "./coach/routes.js";
import { mountFormAnalysisRoutes } from "./formAnalysis/routes.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const USDA_API_KEY = (process.env.USDA_API_KEY ?? "").trim();
const OFF_USER_AGENT = (process.env.OPENFOODFACTS_USER_AGENT ?? "AdaptiveFitnessAgent/1.0 (contact@example.com)").trim();
const YOLO_FOOD_DETECTION_URL = (process.env.YOLO_FOOD_DETECTION_URL ?? "").trim();
const YOLO_FOOD_DETECTION_API_KEY = (process.env.YOLO_FOOD_DETECTION_API_KEY ?? "").trim();
const YOLO_MIN_CONFIDENCE = Math.max(0, Math.min(toNumber(process.env.YOLO_MIN_CONFIDENCE, 0.2), 1));

app.use(express.json({ limit: "15mb" }));

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

function pickDetectionArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];

  if (Array.isArray(raw.detections)) return raw.detections;
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.results)) return raw.results;
  if (Array.isArray(raw.predictions)) return raw.predictions;

  if (Array.isArray(raw.data?.detections)) return raw.data.detections;
  if (Array.isArray(raw.data?.items)) return raw.data.items;
  if (Array.isArray(raw.data?.results)) return raw.data.results;
  if (Array.isArray(raw.data?.predictions)) return raw.data.predictions;

  return [];
}

function getDetectionLabel(raw) {
  return String(
    raw?.label ??
    raw?.className ??
    raw?.class_name ??
    raw?.class ??
    raw?.name ??
    "",
  ).trim();
}

function bboxAreaFromArray(bbox, format = "") {
  if (!Array.isArray(bbox) || bbox.length < 4) return 0;

  const a = toNumber(bbox[0], 0);
  const b = toNumber(bbox[1], 0);
  const c = toNumber(bbox[2], 0);
  const d = toNumber(bbox[3], 0);
  const normalizedFormat = String(format).trim().toLowerCase();

  if (normalizedFormat.includes("xywh")) {
    return Math.max(0, c) * Math.max(0, d);
  }

  if (normalizedFormat.includes("xyxy")) {
    return Math.max(0, c - a) * Math.max(0, d - b);
  }

  if (c > a && d > b) {
    return Math.max(0, c - a) * Math.max(0, d - b);
  }

  return Math.max(0, c) * Math.max(0, d);
}

function bboxAreaFromObject(bbox) {
  if (!bbox || typeof bbox !== "object") return 0;

  const width = toNumber(bbox.width ?? bbox.w, 0);
  const height = toNumber(bbox.height ?? bbox.h, 0);
  if (width > 0 && height > 0) {
    return width * height;
  }

  const x1 = toNumber(bbox.x1 ?? bbox.left, 0);
  const y1 = toNumber(bbox.y1 ?? bbox.top, 0);
  const x2 = toNumber(bbox.x2 ?? bbox.right, 0);
  const y2 = toNumber(bbox.y2 ?? bbox.bottom, 0);

  if (x2 > x1 && y2 > y1) {
    return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  }

  return 0;
}

function getDetectionArea(raw) {
  const directArea = toNumber(raw?.pixelArea ?? raw?.maskArea ?? raw?.area, 0);
  if (directArea > 0) return directArea;

  const bbox = raw?.bbox ?? raw?.box ?? raw?.boundingBox ?? raw?.bounding_box;
  const bboxFormat = raw?.bboxFormat ?? raw?.boxFormat ?? raw?.bbox_format ?? raw?.box_format;
  if (Array.isArray(bbox)) return bboxAreaFromArray(bbox, bboxFormat);
  return bboxAreaFromObject(bbox);
}

function normalizeDetections(rawPayload) {
  const rawDetections = pickDetectionArray(rawPayload);
  const byLabel = new Map();

  for (const raw of rawDetections) {
    const label = getDetectionLabel(raw);
    const normalizedLabel = normalizeFoodLabel(label);
    if (!normalizedLabel) continue;

    const confidence = toNumber(raw?.confidence ?? raw?.score ?? raw?.probability, 1);
    if (confidence < YOLO_MIN_CONFIDENCE) continue;

    const pixelArea = getDetectionArea(raw);
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
      confidence,
      pixelArea,
    });
  }

  return Array.from(byLabel.values());
}

async function runYoloFoodDetection(input) {
  if (!YOLO_FOOD_DETECTION_URL) {
    const error = new Error("Plate image detection is not configured. Set YOLO_FOOD_DETECTION_URL in nutrition-proxy/.env.");
    error.statusCode = 501;
    throw error;
  }

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (YOLO_FOOD_DETECTION_API_KEY) {
    headers.Authorization = `Bearer ${YOLO_FOOD_DETECTION_API_KEY}`;
  }

  const response = await fetch(YOLO_FOOD_DETECTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
    }),
  });

  if (!response.ok) {
    throw new Error(`YOLO food detection failed (${response.status}).`);
  }

  const payload = await response.json();
  return normalizeDetections(payload);
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

app.post("/api/foods/plate/analyze", async (req, res) => {
  try {
    const imageBase64 = String(req.body?.imageBase64 ?? "").trim();
    const mimeType = String(req.body?.mimeType ?? "image/jpeg").trim() || "image/jpeg";
    const totalWeightGrams = toNumber(req.body?.totalWeightGrams, 0);

    if (!imageBase64) {
      return res.status(400).json({ message: "imageBase64 is required." });
    }

    if (!Number.isFinite(totalWeightGrams) || totalWeightGrams <= 0) {
      return res.status(400).json({ message: "totalWeightGrams must be a positive number." });
    }

    const detections = await runYoloFoodDetection({ imageBase64, mimeType });
    if (detections.length === 0) {
      return res.status(422).json({
        message: "No food items were detected in this image.",
      });
    }

    const resolvedDetections = (
      await Promise.all(
        detections.map(async (detection) => {
          const matchedFood = await resolveNutritionForDetectedLabel(detection.normalizedLabel);
          if (!matchedFood) return null;
          return {
            detection,
            matchedFood,
          };
        }),
      )
    ).filter(Boolean);

    if (resolvedDetections.length === 0) {
      return res.status(422).json({
        message: "No detected items matched food nutrition data.",
      });
    }

    const totalPixelArea = resolvedDetections.reduce((sum, item) => sum + item.detection.pixelArea, 0);
    if (totalPixelArea <= 0) {
      return res.status(422).json({
        message: "Detected food items did not include usable pixel areas.",
      });
    }

    const items = await Promise.all(
      resolvedDetections.map(async ({ detection, matchedFood }) => {
        const areaRatio = detection.pixelArea / totalPixelArea;
        const estimatedWeightGrams = totalWeightGrams * areaRatio;
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
      totalWeightGrams: roundOne(totalWeightGrams),
      totalPixelArea: roundOne(totalPixelArea),
      items,
      totals,
      meta: {
        detector: "yolo",
        minConfidence: YOLO_MIN_CONFIDENCE,
      },
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
mountFormAnalysisRoutes(app);

app.listen(PORT, () => {
  console.log(`Nutrition proxy running on port ${PORT}`);
});

async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down...`);
  if (redisClient && redisReady) {
    try {
      await redisClient.quit();
      console.log("Redis client closed.");
    } catch (error) {

    }
  }
  process.exit(0);
}

process.on("SIGINT", () => {
  gracefulShutdown("SIGINT").catch(() => process.exit(0));
});

process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM").catch(() => process.exit(0));
})
