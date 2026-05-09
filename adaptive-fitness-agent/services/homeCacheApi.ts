import { auth } from "./firebase";
import type { DailyLifestyleLog } from "./lifestyleLog";
import type { StepHistoryPoint } from "./stepHistory";
import type { LoggedWorkoutEntry } from "./workoutLog";

export type CachedHomeSummary = {
  generatedAt: string;
  dateKey: string;
  caloriesIntake: number;
  workoutCaloriesBurned: number;
  workoutEntries: LoggedWorkoutEntry[];
  lifestyleLog: DailyLifestyleLog;
  profileWeightKg: number | null;
  stepGoalStreak?: number;
  workoutStreak: number;
  stepHistory: StepHistoryPoint[];
  cacheSource?: string;
};

type StepHistoryRange = "days" | "weeks" | "months" | "years";

type CachedStepHistoryResponse = {
  range: StepHistoryRange;
  offset: number;
  count: number;
  dailyGoal: number;
  points: StepHistoryPoint[];
  generatedAt: string;
  cacheSource?: string;
};

const NUTRITION_API_BASE_URL = String(process.env.EXPO_PUBLIC_NUTRITION_API_BASE_URL ?? "")
  .trim()
  .replace(/\/$/, "");

const COACH_API_BASE_URL = String(process.env.EXPO_PUBLIC_COACH_API_BASE_URL ?? "")
  .trim()
  .replace(/\/$/, "");

const API_BASE_URL = COACH_API_BASE_URL || NUTRITION_API_BASE_URL;

function requireBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error("Home cache API URL is not configured.");
  }

  return API_BASE_URL;
}

async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You need to be signed in.");
  }

  return user.getIdToken();
}

async function parseApiError(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) {
    return new Error(`Home cache request failed (${String(response.status)}).`);
  }

  try {
    const payload = JSON.parse(raw) as { message?: unknown; detail?: unknown };
    const message = String(payload.detail || payload.message || "").trim();
    return new Error(message || `Home cache request failed (${String(response.status)}).`);
  } catch {
    return new Error(raw.trim() || `Home cache request failed (${String(response.status)}).`);
  }
}

function hydratePoint(point: StepHistoryPoint): StepHistoryPoint {
  return {
    ...point,
    start: new Date(point.start),
    end: new Date(point.end),
  };
}

async function fetchHomeApi(path: string) {
  const baseUrl = requireBaseUrl();
  const idToken = await getAuthToken();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${idToken}`,
      },
    });
  } catch {
    throw new Error(`Unable to reach Home cache API at ${baseUrl}.`);
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return response.json() as Promise<unknown>;
}

export async function getCachedHomeSummary(input: {
  dailyGoal: number;
  forceRefresh?: boolean;
}): Promise<CachedHomeSummary> {
  const params = new URLSearchParams();
  params.set("dailyGoal", String(Math.max(0, Math.round(input.dailyGoal))));
  if (input.forceRefresh) {
    params.set("forceRefresh", "true");
  }

  const payload = (await fetchHomeApi(`/api/home/summary?${params.toString()}`)) as CachedHomeSummary;
  return {
    ...payload,
    stepHistory: Array.isArray(payload.stepHistory)
      ? payload.stepHistory.map(hydratePoint)
      : [],
  };
}

export async function getCachedStepHistory(input: {
  range: StepHistoryRange;
  offset: number;
  count: number;
  dailyGoal: number;
}): Promise<CachedStepHistoryResponse> {
  const params = new URLSearchParams();
  params.set("range", input.range);
  params.set("offset", String(Math.max(0, Math.round(input.offset))));
  params.set("count", String(Math.max(1, Math.round(input.count))));
  params.set("dailyGoal", String(Math.max(0, Math.round(input.dailyGoal))));

  const payload = (await fetchHomeApi(`/api/home/steps-history?${params.toString()}`)) as CachedStepHistoryResponse;
  return {
    ...payload,
    points: Array.isArray(payload.points) ? payload.points.map(hydratePoint) : [],
  };
}
