export type MealType = "breakfast" | "lunch" | "dinner" | "snacks";
export type FoodSource = "USDA" | "OpenFoodFacts" | "Manual";
import { toNumber } from "./helperFunctions";


type NutrientBasis = "100g" | "100ml";

export type FoodCatalogItem = {
  id: string;
  name: string;
  brand?: string;
  source: FoodSource;
  nutrientBasis: NutrientBasis;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  sodiumMgPer100g: number;
  potassiumMgPer100g: number;
  calciumMgPer100g: number;
  ironMgPer100g: number;
  vitaminCMgPer100g: number;
  servingSizeGrams?: number;
  servingSizeMl?: number;
  servingText?: string;
  imageUrl?: string;
};

type FoodSearchRequest = {
  query: string;
  pageSize?: number;
};

type ProxySearchResponse = {
  items: FoodCatalogItem[];
};

export type PlateFoodAnalysisItem = {
  label: string;
  displayName: string;
  confidence: number;
  pixelArea: number;
  areaRatio: number;
  estimatedWeightGrams: number;
  matchedFood: FoodCatalogItem | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodiumMg: number;
  potassiumMg: number;
  calciumMg: number;
  ironMg: number;
  vitaminCMg: number;
};

export type PlateFoodAnalysisResult = {
  totalWeightGrams: number;
  totalPixelArea: number;
  items: PlateFoodAnalysisItem[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sodiumMg: number;
    potassiumMg: number;
    calciumMg: number;
    ironMg: number;
    vitaminCMg: number;
  };
};

type PlateFoodAnalysisRequest = {
  imageBase64: string;
  mimeType?: string;
  totalWeightGrams: number;
};

type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  nutrition_data_per?: string;
  quantity?: string;
  image_front_small_url?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    "energy-kcal_100ml"?: number;
    proteins_100g?: number;
    proteins_100ml?: number;
    carbohydrates_100g?: number;
    carbohydrates_100ml?: number;
    fat_100g?: number;
    fat_100ml?: number;
    fiber_100g?: number;
    fiber_100ml?: number;
    sodium_100g?: number;
    sodium_100ml?: number;
    potassium_100g?: number;
    potassium_100ml?: number;
    calcium_100g?: number;
    calcium_100ml?: number;
    iron_100g?: number;
    iron_100ml?: number;
    "vitamin-c_100g"?: number;
    "vitamin-c_100ml"?: number;
    sodium_unit?: string;
    potassium_unit?: string;
    calcium_unit?: string;
    iron_unit?: string;
    "vitamin-c_unit"?: string;
  };
};

function parseServingSizeInMl(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(ml|milliliter|millilitre|l|liter|litre)\b/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = match[2].toLowerCase();
  return unit === "l" || unit === "liter" || unit === "litre" ? amount * 1000 : amount;
}

function parseServingQuantityToMl(
  quantity?: number | string,
  unit?: string,
): number | undefined {
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

function normalizeOffNutritionDataPer(
  value?: string,
): NutrientBasis | "serving" | undefined {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized) return undefined;
  if (normalized === "serving") return "serving";
  if (normalized === "100ml") return "100ml";
  if (normalized === "100g") return "100g";
  return undefined;
}

const NUTRITION_API_BASE_URL = (process.env.EXPO_PUBLIC_NUTRITION_API_BASE_URL ?? "")
  .trim()
  .replace(/\/$/, "");


function parseServingSizeInGrams(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/(\d+(?:\.\d+)?)\s*g/i);
  if (!match) {
    return undefined;
  }

  const grams = Number(match[1]);
  if (!Number.isFinite(grams) || grams <= 0) {
    return undefined;
  }

  return grams;
}

function toMilligrams(value: unknown, unit: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }

  const normalizedUnit = String(unit ?? "").trim().toLowerCase();
  if (normalizedUnit === "g") return n * 1000;
  if (normalizedUnit === "mg" || normalizedUnit === "") return n;
  if (normalizedUnit === "ug" || normalizedUnit === "µg") return n / 1000;
  return n;
}

