import { auth } from "./firebase";

export type CoachMessageRole = "user" | "assistant";

export type CoachWorkoutExercise = {
  name: string;
  sets: number;
  reps: number;
};

export type CoachWorkoutPlan = {
  title: string;
  exercises: CoachWorkoutExercise[];
};

export type CoachChatMessage = {
  id: string;
  role: CoachMessageRole;
  content: string;
  createdAt: string;
  workoutPlan?: CoachWorkoutPlan;
};

type CoachChatResponse = {
  conversationId: string;
  reply: string;
  workoutPlan?: CoachWorkoutPlan;
  model?: string;
  usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  } | null;
  contextSignals?: string[];
  contextWindow?: {
    includeAllHistory?: boolean;
    requestedDays?: number;
    averagingDays?: number;
    nutritionDays?: number;
    workoutDays?: number;
    fromDateKey?: string | null;
    toDateKey?: string | null;
  };
  attachmentsUsed?: number;
};

export type CoachInputAttachment = {
  name: string;
  mimeType?: string;
  content: string;
};

type CoachTranscriptionResponse = {
  text: string;
  model?: string;
  usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  } | null;
};

type CoachMessagesResponse = {
  conversationId: string;
  messages: CoachChatMessage[];
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
    throw new Error("Coach API URL is not configured.");
  }

  return API_BASE_URL;
}

async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You need to be signed in to use the AI coach.");
  }

  return user.getIdToken();
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildApiUnreachableMessage(baseUrl: string) {
  return [
    `Unable to reach Coach API at ${baseUrl}.`,
    "Make sure nutrition-proxy is running and the EXPO_PUBLIC_COACH_API_BASE_URL IP matches your current machine LAN IP.",
  ].join(" ");
}

async function fetchCoachApi(input: {
  baseUrl: string;
  path: string;
  method: "GET" | "POST";
  idToken: string;
  body?: unknown;
}): Promise<Response> {
  const { baseUrl, path, method, idToken, body } = input;

  try {
    return await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(buildApiUnreachableMessage(baseUrl));
  }
}

async function parseApiError(response: Response) {
  const raw = await response.text().catch(() => "");
  let detail = "";
  let message = "";

  if (raw) {
    try {
      const payload = JSON.parse(raw) as { message?: unknown; detail?: unknown };
      detail = safeTrim(payload.detail);
      message = safeTrim(payload.message);
    } catch {
      message = safeTrim(raw);
    }
  }

  const fallback = `Coach request failed (${String(response.status)}).`;
  const composed = detail || message || fallback;
  const providerAccessDeniedPattern =
    /denied access|permission[_\s-]?denied|contact support|api key not valid|insufficient permissions|forbidden|status:\s*403|api has not been used|disabled/i;
  const providerAuthPattern =
    /unable to authenticate your request|vertex-sdk-api-key-not-supported|no credentials|could not refresh access token/i;

  if (providerAccessDeniedPattern.test(composed)) {
    return new Error(
      "AI provider access is denied for this project. Verify Vertex IAM permissions and billing for the configured service account.",
    );
  }

  if (providerAuthPattern.test(composed)) {
    return new Error(
      "AI provider authentication failed. For Vertex SDK, configure VERTEX_PROJECT_ID, VERTEX_CLIENT_EMAIL, and VERTEX_PRIVATE_KEY in nutrition-proxy/.env (or FIREBASE_* as fallback), or set GOOGLE_APPLICATION_CREDENTIALS.",
    );
  }

  if (response.status === 401) {
    return new Error(
      `${composed} Please sign in again so the app can send a valid auth token.`,
    );
  }

  if (response.status === 429) {
    return new Error(`${composed} Vertex quota/rate limit was reached. Check billing and usage.`);
  }

  return new Error(composed);
}

export async function sendCoachMessage(input: {
  message: string;
  conversationId?: string;
  contextWindowDays?: number;
  includeAllHistory?: boolean;
  attachments?: CoachInputAttachment[];
}): Promise<CoachChatResponse> {
  const baseUrl = requireBaseUrl();
  const idToken = await getAuthToken();

  const response = await fetchCoachApi({
    baseUrl,
    path: "/api/coach/chat",
    method: "POST",
    idToken,
    body: {
      message: safeTrim(input.message),
      conversationId: safeTrim(input.conversationId) || undefined,
      contextWindowDays: input.contextWindowDays,
      includeAllHistory: input.includeAllHistory ?? true,
      attachments: Array.isArray(input.attachments)
        ? input.attachments
            .map((attachment) => ({
              name: safeTrim(attachment.name),
              mimeType: safeTrim(attachment.mimeType) || "text/plain",
              content: safeTrim(attachment.content),
            }))
            .filter((attachment) => attachment.name && attachment.content)
        : [],
    },
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as CoachChatResponse;
}

export async function getCoachConversationMessages(input: {
  conversationId: string;
  limit?: number;
}): Promise<CoachMessagesResponse> {
  const baseUrl = requireBaseUrl();
  const idToken = await getAuthToken();
  const conversationId = safeTrim(input.conversationId);

  if (!conversationId) {
    throw new Error("conversationId is required.");
  }

  const params = new URLSearchParams();
  if (typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0) {
    params.set("limit", String(Math.floor(input.limit)));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";

  const response = await fetchCoachApi({
    baseUrl,
    path: `/api/coach/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`,
    method: "GET",
    idToken,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as CoachMessagesResponse;
}

export async function transcribeCoachAudio(input: {
  audioBase64: string;
  mimeType?: string;
}): Promise<CoachTranscriptionResponse> {
  const baseUrl = requireBaseUrl();
  const idToken = await getAuthToken();

  const response = await fetchCoachApi({
    baseUrl,
    path: "/api/coach/transcribe",
    method: "POST",
    idToken,
    body: {
      audioBase64: safeTrim(input.audioBase64),
      mimeType: safeTrim(input.mimeType) || "audio/mp4",
    },
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as CoachTranscriptionResponse;
}
