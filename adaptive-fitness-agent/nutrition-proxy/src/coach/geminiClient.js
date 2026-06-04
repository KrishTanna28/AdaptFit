import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_LOCATION = "us-central1";
const MAX_HISTORY_MESSAGES = 12;

function resolveProjectId() {
  const projectId = String(
    process.env.VERTEX_PROJECT_ID ??
      process.env.GOOGLE_CLOUD_PROJECT ??
      ""
  ).trim();

  if (!projectId) {
    throw new Error("vertex-project-id-missing");
  }

  return projectId;
}

function resolveLocation() {
  const location = String(
    process.env.VERTEX_LOCATION ??
      process.env.GOOGLE_CLOUD_LOCATION ??
      ""
  ).trim();

  return location || DEFAULT_LOCATION;
}

function resolveModel() {
  return (
    String(process.env.GEMINI_MODEL ?? DEFAULT_MODEL).trim() ||
    DEFAULT_MODEL
  );
}

function resolveVertexCredentials() {
  const clientEmail = String(
    process.env.VERTEX_CLIENT_EMAIL ??
      process.env.FIREBASE_CLIENT_EMAIL ??
      ""
  ).trim();

  const privateKeyRaw = String(
    process.env.VERTEX_PRIVATE_KEY ??
      process.env.FIREBASE_PRIVATE_KEY ??
      ""
  ).trim();

  if (!clientEmail || !privateKeyRaw) {
    throw new Error("vertex-credentials-missing");
  }

  return {
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
  };
}

function resolveApiKey() {
  const apiKey = String(
    process.env.GEMINI_API_KEY ??
      process.env.GEMINI_APPI_KEY ??
      process.env.GOOGLE_API_KEY ??
      ""
  ).trim();

  if (!apiKey) {
    throw new Error("gemini-api-key-missing");
  }

  return apiKey;
}

function shouldUseVertex() {
  const flag = String(
    process.env.GEMINI_USE_VERTEX ?? ""
  )
    .trim()
    .toLowerCase();

  if (flag) {
    return flag === "true" || flag === "1" || flag === "yes";
  }

  return Boolean(
    process.env.VERTEX_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.VERTEX_CLIENT_EMAIL ||
      process.env.VERTEX_PRIVATE_KEY
  );
}

/**
 * Creates a GoogleGenAI client using Vertex AI auth when configured.
 */
function createGenAIClient() {
  const model = resolveModel();

  if (shouldUseVertex()) {
    const project = resolveProjectId();
    const location = resolveLocation();
    const credentials = resolveVertexCredentials();

    return {
      model,

      ai: new GoogleGenAI({
        vertexai: true,
        project,
        location,

        googleAuthOptions: {
          credentials: {
            project_id: project,
            client_email: credentials.clientEmail,
            private_key: credentials.privateKey,
          },
        },
      }),
    };
  }

  const apiKey = resolveApiKey();

  return {
    model,

    ai: new GoogleGenAI({
      apiKey,
    }),
  };
}

function normalizeBase64(value) {
  const raw = String(value ?? "").trim();

  if (!raw) return "";

  if (raw.startsWith("data:")) {
    const commaIndex = raw.indexOf(",");

    if (commaIndex > -1) {
      return raw
        .slice(commaIndex + 1)
        .replace(/\s+/g, "");
    }
  }

  return raw.replace(/\s+/g, "");
}

function normalizeHistoryMessages(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (item) =>
        item &&
        typeof item.content === "string" &&
        item.content.trim()
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content.trim() }],
    }));
}

/**
 * Extract plain text response
 */
function extractTextResponse(response) {
  let text = "";

  try {
    text = (response.text ?? "").trim();
  } catch (_) {
    // blocked response
  }

  if (!text) {
    const candidate = response.candidates?.[0];

    const blockReason =
      String(
        response.promptFeedback?.blockReasonMessage ?? ""
      ).trim() ||
      String(response.promptFeedback?.blockReason ?? "").trim() ||
      String(candidate?.finishReason ?? "").trim();

    throw new Error(
      blockReason
        ? `gemini-empty-response (${blockReason})`
        : "gemini-empty-response"
    );
  }

  return text;
}

function extractUsage(response) {
  const usage = response.usageMetadata;

  if (!usage || typeof usage !== "object") {
    return null;
  }

  return {
    promptTokenCount:
      Number(usage.promptTokenCount ?? 0) || 0,

    candidatesTokenCount:
      Number(usage.candidatesTokenCount ?? 0) || 0,

    totalTokenCount:
      Number(usage.totalTokenCount ?? 0) || 0,
  };
}

