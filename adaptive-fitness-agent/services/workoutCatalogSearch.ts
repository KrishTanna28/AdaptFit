import {
  getMetDataset,
  type MetDatasetRow,
} from "./workoutMetDataset";

export type WorkoutCatalogItem = {
  id: string;
  name: string;
  categoryId?: number | null;
  category: string;
  description: string;
  muscles: string[];
  equipment: string[];
  aliases: string[];
  metRowId?: string;
  imageUrl?: string;
  source: "WGER" | "MET" | "Saved";
};

type WgerListResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type WgerNamed = {
  id: number;
  name: string;
};

type WgerAlias = {
  alias: string;
};

type WgerTranslation = {
  language: number;
  name: string;
  description?: string;
  aliases?: WgerAlias[];
};

type WgerImage = {
  image: string;
  is_main: boolean;
};

type WgerExerciseInfo = {
  id: number;
  category?: WgerNamed;
  muscles?: WgerNamed[];
  equipment?: WgerNamed[];
  translations?: WgerTranslation[];
  images?: WgerImage[];
};

const WGER_BASE_URL = "https://wger.de/api/v2";
const ENGLISH_LANGUAGE_ID = 2;
const PAGE_SIZE = 100;
const MAX_PAGES = 12;
const CACHE_TTL_MS = 30 * 60 * 1000;

let catalogCache: WorkoutCatalogItem[] | null = null;
let cacheAtMs = 0;
let inFlightLoad: Promise<{ items: WorkoutCatalogItem[]; cacheable: boolean }> | null = null;

function isAlphaNumericCode(code: number) {
  const isLower = code >= 97 && code <= 122;
  const isDigit = code >= 48 && code <= 57;
  return isLower || isDigit;
}

function collapseSpaces(value: string) {
  let out = "";
  let prevSpace = true;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const code = value.charCodeAt(i);
    const isSpace =
      code === 32 || code === 9 || code === 10 || code === 13 || code === 12;

    if (isSpace) {
      if (!prevSpace) {
        out += " ";
      }
      prevSpace = true;
      continue;
    }

    out += ch;
    prevSpace = false;
  }

  return out.trim();
}

function stripHtml(value: string) {
  let out = "";
  let inTag = false;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];

    if (ch === "<") {
      inTag = true;
      continue;
    }

    if (ch === ">") {
      inTag = false;
      out += " ";
      continue;
    }

    if (!inTag) {
      out += ch;
    }
  }

  return collapseSpaces(out);
}

function normalizeForSearch(value: string) {
  const lower = value.toLowerCase();
  let out = "";
  let prevSpace = true;

  for (let i = 0; i < lower.length; i += 1) {
    const code = lower.charCodeAt(i);
    if (isAlphaNumericCode(code)) {
      out += lower[i];
      prevSpace = false;
      continue;
    }

    if (!prevSpace) {
      out += " ";
      prevSpace = true;
    }
  }

  return collapseSpaces(out);
}

function uniqueTokens(tokens: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const token of tokens) {
    if (!token) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }

  return out;
}

function tokenize(value: string) {
  const normalized = normalizeForSearch(value);
  if (!normalized) return [];
  return uniqueTokens(normalized.split(" ").filter((token) => token.length > 1));
}

function cleanMetActivityName(value: string) {
  return collapseSpaces(
    value
      .replace(/\(Taylor Code [^)]+\)/gi, "")
      .replace(/\s+,/g, ",")
      .replace(/,\s+/g, ", "),
  );
}

function isSportRow(row: MetDatasetRow) {
  return normalizeForSearch(row.category) === "sports";
}

function mapMetSport(row: MetDatasetRow): WorkoutCatalogItem | null {
  if (!isSportRow(row)) return null;

  const name = cleanMetActivityName(row.activity);
  if (!name) return null;

  return {
    id: "met-" + row.id,
    name,
    categoryId: null,
    category: row.category || "Sports",
    description: row.activity,
    muscles: [],
    equipment: [],
    aliases: row.aliases,
    metRowId: row.id,
    source: "MET",
  };
}

function pickBestTranslation(translations: WgerTranslation[]) {
  for (const translation of translations) {
    if (translation.language === ENGLISH_LANGUAGE_ID && translation.name?.trim()) {
      return translation;
    }
  }

  for (const translation of translations) {
    if (translation.name?.trim()) {
      return translation;
    }
  }

  return null;
}

function mapExercise(raw: WgerExerciseInfo): WorkoutCatalogItem | null {
  const translations = Array.isArray(raw.translations) ? raw.translations : [];
  const selected = pickBestTranslation(translations);
  if (!selected) return null;

  const aliasesRaw = Array.isArray(selected.aliases) ? selected.aliases : [];
  const aliases = aliasesRaw
    .map((entry) => (typeof entry.alias === "string" ? entry.alias.trim() : ""))
    .filter(Boolean);

  const images = Array.isArray(raw.images) ? raw.images : [];
  const mainImage = images.find((img) => img.is_main && img.image) ?? images.find((img) => img.image);

  return {
    id: "wger-" + String(raw.id),
    name: selected.name.trim(),
    categoryId: typeof raw.category?.id === "number" ? raw.category.id : null,
    category: raw.category?.name?.trim() || "Uncategorized",
    description: stripHtml(selected.description || ""),
    muscles: (Array.isArray(raw.muscles) ? raw.muscles : [])
      .map((muscle) => muscle.name?.trim() || "")
      .filter(Boolean),
    equipment: (Array.isArray(raw.equipment) ? raw.equipment : [])
      .map((eq) => eq.name?.trim() || "")
      .filter(Boolean),
    aliases,
    imageUrl: mainImage?.image,
    source: "WGER",
  };
}

