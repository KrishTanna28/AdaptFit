import { Queue } from "bullmq";

import { QueueEventSchema, QueueJobEnvelopeSchema } from "../schemas/events.js";
import { safeValidate } from "../schemas/validators.js";
import { observeValidationFailure } from "../observability/metrics.js";
import { logger } from "../observability/logger.js";
import { getQueueConnection, isQueueEnabled } from "./connection.js";

export const INTELLIGENCE_QUEUE_NAME = "intelligence";

let queue = null;

export function getIntelligenceQueue() {
  if (!isQueueEnabled()) {
    return null;
  }

  if (queue) {
    return queue;
  }

  const connection = getQueueConnection();
  if (!connection) {
    return null;
  }

  queue = new Queue(INTELLIGENCE_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  });

  return queue;
}

export async function enqueueIntelligenceEvent(rawEvent, options = {}) {
  const validation = safeValidate(QueueEventSchema, rawEvent, "queue event");
  if (!validation.ok) {
    observeValidationFailure("queue event");
    logger.warn({ detail: validation.detail }, "Rejected invalid intelligence event.");
    return { queued: false, validation };
  }

  const event = validation.data;
  const envelope = QueueJobEnvelopeSchema.parse({
    event,
    metadata: options.metadata ?? {},
  });

  const activeQueue = getIntelligenceQueue();
  if (!activeQueue) {
    return { queued: false, event, reason: "queue-disabled" };
  }

  await activeQueue.add(event.type, envelope, {
    jobId: event.eventId,
    priority: event.type === "ai_chat_requested" ? 1 : 5,
  });

  return { queued: true, event };
}

export async function closeIntelligenceQueue() {
  if (!queue) {
    return;
  }

  await queue.close().catch(() => {});
  queue = null;
}

