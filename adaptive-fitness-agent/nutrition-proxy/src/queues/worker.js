import { Worker } from "bullmq";

import { handleIntelligenceEvent } from "../events/handlers.js";
import { errorToLog, logger } from "../observability/logger.js";
import { queueJobDurationMs } from "../observability/metrics.js";
import { getQueueConnection, isQueueEnabled } from "./connection.js";
import { INTELLIGENCE_QUEUE_NAME } from "./intelligenceQueue.js";

let worker = null;

export function startIntelligenceWorker() {
  if (!isQueueEnabled()) {
    logger.info("Intelligence queue disabled; events will use inline fallback.");
    return null;
  }

  if (worker) {
    return worker;
  }

  const connection = getQueueConnection();
  if (!connection) {
    return null;
  }

  worker = new Worker(
    INTELLIGENCE_QUEUE_NAME,
    async (job) => {
      const start = performance.now();
      const eventType = job.data?.event?.type ?? job.name;
      try {
        const result = await handleIntelligenceEvent(job.data?.event);
        queueJobDurationMs
          .labels(INTELLIGENCE_QUEUE_NAME, eventType, "success")
          .observe(performance.now() - start);
        return result;
      } catch (error) {
        queueJobDurationMs
          .labels(INTELLIGENCE_QUEUE_NAME, eventType, "failure")
          .observe(performance.now() - start);
        throw error;
      }
    },
    {
      connection,
      concurrency: Number(process.env.INTELLIGENCE_WORKER_CONCURRENCY ?? 3),
    },
  );

  worker.on("failed", (job, error) => {
    logger.warn({ jobId: job?.id, err: errorToLog(error) }, "Intelligence job failed.");
  });

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id, name: job.name }, "Intelligence job completed.");
  });

  logger.info("Intelligence worker started.");
  return worker;
}

export async function closeIntelligenceWorker() {
  if (!worker) {
    return;
  }

  await worker.close().catch(() => {});
  worker = null;
}

