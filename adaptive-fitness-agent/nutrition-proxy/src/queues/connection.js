import IORedis from "ioredis";

import { logger } from "../observability/logger.js";

const REDIS_URL = String(process.env.REDIS_URL ?? "").trim();

let connection = null;

export function isQueueEnabled() {
  return Boolean(REDIS_URL) && String(process.env.QUEUE_ENABLED ?? "true").toLowerCase() !== "false";
}

export function getQueueConnection() {
  if (!isQueueEnabled()) {
    return null;
  }

  if (connection) {
    return connection;
  }

  connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  connection.on("error", (error) => {
    logger.warn({ err: error }, "BullMQ Redis connection error.");
  });

  return connection;
}

export async function closeQueueConnection() {
  if (!connection) {
    return;
  }

  await connection.quit().catch(() => {});
  connection = null;
}