function parseServingQuantityToGrams(
  quantity?: number | string,
  unit?: string,
): number | undefined {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) {
    return undefined;
  }

  const normalizedUnit = String(unit ?? "").trim().toLowerCase();
  if (normalizedUnit === "g" || normalizedUnit === "gram" || normalizedUnit === "grams") {
    return q;
  }

  if (normalizedUnit === "oz" || normalizedUnit === "ounce" || normalizedUnit === "ounces") {
    return q * 28.3495;
  }

  return undefined;
}

function sanitizeItem(raw: FoodCatalogItem): FoodCatalogItem {
  return {
    id: String(raw.id),
    name: String(raw.name),
    brand: raw.brand ? String(raw.brand) : undefined,
    source: raw.source,
    caloriesPer100g: toNumber(raw.caloriesPer100g, 0),
    proteinPer100g: toNumber(raw.proteinPer100g, 0),
    carbsPer100g: toNumber(raw.carbsPer100g, 0),
    fatPer100g: toNumber(raw.fatPer100g, 0),
    fiberPer100g: toNumber(raw.fiberPer100g, 0),
    sodiumMgPer100g: toNumber(raw.sodiumMgPer100g, 0),
    potassiumMgPer100g: toNumber(raw.potassiumMgPer100g, 0),
    calciumMgPer100g: toNumber(raw.calciumMgPer100g, 0),
    ironMgPer100g: toNumber(raw.ironMgPer100g, 0),
    vitaminCMgPer100g: toNumber(raw.vitaminCMgPer100g, 0),
    servingSizeGrams: raw.servingSizeGrams ? toNumber(raw.servingSizeGrams, 0) : undefined,
    servingText: raw.servingText ? String(raw.servingText) : undefined,
    imageUrl: raw.imageUrl ? String(raw.imageUrl) : undefined,
    nutrientBasis: raw.nutrientBasis === "100ml" ? "100ml" : "100g",
    servingSizeMl: raw.servingSizeMl ? toNumber(raw.servingSizeMl, 0) : undefined,
  };
}

function sanitizeNullableFoodItem(raw: unknown): FoodCatalogItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return sanitizeItem(raw as FoodCatalogItem);
}

function sanitizePlateAnalysisItem(raw: Partial<PlateFoodAnalysisItem>): PlateFoodAnalysisItem {
  return {
    label: String(raw.label ?? ""),
    displayName: String(raw.displayName ?? raw.label ?? ""),
    confidence: toNumber(raw.confidence, 0),
    pixelArea: toNumber(raw.pixelArea, 0),
    areaRatio: toNumber(raw.areaRatio, 0),
    estimatedWeightGrams: toNumber(raw.estimatedWeightGrams, 0),
    matchedFood: sanitizeNullableFoodItem(raw.matchedFood),
    calories: toNumber(raw.calories, 0),
    protein: toNumber(raw.protein, 0),
    carbs: toNumber(raw.carbs, 0),
    fat: toNumber(raw.fat, 0),
    fiber: toNumber(raw.fiber, 0),
    sodiumMg: toNumber(raw.sodiumMg, 0),
    potassiumMg: toNumber(raw.potassiumMg, 0),
    calciumMg: toNumber(raw.calciumMg, 0),
    ironMg: toNumber(raw.ironMg, 0),
    vitaminCMg: toNumber(raw.vitaminCMg, 0),
  };
}

function sanitizePlateAnalysisResult(raw: Partial<PlateFoodAnalysisResult>): PlateFoodAnalysisResult {
  const rawTotals = (raw.totals ?? {}) as Partial<PlateFoodAnalysisResult["totals"]>;

  return {
    totalWeightGrams: toNumber(raw.totalWeightGrams, 0),
    totalPixelArea: toNumber(raw.totalPixelArea, 0),
    items: Array.isArray(raw.items)
      ? raw.items.map((item) => sanitizePlateAnalysisItem(item))
      : [],
    totals: {
      calories: toNumber(rawTotals.calories, 0),
      protein: toNumber(rawTotals.protein, 0),
      carbs: toNumber(rawTotals.carbs, 0),
      fat: toNumber(rawTotals.fat, 0),
      fiber: toNumber(rawTotals.fiber, 0),
      sodiumMg: toNumber(rawTotals.sodiumMg, 0),
      potassiumMg: toNumber(rawTotals.potassiumMg, 0),
      calciumMg: toNumber(rawTotals.calciumMg, 0),
      ironMg: toNumber(rawTotals.ironMg, 0),
      vitaminCMg: toNumber(rawTotals.vitaminCMg, 0),
    },
  };
}

