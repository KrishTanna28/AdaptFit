import express from "express";

import { verifyCoachIdToken } from "../coach/firebaseAdmin.js";
import { publishIntelligenceEvent } from "./eventBus.js";
import { IntelligenceEventTypeSchema } from "../schemas/events.js";
import { safeValidate, validationErrorResponse } from "../schemas/validators.js";

function parseBearerToken(authorizationHeader) {
  const header = String(authorizationHeader ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

async function requireEventUser(req, res, next) {
  try {
    const idToken = parseBearerToken(req.headers.authorization);
    if (!idToken) {
      return res.status(401).json({ message: "Missing auth token." });
    }

    const decoded = await verifyCoachIdToken(idToken);
    req.eventUser = {
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

export function mountEventRoutes(app) {
  const router = express.Router();

  router.post("/intelligence", requireEventUser, async (req, res) => {
    const typeValidation = safeValidate(
      IntelligenceEventTypeSchema,
      req.body?.type,
      "intelligence event type",
    );
    if (!typeValidation.ok) {
      return res.status(400).json(validationErrorResponse(typeValidation));
    }

    const result = await publishIntelligenceEvent({
      type: typeValidation.data,
      uid: req.eventUser.uid,
      payload: req.body?.payload ?? {},
      source: "api",
    });

    if (!result.accepted) {
      return res.status(400).json(validationErrorResponse(result.validation));
    }

    return res.status(202).json({
      accepted: true,
      queued: Boolean(result.queued),
      fallback: result.fallback,
      eventId: result.event.eventId,
      type: result.event.type,
    });
  });

  app.use("/api/events", router);
}

