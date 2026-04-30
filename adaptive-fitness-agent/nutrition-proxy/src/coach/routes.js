import express from "express";

import { ensureConversation, appendConversationMessage, listConversationMessages } from "./conversationStore.js";
import { loadCoachContext } from "./context.js";
import { getCoachFirestore, verifyCoachIdToken } from "./firebaseAdmin.js";
import { generateCoachResponse, transcribeAudioWithVertex } from "./geminiClient.js";
import { buildCoachSystemPrompt, buildCoachUserPrompt } from "./prompt.js";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_CONTENT_LENGTH = 20000;
const MAX_AUDIO_BASE64_LENGTH = 8 * 1024 * 1024;

const PROVIDER_ACCESS_DENIED_PATTERN =
  /denied access|permission[_\s-]?denied|api key not valid|insufficient permissions|contact support|forbidden|status:\s*403|api has not been used|disabled/i;
const PROVIDER_AUTH_FAILED_PATTERN =
  /unable to authenticate your request|vertex-sdk-api-key-not-supported|no credentials|could not refresh access token/i;
const RATE_LIMIT_PATTERN =
  /quota|resource exhausted|rate limit|too many requests/i;
const PROVIDER_UNAVAILABLE_PATTERN =
  /unavailable|deadline exceeded|timed out|timeout|temporarily unavailable/i;

function inferCoachErrorStatus(detail, fallback = 500) {
  const text = String(detail ?? "").trim();
  if (!text) {
    return fallback;
  }

  if (PROVIDER_ACCESS_DENIED_PATTERN.test(text)) {
    return 403;
  }

  if (PROVIDER_AUTH_FAILED_PATTERN.test(text)) {
    return 403;
  }

  if (RATE_LIMIT_PATTERN.test(text)) {
    return 429;
  }

  if (PROVIDER_UNAVAILABLE_PATTERN.test(text)) {
    return 503;
  }

  return fallback;
}

function messageForCoachStatus(statusCode) {
  if (statusCode === 403) {
    return "AI provider access denied or API disabled for this project.";
  }

  if (statusCode === 429) {
    return "AI provider quota/rate limit reached.";
  }

  if (statusCode === 503) {
    return "AI provider is temporarily unavailable.";
  }

  return "Coach request failed.";
}

function parseBearerToken(authorizationHeader) {
  const header = String(authorizationHeader ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

function toSafeMessage(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWindowDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return 7;
  }
  return Math.max(7, Math.min(30, Math.floor(n)));
}

function normalizeIncludeAllHistory(value) {
  return value !== false;
}

function normalizeAttachments(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, MAX_ATTACHMENTS)
    .map((attachment) => {
      const name = typeof attachment?.name === "string" ? attachment.name.trim() : "";
      const mimeType =
        typeof attachment?.mimeType === "string"
          ? attachment.mimeType.trim()
          : "application/octet-stream";
      const content = typeof attachment?.content === "string" ? attachment.content.trim() : "";

      if (!name || !content) {
        return null;
      }

      return {
        name,
        mimeType,
        content: content.slice(0, MAX_ATTACHMENT_CONTENT_LENGTH),
      };
    })
    .filter((item) => item !== null);
}

function normalizeAudioBase64(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  if (raw.length > MAX_AUDIO_BASE64_LENGTH) {
    throw new Error("audio-payload-too-large");
  }

  return raw;
}

async function requireCoachUser(req, res, next) {
  try {
    const idToken = parseBearerToken(req.headers.authorization);
    if (!idToken) {
      return res.status(401).json({ message: "Missing auth token." });
    }

    const decoded = await verifyCoachIdToken(idToken);
    req.coachUser = {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : null,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired auth token.",
      detail: error instanceof Error ? error.message : "Auth verification failed.",
    });
  }
}

export function mountCoachRoutes(app) {
  const router = express.Router();

  router.post("/chat", requireCoachUser, async (req, res) => {
    try {
      const message = toSafeMessage(req.body?.message);
      if (!message) {
        return res.status(400).json({ message: "message is required." });
      }

      if (message.length > MAX_MESSAGE_LENGTH) {
        return res
          .status(400)
          .json({ message: `message must be <= ${String(MAX_MESSAGE_LENGTH)} characters.` });
      }

      const db = getCoachFirestore();
      const uid = req.coachUser.uid;
      const windowDays = normalizeWindowDays(req.body?.contextWindowDays);
      const includeAllHistory = normalizeIncludeAllHistory(req.body?.includeAllHistory);
      const attachments = normalizeAttachments(req.body?.attachments);
      const conversationId = await ensureConversation(db, uid, req.body?.conversationId);
      const history = await listConversationMessages(db, uid, conversationId, 10);
      const context = await loadCoachContext(db, uid, { windowDays, includeAllHistory });

      const systemPrompt = buildCoachSystemPrompt();
      const userPrompt = buildCoachUserPrompt({
        context,
        message,
        attachments,
      });

      const coachResponse = await generateCoachResponse({
        systemPrompt,
        userPrompt,
        history,
      });

      await appendConversationMessage(db, uid, conversationId, {
        role: "user",
        content: message,
      });

      await appendConversationMessage(db, uid, conversationId, {
        role: "assistant",
        content: coachResponse.text,
        model: coachResponse.model,
        usage: coachResponse.usage,
      });

      return res.json({
        conversationId,
        reply: coachResponse.text,
        model: coachResponse.model,
        usage: coachResponse.usage,
        contextSignals: context.signals,
        contextWindow: context.window,
        attachmentsUsed: attachments.length,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      const statusCode = inferCoachErrorStatus(detail, 500);

      return res.status(statusCode).json({
        message: messageForCoachStatus(statusCode),
        detail,
      });
    }
  });

  router.post("/transcribe", requireCoachUser, async (req, res) => {
    try {
      const audioBase64 = normalizeAudioBase64(req.body?.audioBase64);
      if (!audioBase64) {
        return res.status(400).json({ message: "audioBase64 is required." });
      }

      const mimeType =
        typeof req.body?.mimeType === "string" && req.body.mimeType.trim()
          ? req.body.mimeType.trim()
          : "audio/mp4";

      const transcription = await transcribeAudioWithVertex({
        audioBase64,
        mimeType,
      });

      return res.json({
        text: transcription.text,
        model: transcription.model,
        usage: transcription.usage,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      const statusCode = /audio-payload-too-large/i.test(detail)
        ? 413
        : inferCoachErrorStatus(detail, 500);

      return res.status(statusCode).json({
        message: statusCode === 413 ? "Transcription failed." : messageForCoachStatus(statusCode),
        detail,
      });
    }
  });

  router.get("/conversations/:conversationId/messages", requireCoachUser, async (req, res) => {
    try {
      const conversationId = String(req.params.conversationId ?? "").trim();
      if (!conversationId) {
        return res.status(400).json({ message: "conversationId is required." });
      }

      const db = getCoachFirestore();
      const messages = await listConversationMessages(
        db,
        req.coachUser.uid,
        conversationId,
        req.query.limit,
      );

      return res.json({
        conversationId,
        messages,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load conversation messages.",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.use("/api/coach", router);
}
