import express from "express";

import { verifyCoachIdToken } from "../coach/firebaseAdmin.js";
import { generateFormAnalysisResponse } from "../coach/geminiClient.js";
import { buildFormAnalysisPrompt } from "./prompt.js";

const MAX_EXERCISE_NAME_LENGTH = 80;
const MAX_SUMMARY_JSON_LENGTH = 50000;

const PROVIDER_ACCESS_DENIED_PATTERN =
  /denied access|permission[_\s-]?denied|api key not valid|insufficient permissions|contact support|forbidden|status:\s*403|api has not been used|disabled/i;
const PROVIDER_AUTH_FAILED_PATTERN =
  /unable to authenticate your request|vertex-sdk-api-key-not-supported|no credentials|could not refresh access token/i;
const RATE_LIMIT_PATTERN = /quota|resource exhausted|rate limit|too many requests/i;
const PROVIDER_UNAVAILABLE_PATTERN =
  /unavailable|deadline exceeded|timed out|timeout|temporarily unavailable/i;

function parseBearerToken(authorizationHeader) {
  const header = String(authorizationHeader ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

async function requireFormAnalysisUser(req, res, next) {
  try {
    const idToken = parseBearerToken(req.headers.authorization);
    if (!idToken) {
      return res.status(401).json({ message: "Missing auth token." });
    }

    const decoded = await verifyCoachIdToken(idToken);
    req.formAnalysisUser = {
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

function inferStatus(detail, fallback = 500) {
  const text = String(detail ?? "").trim();
  if (PROVIDER_ACCESS_DENIED_PATTERN.test(text)) return 403;
  if (PROVIDER_AUTH_FAILED_PATTERN.test(text)) return 403;
  if (RATE_LIMIT_PATTERN.test(text)) return 429;
  if (PROVIDER_UNAVAILABLE_PATTERN.test(text)) return 503;
  return fallback;
}

function messageForStatus(statusCode) {
  if (statusCode === 403) return "AI provider access denied or API disabled for this project.";
  if (statusCode === 429) return "AI provider quota/rate limit reached.";
  if (statusCode === 503) return "AI provider is temporarily unavailable.";
  return "Form analysis failed.";
}

function cleanJsonText(text) {
  const raw = String(text ?? "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

function normalizeInsights(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanInsightText(item))
    .filter(Boolean)
    .slice(0, 4);
}

function cleanInsightText(value) {
  return String(value ?? "")
    .replace(/^\s*["'`]+|["'`,]+$/g, "")
    .replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, "")
    .replace(/^\s*insights?\s*:\s*/i, "")
    .trim();
}

function parseInsights(text) {
  const cleaned = cleanJsonText(text);
  try {
    const parsed = JSON.parse(cleaned);
    return normalizeInsights(parsed?.insights);
  } catch {
    return cleaned
      .split(/\n+/)
      .map((line) => cleanInsightText(line))
      .filter((line) => !/^[\]{}]+$/.test(line))
      .filter((line) => !/^"?insights"?\s*:\s*\[?$/i.test(line))
      .filter(Boolean)
      .slice(0, 4);
  }
}

function normalizeExerciseName(value) {
  return String(value ?? "").trim().slice(0, MAX_EXERCISE_NAME_LENGTH);
}

function normalizeSummary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const summaryJson = JSON.stringify(value);
  if (summaryJson.length > MAX_SUMMARY_JSON_LENGTH) {
    throw new Error("summary-too-large");
  }

  return value;
}

export function mountFormAnalysisRoutes(app) {
  const router = express.Router();

  router.post("/analyze", requireFormAnalysisUser, async (req, res) => {
    try {
      const exerciseName = normalizeExerciseName(req.body?.exerciseName);
      if (exerciseName.length < 2) {
        return res.status(400).json({ message: "exerciseName is required." });
      }

      const summary = normalizeSummary(req.body?.summary);
      if (!summary) {
        return res.status(400).json({ message: "summary is required." });
      }

      const prompt = buildFormAnalysisPrompt({ exerciseName, summary });
      const response = await generateFormAnalysisResponse({ prompt });
      const insights = parseInsights(response.text);

      return res.json({
        exerciseName,
        repsDetected: Number(summary?.repsDetected ?? 0) || 0,
        insights: insights.length
          ? insights
          : ["Record another set with your full body visible for clearer form feedback."],
        model: response.model,
        usage: response.usage,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      const statusCode = /summary-too-large/i.test(detail) ? 413 : inferStatus(detail, 500);

      return res.status(statusCode).json({
        message: statusCode === 413 ? "Form summary is too large." : messageForStatus(statusCode),
        detail,
      });
    }
  });

  app.use("/api/form-analysis", router);
}
