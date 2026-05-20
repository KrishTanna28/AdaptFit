import { randomUUID } from "node:crypto";

import { getCoachFirestore } from "../coach/firebaseAdmin.js";
import { enqueueIntelligenceEvent } from "../queues/intelligenceQueue.js";
import { handleIntelligenceEvent } from "./handlers.js";
import { QueueEventSchema } from "../schemas/events.js";
import { safeValidate } from "../schemas/validators.js";
import { observeValidationFailure } from "../observability/metrics.js";
import { errorToLog, logger } from "../observability/logger.js";

export async function publishIntelligenceEvent(input) {
  const event = {
    eventId: input.eventId ?? randomUUID(),
    uid: input.uid,
    type: input.type,
    payload: input.payload ?? {},
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    source: input.source ?? "app",
  };

  const validation = safeValidate(QueueEventSchema, event, "published intelligence event");
  if (!validation.ok) {
    observeValidationFailure("published intelligence event");
    logger.warn({ detail: validation.detail }, "Invalid intelligence event.");
    return { accepted: false, validation };
  }

  let enqueueResult;
  try {
    enqueueResult = await enqueueIntelligenceEvent(validation.data);
  } catch (error) {
    logger.warn({ err: errorToLog(error), event: validation.data }, "Queue enqueue failed; using inline fallback.");
    enqueueResult = { queued: false, event: validation.data, reason: "enqueue-failed" };
  }
  if (enqueueResult.queued) {
    return { accepted: true, queued: true, event: validation.data };
  }

  // Development and local demos often run without Redis. Keep the event-driven contract while
  // falling back to an asynchronous inline handler so request paths are not blocked on Redis setup.
  setImmediate(() => {
    handleIntelligenceEvent(validation.data, { db: getCoachFirestore() }).catch((error) => {
      logger.warn({ err: errorToLog(error), event: validation.data }, "Inline intelligence event failed.");
    });
  });

  return {
    accepted: true,
    queued: false,
    fallback: enqueueResult.reason ?? "inline",
    event: validation.data,
  };
}