async function searchViaNodeProxy(query: string, pageSize: number): Promise<FoodCatalogItem[]> {
  if (!NUTRITION_API_BASE_URL) {
    return [];
  }

  const url =
    `${NUTRITION_API_BASE_URL}/api/foods/search` +
    `?q=${encodeURIComponent(query)}` +
    `&pageSize=${encodeURIComponent(String(pageSize))}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Nutrition proxy search failed (${response.status}).`);
  }

  const data = (await response.json()) as ProxySearchResponse;
  const items = Array.isArray(data.items) ? data.items : [];

  return items.map(sanitizeItem);
}

async function searchOpenFoodFactsDirect(query: string, pageSize: number): Promise<FoodCatalogItem[]> {
  const url =
    "https://world.openfoodfacts.org/cgi/search.pl" +
    `?search_terms=${encodeURIComponent(query)}` +
    "&search_simple=1&action=process&json=1" +
    `&page_size=${encodeURIComponent(String(pageSize))}` +
    "&fields=code,product_name,brands,serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,quantity,nutriments,image_front_small_url";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Open Food Facts search failed (${response.status}).`);
  }

  const json = (await response.json()) as { products?: OpenFoodFactsProduct[] };
  const products = Array.isArray(json.products) ? json.products : [];

  return products
    .map<FoodCatalogItem | null>((product) => {
      const name = (product.product_name ?? "").trim();
      if (!name) {
        return null;
      }

      const nutriments = product.nutriments ?? {};
      const code = (product.code ?? "").trim();
      const servingFromText = parseServingSizeInGrams(product.serving_size);
      const servingFromQuantity = parseServingQuantityToGrams(
        product.serving_quantity,
        product.serving_quantity_unit,
      );
      const servingSizeGrams = servingFromText ?? servingFromQuantity;

      const servingMlFromText = parseServingSizeInMl(product.serving_size);
      const servingMlFromQuantity = parseServingQuantityToMl(
        product.serving_quantity,
        product.serving_quantity_unit,
      );
      const servingSizeMl = servingMlFromText ?? servingMlFromQuantity;

      const servingText =
        (product.serving_size ?? "").trim() ||
        (product.serving_quantity && product.serving_quantity_unit
          ? `${product.serving_quantity} ${product.serving_quantity_unit}`
          : "") ||
        (product.quantity ?? "").trim() ||
        undefined;

      const hasPer100ml =
        Number.isFinite(Number(nutriments["energy-kcal_100ml"])) ||
        Number.isFinite(Number(nutriments.proteins_100ml)) ||
        Number.isFinite(Number(nutriments.carbohydrates_100ml)) ||
        Number.isFinite(Number(nutriments.fat_100ml)) ||
        Number.isFinite(Number(nutriments.fiber_100ml)) ||
        Number.isFinite(Number(nutriments.sodium_100ml)) ||
        Number.isFinite(Number(nutriments.potassium_100ml)) ||
        Number.isFinite(Number(nutriments.calcium_100ml)) ||
        Number.isFinite(Number(nutriments.iron_100ml)) ||
        Number.isFinite(Number(nutriments["vitamin-c_100ml"]));

      const nutritionDataPer = normalizeOffNutritionDataPer(product.nutrition_data_per);

      let basisFromDataPer: NutrientBasis | undefined;
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

      const basis: NutrientBasis =
        basisFromDataPer ??
        (hasPer100ml ? "100ml" : servingSizeMl && !servingSizeGrams ? "100ml" : "100g");

      return {
        id: code ? "off-" + code : "off-" + name.toLowerCase().replace(/\s+/g, "-"),
        name,
        brand: product.brands ? String(product.brands) : undefined,
        source: "OpenFoodFacts",
        nutrientBasis: basis,
        caloriesPer100g: basis === "100ml"
          ? toNumber(nutriments["energy-kcal_100ml"], toNumber(nutriments["energy-kcal_100g"], 0))
          : toNumber(nutriments["energy-kcal_100g"], 0),
        proteinPer100g: basis === "100ml"
          ? toNumber(nutriments.proteins_100ml, toNumber(nutriments.proteins_100g, 0))
          : toNumber(nutriments.proteins_100g, 0),
        carbsPer100g: basis === "100ml"
          ? toNumber(nutriments.carbohydrates_100ml, toNumber(nutriments.carbohydrates_100g, 0))
          : toNumber(nutriments.carbohydrates_100g, 0),
        fatPer100g: basis === "100ml"
          ? toNumber(nutriments.fat_100ml, toNumber(nutriments.fat_100g, 0))
          : toNumber(nutriments.fat_100g, 0),
        fiberPer100g: basis === "100ml"
          ? toNumber(nutriments.fiber_100ml, toNumber(nutriments.fiber_100g, 0))
          : toNumber(nutriments.fiber_100g, 0),
        sodiumMgPer100g: basis === "100ml"
          ? toMilligrams(
            nutriments.sodium_100ml,
            nutriments.sodium_unit ?? "g",
            toMilligrams(nutriments.sodium_100g, nutriments.sodium_unit ?? "g", 0),
          )
          : toMilligrams(nutriments.sodium_100g, nutriments.sodium_unit ?? "g", 0),
        potassiumMgPer100g: basis === "100ml"
          ? toMilligrams(
            nutriments.potassium_100ml,
            nutriments.potassium_unit ?? "mg",
            toMilligrams(nutriments.potassium_100g, nutriments.potassium_unit ?? "mg", 0),
          )
          : toMilligrams(nutriments.potassium_100g, nutriments.potassium_unit ?? "mg", 0),
        calciumMgPer100g: basis === "100ml"
          ? toMilligrams(
            nutriments.calcium_100ml,
            nutriments.calcium_unit ?? "mg",
            toMilligrams(nutriments.calcium_100g, nutriments.calcium_unit ?? "mg", 0),
          )
          : toMilligrams(nutriments.calcium_100g, nutriments.calcium_unit ?? "mg", 0),
        ironMgPer100g: basis === "100ml"
          ? toMilligrams(
            nutriments.iron_100ml,
            nutriments.iron_unit ?? "mg",
            toMilligrams(nutriments.iron_100g, nutriments.iron_unit ?? "mg", 0),
          )
          : toMilligrams(nutriments.iron_100g, nutriments.iron_unit ?? "mg", 0),
        vitaminCMgPer100g: basis === "100ml"
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
    .filter((item): item is FoodCatalogItem => item !== null);
}

export async function searchFoodCatalog(input: FoodSearchRequest): Promise<FoodCatalogItem[]> {
  const query = input.query.trim();
  const pageSize = Math.max(5, Math.min(input.pageSize ?? 12, 20));

  if (query.length < 2) {
    return [];
  }

  try {
    const proxyItems = await searchViaNodeProxy(query, pageSize);
    if (proxyItems.length > 0) {
      return proxyItems;
    }
  } catch {
    // Fallback to direct Open Food Facts when proxy is down or not configured.
  }

  return searchOpenFoodFactsDirect(query, pageSize);
}

export async function analyzePlateFoodImage(
  input: PlateFoodAnalysisRequest,
): Promise<PlateFoodAnalysisResult> {
  if (!NUTRITION_API_BASE_URL) {
    throw new Error("Nutrition proxy URL is not configured.");
  }

  const response = await fetch(`${NUTRITION_API_BASE_URL}/api/foods/plate/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: input.imageBase64,
      mimeType: input.mimeType ?? "image/jpeg",
      totalWeightGrams: input.totalWeightGrams,
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const data = (await response.json()) as { message?: string; detail?: string };
      detail = data.detail || data.message || "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `Plate analysis failed (${response.status}).`);
  }

  const data = (await response.json()) as Partial<PlateFoodAnalysisResult>;
  return sanitizePlateAnalysisResult(data);
}
