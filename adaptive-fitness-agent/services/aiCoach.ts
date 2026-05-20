import { auth } from "./firebase";
import { fetchEventSource } from "@microsoft/fetch-event-source";

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

export type CoachMealType = "breakfast" | "lunch" | "dinner" | "snacks";

export type CoachMealPlanMeal = {
  mealType: CoachMealType;
  name: string;
  items: string[];
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

export type CoachMealPlan = {
  title: string;
  meals: CoachMealPlanMeal[];
};

export type CoachChatMessage = {
  id: string;
  role: CoachMessageRole;
  content: string;
  createdAt: string;
  workoutPlan?: CoachWorkoutPlan;
  mealPlan?: CoachMealPlan;
};

export type CoachConversationSummary = {
  id: string;
  title: string;
  lastMessagePreview: string;
  lastMessageRole: CoachMessageRole;
  messageCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
};

export type CoachChatResponse = {
  conversationId: string;
  reply: string;
  workoutPlan?: CoachWorkoutPlan;
  mealPlan?: CoachMealPlan;
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

export type HomeCoachInsight = {
  title: string;
  summary: string;
  focus: string;
  actions: string[];
};

type HomeInsightsResponse = {
  insight: HomeCoachInsight;
  model?: string;
  usage?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  } | null;
  contextSignals?: string[];
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

type CoachConversationsResponse = {
  conversations: CoachConversationSummary[];
};

type DeleteCoachConversationResponse = {
  conversationId: string;
  deleted: boolean;
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
    throw new Error("You need to be signed in to use Aether.");
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
  method: "DELETE" | "GET" | "POST";
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
    /unable to authenticate your request|no credentials|could not refresh access token|genai-api-key-missing|genai-project-id-missing|gemini-api-key-missing|vertex-project-id-missing|vertex-credentials-missing|api key missing|api key not set/i;

  if (providerAccessDeniedPattern.test(composed)) {
    return new Error(
      "AI provider access is denied for this project. Verify Gemini API access or Gemini Enterprise Agent Platform IAM permissions and billing.",
    );
  }

  if (providerAuthPattern.test(composed)) {
    return new Error(
      "AI provider authentication failed. Set GEMINI_API_KEY or GOOGLE_API_KEY for Gemini API, or configure VERTEX_PROJECT_ID plus service account credentials (VERTEX_CLIENT_EMAIL/PRIVATE_KEY or FIREBASE_*), or GOOGLE_APPLICATION_CREDENTIALS for Gemini Enterprise Agent Platform.",
    );
  }

  if (response.status === 401) {
    return new Error(
      `${composed} Please sign in again so the app can send a valid auth token.`,
    );
  }

  if (response.status === 429) {
    return new Error(`${composed} Gemini quota/rate limit was reached. Check billing and usage.`);
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

export async function streamCoachMessage(input: {
  message: string;
  conversationId?: string;
  contextWindowDays?: number;
  includeAllHistory?: boolean;
  attachments?: CoachInputAttachment[];
  signal?: AbortSignal;
  onToken?: (token: string) => void;
  onMetadata?: (metadata: unknown) => void;
}): Promise<CoachChatResponse> {
  const baseUrl = requireBaseUrl();
  const idToken = await getAuthToken();
  let finalPayload: CoachChatResponse | null = null;
  let streamError: Error | null = null;

  await fetchEventSource(`${baseUrl}/api/coach/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
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
    }),
    signal: input.signal,
    openWhenHidden: true,
    async onopen(response) {
      if (response.ok) {
        return;
      }
      throw await parseApiError(response);
    },
    onmessage(message) {
      let data: any = null;
      try {
        data = message.data ? JSON.parse(message.data) : null;
      } catch {
        data = null;
      }
      if (message.event === "token") {
        const token = safeTrim(data?.token);
        if (token) input.onToken?.(token);
        return;
      }
      if (message.event === "metadata") {
        input.onMetadata?.(data);
        return;
      }
      if (message.event === "final") {
        finalPayload = data as CoachChatResponse;
        return;
      }
      if (message.event === "error") {
        streamError = new Error(safeTrim(data?.detail) || safeTrim(data?.message) || "Coach stream failed.");
      }
    },
    onerror(error) {
      throw error;
    },
  });

  if (streamError) {
    throw streamError;
  }

  if (!finalPayload) {
    throw new Error("Coach stream ended before a final response was received.");
  }

  return finalPayload;
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

export async function getCoachConversations(input: {
  limit?: number;
} = {}): Promise<CoachConversationsResponse> {
  const baseUrl = requireBaseUrl();
  const idToken = await getAuthToken();
  const params = new URLSearchParams();

  if (typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0) {
    params.set("limit", String(Math.floor(input.limit)));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";

  const response = await fetchCoachApi({
    baseUrl,
    path: `/api/coach/conversations${suffix}`,
    method: "GET",
    idToken,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as CoachConversationsResponse;
}

export async function deleteCoachConversation(input: {
  conversationId: string;
}): Promise<DeleteCoachConversationResponse> {
  const baseUrl = requireBaseUrl();
  const idToken = await getAuthToken();
  const conversationId = safeTrim(input.conversationId);

  if (!conversationId) {
    throw new Error("conversationId is required.");
  }

  const response = await fetchCoachApi({
    baseUrl,
    path: `/api/coach/conversations/${encodeURIComponent(conversationId)}`,
    method: "DELETE",
    idToken,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as DeleteCoachConversationResponse;
}

export async function getHomeCoachInsight(input: {
  contextWindowDays?: number;
} = {}): Promise<HomeInsightsResponse> {
  const baseUrl = requireBaseUrl();
  const idToken = await getAuthToken();
  const params = new URLSearchParams();

  if (
    typeof input.contextWindowDays === "number" &&
    Number.isFinite(input.contextWindowDays) &&
    input.contextWindowDays > 0
  ) {
    params.set("contextWindowDays", String(Math.floor(input.contextWindowDays)));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetchCoachApi({
    baseUrl,
    path: `/api/coach/home-insights${suffix}`,
    method: "GET",
    idToken,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  const payload = (await response.json()) as HomeInsightsResponse;
  const rawInsight = payload.insight ?? {};

  return {
    ...payload,
    insight: {
      title: safeTrim(rawInsight.title) || "Today's focus",
      summary: safeTrim(rawInsight.summary) || "Log your meals, movement, water, and sleep so Aether can coach with better context.",
      focus: safeTrim(rawInsight.focus) || "Consistency",
      actions: Array.isArray(rawInsight.actions)
        ? rawInsight.actions.map(safeTrim).filter(Boolean).slice(0, 3)
        : [],
    },
  };
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