function toErrorMessage(error) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Gemini API request failed.";
}

/**
 * Core request helper
 */
async function requestGenAIContent({
  systemInstruction,
  contents,
  generationConfig,
}) {
  const { model, ai } = createGenAIClient();

  try {
    const requestBody = {
      model,
      contents,
    };

    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }

    if (
      generationConfig &&
      Object.keys(generationConfig).length > 0
    ) {
      requestBody.config = generationConfig;
    }

    const response =
      await ai.models.generateContent(requestBody);

    return {
      model,
      response,
    };
  } catch (error) {
    throw new Error(toErrorMessage(error));
  }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC EXPORTS
// ─────────────────────────────────────────────────────────────

export async function generateCoachResponse(input) {
  const generationConfig = {
    temperature: 0.35,
    topP: 0.9,
    ...(input.generationConfig && typeof input.generationConfig === "object"
      ? input.generationConfig
      : {}),
  };

  const { model, response } =
    await requestGenAIContent({
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

      generationConfig,
    });

  return {
    model,
    text: extractTextResponse(response),
    usage: extractUsage(response),
  };
}

export async function generateFormAnalysisResponse(
  input
) {
  const { model, response } =
    await requestGenAIContent({
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
    });

  return {
    model,
    text: extractTextResponse(response),
    usage: extractUsage(response),
  };
}

export async function generateHomeInsightsResponse(
  input
) {
  const { model, response } =
    await requestGenAIContent({
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: [
              "You are Aether, a concise fitness and nutrition coach.",
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
    });

  return {
    model,
    text: extractTextResponse(response),
    usage: extractUsage(response),
  };
}

export async function generatePlateFoodVisionResponse(
  input
) {
  const normalizedImage = normalizeBase64(
    input.imageBase64
  );

  if (!normalizedImage) {
    throw new Error("image-base64-missing");
  }

  const mimeType =
    String(input.mimeType ?? "image/jpeg").trim() ||
    "image/jpeg";

  const prompt = String(input.prompt ?? "").trim();

  const { model, response } =
    await requestGenAIContent({
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
    });

  return {
    model,
    text: extractTextResponse(response),
    usage: extractUsage(response),
  };
}

export async function transcribeAudioWithVertex(
  input
) {
  const normalizedAudio = normalizeBase64(
    input.audioBase64
  );

  if (!normalizedAudio) {
    throw new Error("audio-base64-missing");
  }

  const mimeType =
    String(input.mimeType ?? "audio/mp4").trim() ||
    "audio/mp4";

  const prompt = String(
    input.prompt ??
      "Transcribe this user audio into plain text. Return only the transcript text without extra commentary."
  ).trim();

  const { model, response } =
    await requestGenAIContent({
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
    });

  return {
    model,
    text: extractTextResponse(response),
    usage: extractUsage(response),
  };
}

// Backward compatibility alias
export async function transcribeAudioWithGemini(
  input
) {
  return transcribeAudioWithVertex(input);
}

/**
 * Streaming response support
 */
export function streamCoachResponse(input) {
  const { model, ai } = createGenAIClient();
  const onChunk =
    typeof input.onChunk === "function" ? input.onChunk : null;
  const onToken =
    typeof input.onToken === "function" ? input.onToken : null;

  const requestBody = {
    model,

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

    config: {
      temperature: 0.35,
      topP: 0.9,
      ...(input.generationConfig && typeof input.generationConfig === "object"
        ? input.generationConfig
        : {}),
    },
  };

  let resolveResponse;
  let rejectResponse;

  const responsePromise = new Promise((res, rej) => {
    resolveResponse = res;
    rejectResponse = rej;
  });

  async function* streamAndCollect() {
    let fullText = "";
    let lastResponse = null;

    try {
      const sdkStream =
        await ai.models.generateContentStream(
          requestBody
        );

      for await (const chunk of sdkStream) {
        const chunkText = String(chunk.text ?? "");

        lastResponse = chunk;

        if (chunkText.trim()) {
          fullText += chunkText;

          if (onChunk) {
            onChunk(chunkText);
          }

          if (onToken) {
            onToken(chunkText);
          }

          yield chunkText;
        }
      }

      resolveResponse({
        model,
        text: fullText,
        usage: extractUsage(lastResponse),
      });
    } catch (err) {
      rejectResponse(new Error(toErrorMessage(err)));
      throw err;
    }
  }

  return {
    stream: streamAndCollect(),
    response: responsePromise,
  };
}
