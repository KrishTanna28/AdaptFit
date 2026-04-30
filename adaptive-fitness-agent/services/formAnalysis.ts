import { auth } from "./firebase";
import type { PoseMetricSummary } from "./poseMetrics";

export type FormAnalysisResponse = {
  exerciseName: string;
  repsDetected: number;
  insights: string[];
  model?: string;
  usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  } | null;
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
    throw new Error("Form analysis API URL is not configured.");
  }

  return API_BASE_URL;
}

async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You need to be signed in to analyze workout form.");
  }

  return user.getIdToken();
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function parseApiError(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) {
    return new Error(`Form analysis failed (${String(response.status)}).`);
  }

  try {
    const payload = JSON.parse(raw) as { message?: unknown; detail?: unknown };
    return new Error(safeTrim(payload.detail) || safeTrim(payload.message) || raw);
  } catch {
    return new Error(raw);
  }
}

export async function analyzeWorkoutForm(input: {
  exerciseName: string;
  summary: PoseMetricSummary;
}): Promise<FormAnalysisResponse> {
  const baseUrl = requireBaseUrl();
  const idToken = await getAuthToken();

  const response = await fetch(`${baseUrl}/api/form-analysis/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      exerciseName: safeTrim(input.exerciseName),
      summary: input.summary,
    }),
  }).catch(() => {
    throw new Error(
      `Unable to reach Form Analysis API at ${baseUrl}. Make sure nutrition-proxy is running and the configured API URL is correct.`,
    );
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as FormAnalysisResponse;
}
