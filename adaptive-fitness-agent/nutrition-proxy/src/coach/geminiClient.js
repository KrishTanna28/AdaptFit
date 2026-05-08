import { VertexAI } from "@google-cloud/vertexai";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_LOCATION = "us-central1";
const MAX_HISTORY_MESSAGES = 12;

function getApiKeyFromEnv() {
  const preferred = String(process.env.GEMINI_APPI_KEY ?? "").trim();
  if (preferred) {
    return preferred;
  }

  return String(process.env.GEMINI_API_KEY ?? "").trim();
}

function getServiceAccountCredentialsFromEnv() {
  const projectId = String(
    process.env.VERTEX_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? "",
  ).trim();
  const clientEmail = String(process.env.VERTEX_CLIENT_EMAIL ?? process.env.FIREBASE_CLIENT_EMAIL ?? "").trim();
  const privateKeyRaw = String(process.env.VERTEX_PRIVATE_KEY ?? process.env.FIREBASE_PRIVATE_KEY ?? "").trim();

  if (!projectId || !clientEmail || !privateKeyRaw) {
    return null;
  }

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKeyRaw.replace(/\\n/g, "\n"),
  };
}

function resolveProjectId() {
  const projectId = String(
    process.env.VERTEX_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? "",
  ).trim();

  if (!projectId) {
    throw new Error("vertex-project-id-missing");
  }

  return projectId;
}

function resolveLocation() {
  const location = String(process.env.VERTEX_LOCATION ?? process.env.GOOGLE_CLOUD_LOCATION ?? "").trim();
  return location || DEFAULT_LOCATION;
}

function resolveModel() {
  return String(process.env.GEMINI_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function createVertexModel() {
  const project = resolveProjectId();
  const location = resolveLocation();
  const model = resolveModel();
  const credentials = getServiceAccountCredentialsFromEnv();
  const apiKey = getApiKeyFromEnv();

  const vertexInit = {
    project,
    location,
  };

  if (credentials) {
    vertexInit.googleAuthOptions = { credentials };
  } else if (apiKey && !String(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "").trim()) {
    throw new Error(
      "vertex-sdk-api-key-not-supported: @google-cloud/vertexai requires service-account/ADC auth. Configure VERTEX_PROJECT_ID, VERTEX_CLIENT_EMAIL, VERTEX_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS.",
    );
  }

  const vertexAI = new VertexAI(vertexInit);
  const generativeModel = vertexAI.getGenerativeModel({ model });

  return {
    model,
    generativeModel,
  };
}

function normalizeBase64(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  if (raw.startsWith("data:")) {
    const commaIndex = raw.indexOf(",");
    if (commaIndex > -1) {
      return raw.slice(commaIndex + 1).replace(/\s+/g, "");
    }
  }

  return raw.replace(/\s+/g, "");
}

function normalizeHistoryMessages(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item) => item && typeof item.content === "string" && item.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content.trim() }],
    }));
}

function extractTextResponse(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const firstCandidate = candidates[0] ?? null;
  const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate.content.parts : [];

  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();

  if (!text) {
    const blockReason =
      String(payload?.promptFeedback?.blockReasonMessage ?? "").trim() ||
      String(payload?.promptFeedback?.blockReason ?? "").trim() ||
      String(firstCandidate?.finishReason ?? "").trim();

    if (blockReason) {
      throw new Error(`vertex-empty-response (${blockReason})`);
    }

    throw new Error("vertex-empty-response");
  }

  return text;
}

function extractUsage(payload) {
  const usage = payload?.usageMetadata;
  if (!usage || typeof usage !== "object") {
    return null;
  }

  return {
    promptTokenCount: Number(usage.promptTokenCount ?? 0) || 0,
    candidatesTokenCount: Number(usage.candidatesTokenCount ?? 0) || 0,
    totalTokenCount: Number(usage.totalTokenCount ?? 0) || 0,
  };
}

function toErrorMessage(error) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Vertex AI request failed.";
}

async function requestVertexContent(body) {
  const { model, generativeModel } = createVertexModel();

  try {
    const result = await generativeModel.generateContent({
      ...body,
      generationConfig: body.generationConfig ?? {},
    });

    return {
      model,
      payload: result?.response ?? {},
    };
  } catch (error) {
    throw new Error(toErrorMessage(error));
  }
}

export async function generateCoachResponse(input) {
  const body = {
    systemInstruction: {
      role: "system",
      parts: [{ text: input.systemPrompt }],
    },
    contents: [
      ...normalizeHistoryMessages(input.history),
      {
        role: "user",
        parts: [{ text: input.userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.35,
      topP: 0.9,
    },
  };

  const { model, payload } = await requestVertexContent(body);

  return {
    model,
    text: extractTextResponse(payload),
    usage: extractUsage(payload),
  };
}

export async function generateFormAnalysisResponse(input) {
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: input.prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.25,
      topP: 0.85,
    },
  };

  const { model, payload } = await requestVertexContent(body);

  return {
    model,
    text: extractTextResponse(payload),
    usage: extractUsage(payload),
  };
}

export async function generateHomeInsightsResponse(input) {
  const body = {
    systemInstruction: {
      role: "system",
      parts: [
        {
          text: [
            "You are Drona, a concise fitness and nutrition coach.",
            "Return only valid JSON. Do not use markdown.",
            "Use the provided app context as the source of truth.",
            "Avoid medical claims and extreme advice.",
          ].join("\n"),
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: input.prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.35,
      topP: 0.9,
    },
  };

  const { model, payload } = await requestVertexContent(body);

  return {
    model,
    text: extractTextResponse(payload),
    usage: extractUsage(payload),
  };
}

export async function generatePlateFoodVisionResponse(input) {
  const normalizedImage = normalizeBase64(input.imageBase64);
  if (!normalizedImage) {
    throw new Error("image-base64-missing");
  }

  const mimeType = String(input.mimeType ?? "image/jpeg").trim() || "image/jpeg";
  const prompt = String(input.prompt ?? "").trim();

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: normalizedImage,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.05,
      topP: 0.8,
    },
  };

  const { model, payload } = await requestVertexContent(body);

  return {
    model,
    text: extractTextResponse(payload),
    usage: extractUsage(payload),
  };
}

export async function transcribeAudioWithVertex(input) {
  const normalizedAudio = normalizeBase64(input.audioBase64);
  if (!normalizedAudio) {
    throw new Error("audio-base64-missing");
  }

  const mimeType = String(input.mimeType ?? "audio/mp4").trim() || "audio/mp4";
  const prompt = String(
    input.prompt ??
      "Transcribe this user audio into plain text. Return only the transcript text without extra commentary.",
  ).trim();

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: normalizedAudio,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      topP: 0.9,
    },
  };

  const { model, payload } = await requestVertexContent(body);

  return {
    model,
    text: extractTextResponse(payload),
    usage: extractUsage(payload),
  };
}

export async function transcribeAudioWithGemini(input) {
  return transcribeAudioWithVertex(input);
}
