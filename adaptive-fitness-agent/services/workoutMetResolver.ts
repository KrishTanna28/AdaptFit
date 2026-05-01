import type { WorkoutCatalogItem } from "./workoutCatalogSearch";
import {
  getMetDataset,
  pickMetForIntensity,
  type MetDatasetRow,
  type MetIntensity,
} from "./workoutMetDataset";

export type MetCandidate = {
  rowId: string;
  activity: string;
  metValue: number;
  score: number;
};

export type MetResolutionResult = {
  datasetVersion: string;
  resolverVersion: string;
  intensity: MetIntensity;
  shouldConfirm: boolean;
  best: MetCandidate | null;
  candidates: MetCandidate[];
};

const RESOLVER_VERSION = "resolver-v2-acsm-dynamic";
const AUTO_ACCEPT_SCORE = 0.8;

function normalizeText(input: string): string {
  const lower = input.toLowerCase();
  let out = "";
  let prevSpace = true;

  for (let i = 0; i < lower.length; i += 1) {
    const code = lower.charCodeAt(i);
    const isLetter = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;

    if (isLetter || isDigit) {
      out += lower[i];
      prevSpace = false;
      continue;
    }

    if (!prevSpace) {
      out += " ";
      prevSpace = true;
    }
  }

  return out.trim();
}

function uniqueTokens(tokens: string[]): string[] {
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

function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  if (!normalized) return [];
  return uniqueTokens(normalized.split(" ").filter((t) => t.length > 1));
}

function overlap(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;

  const rightSet = new Set(right);
  let hits = 0;

  for (const token of left) {
    if (rightSet.has(token)) hits += 1;
  }

  return hits / left.length;
}

function buildWorkoutTokens(workout: WorkoutCatalogItem) {
  const nameTokens = tokenize(workout.name);
  const contextTokens = tokenize(
    workout.category +
      " " +
      workout.description +
      " " +
      workout.muscles.join(" ") +
      " " +
      workout.equipment.join(" ") +
      " " +
      workout.aliases.join(" "),
  );

  return { nameTokens, contextTokens };
}

function buildRowTokens(row: MetDatasetRow) {
  const labelTokens = tokenize(row.activity + " " + row.aliases.join(" "));
  const contextTokens = tokenize(row.category + " " + row.tags.join(" "));
  return { labelTokens, contextTokens };
}

function scoreRow(workout: WorkoutCatalogItem, row: MetDatasetRow, intensity: MetIntensity) {
  if (workout.metRowId && workout.metRowId === row.id) {
    return 1;
  }

  const workoutTokens = buildWorkoutTokens(workout);
  const rowTokens = buildRowTokens(row);

  const nameScore = overlap(workoutTokens.nameTokens, rowTokens.labelTokens);
  const contextScore = overlap(workoutTokens.contextTokens, rowTokens.contextTokens);

  let score = nameScore * 0.72 + contextScore * 0.28;

  if (row.intensityHint) {
    if (row.intensityHint === intensity) {
      score += 0.07;
    } else {
      score -= 0.03;
    }
  }

  if (score < 0) score = 0;
  if (score > 1) score = 1;
  return score;
}

export async function resolveWorkoutMetMapping(input: {
  workout: WorkoutCatalogItem;
  intensity?: MetIntensity;
  topN?: number;
}): Promise<MetResolutionResult> {
  const intensity = input.intensity ?? "moderate";
  const topN = Math.max(1, Math.min(input.topN ?? 5, 10));
  const dataset = await getMetDataset(false);

  const candidates = dataset.rows
    .map((row) => {
      const metValue = pickMetForIntensity(row, intensity);
      if (metValue === null) {
        return null;
      }

      return {
        rowId: row.id,
        activity: row.activity,
        metValue,
        score: scoreRow(input.workout, row, intensity),
      } as MetCandidate;
    })
    .filter((c): c is MetCandidate => c !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  const best = candidates.length > 0 ? candidates[0] : null;

  return {
    datasetVersion: dataset.version,
    resolverVersion: RESOLVER_VERSION,
    intensity,
    shouldConfirm: best ? best.score < AUTO_ACCEPT_SCORE : true,
    best,
    candidates,
  };
}