async function fetchPage(offset: number) {
  const url =
    WGER_BASE_URL +
    "/exerciseinfo/?language=" +
    String(ENGLISH_LANGUAGE_ID) +
    "&limit=" +
    String(PAGE_SIZE) +
    "&offset=" +
    String(offset);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Workout catalog fetch failed with status " + String(response.status));
  }

  const data = (await response.json()) as Partial<WgerListResponse<WgerExerciseInfo>>;
  return {
    count: typeof data.count === "number" ? data.count : 0,
    next: typeof data.next === "string" ? data.next : null,
    previous: typeof data.previous === "string" ? data.previous : null,
    results: Array.isArray(data.results) ? data.results : [],
  };
}

async function loadCatalogFromWger() {
  const map = new Map<string, WorkoutCatalogItem>();
  let offset = 0;
  let page = 0;
  let hasNext = true;

  while (hasNext && page < MAX_PAGES) {
    const payload = await fetchPage(offset);

    for (const row of payload.results) {
      const mapped = mapExercise(row);
      if (!mapped) continue;
      map.set(mapped.id, mapped);
    }

    hasNext = Boolean(payload.next);
    offset += PAGE_SIZE;
    page += 1;
  }

  return Array.from(map.values());
}

async function loadSportsCatalogFromMetDataset() {
  const dataset = await getMetDataset(false);
  return dataset.rows
    .map(mapMetSport)
    .filter((item): item is WorkoutCatalogItem => item !== null);
}

function mergeCatalogItems(items: WorkoutCatalogItem[]) {
  const map = new Map<string, WorkoutCatalogItem>();

  for (const item of items) {
    const key = item.source + ":" + item.id;
    if (map.has(key)) continue;
    map.set(key, item);
  }

  return Array.from(map.values());
}

async function loadCatalogFromSources() {
  const sportsItems = await loadSportsCatalogFromMetDataset();

  try {
    const wgerItems = await loadCatalogFromWger();
    return {
      items: mergeCatalogItems([...wgerItems, ...sportsItems]),
      cacheable: true,
    };
  } catch (error) {
    if (sportsItems.length > 0) {
      return {
        items: sportsItems,
        cacheable: false,
      };
    }

    throw error;
  }
}

async function getCatalog(forceRefresh = false) {
  const now = Date.now();
  const hasValidCache =
    !forceRefresh &&
    Array.isArray(catalogCache) &&
    now - cacheAtMs < CACHE_TTL_MS;

  if (hasValidCache && catalogCache) {
    return catalogCache;
  }

  if (inFlightLoad) {
    const loaded = await inFlightLoad;
    return loaded.items;
  }

  inFlightLoad = loadCatalogFromSources()
    .then((loaded) => {
      if (loaded.cacheable) {
        catalogCache = loaded.items;
        cacheAtMs = Date.now();
      }
      return loaded;
    })
    .finally(() => {
      inFlightLoad = null;
    });

  const loaded = await inFlightLoad;
  return loaded.items;
}

function scoreItem(item: WorkoutCatalogItem, queryNorm: string, queryTokens: string[]) {
  const nameNorm = normalizeForSearch(item.name);
  const textNorm = normalizeForSearch(
    item.name +
      " " +
      item.category +
      " " +
      item.description +
      " " +
      item.muscles.join(" ") +
      " " +
      item.equipment.join(" ") +
      " " +
      item.aliases.join(" "),
  );

  let score = 0;

  if (nameNorm === queryNorm) score += 100;
  if (nameNorm.startsWith(queryNorm)) score += 60;
  if (textNorm.indexOf(queryNorm) >= 0) score += 40;

  if (queryTokens.length > 0) {
    let matched = 0;
    for (const token of queryTokens) {
      if (textNorm.indexOf(token) >= 0) {
        matched += 1;
      }
    }

    if (matched === queryTokens.length) score += 35;
    score += (matched / queryTokens.length) * 25;
  }

  return score;
}

export async function searchWorkoutCatalog(input: { query: string; pageSize?: number }) {
  const query = input.query.trim();
  const pageSize = Math.max(1, Math.min(input.pageSize ?? 20, 50));

  if (query.length < 2) {
    return [] as WorkoutCatalogItem[];
  }

  const catalog = await getCatalog(false);
  const queryNorm = normalizeForSearch(query);
  const queryTokens = tokenize(query);

  const scored = catalog
    .map((item) => ({
      item,
      score: scoreItem(item, queryNorm, queryTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, pageSize).map((entry) => entry.item);
}
