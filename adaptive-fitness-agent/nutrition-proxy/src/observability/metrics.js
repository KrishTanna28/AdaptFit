import client from "prom-client";

import { logger } from "./logger.js";

export const metricsRegistry = new client.Registry();

client.collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "adaptive_fitness_",
});

export const httpRequestDurationMs = new client.Histogram({
  name: "adaptive_fitness_http_request_duration_ms",
  help: "HTTP request duration in milliseconds.",
  labelNames: ["method", "route", "status"],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
});

export const aiLatencyMs = new client.Histogram({
  name: "adaptive_fitness_ai_latency_ms",
  help: "AI provider latency in milliseconds.",
  labelNames: ["operation", "provider", "model"],
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
});

export const firstTokenLatencyMs = new client.Histogram({
  name: "adaptive_fitness_ai_first_token_latency_ms",
  help: "Streaming first-token latency in milliseconds.",
  labelNames: ["provider", "model"],
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
});

export const tokenCountHistogram = new client.Histogram({
  name: "adaptive_fitness_ai_token_count",
  help: "Prompt and response token counts.",
  labelNames: ["kind", "operation"],
  buckets: [100, 250, 500, 750, 1000, 1500, 2500, 4000, 8000, 16000],
});

export const cacheOperations = new client.Counter({
  name: "adaptive_fitness_cache_operations_total",
  help: "Cache operations by layer, outcome, and namespace.",
  labelNames: ["layer", "outcome", "namespace"],
});

export const queueJobDurationMs = new client.Histogram({
  name: "adaptive_fitness_queue_job_duration_ms",
  help: "Queue job execution duration in milliseconds.",
  labelNames: ["queue", "event_type", "status"],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 15000, 60000],
});

export const validationFailures = new client.Counter({
  name: "adaptive_fitness_validation_failures_total",
  help: "Validation failures by boundary.",
  labelNames: ["boundary"],
});

export const streamingInterruptions = new client.Counter({
  name: "adaptive_fitness_streaming_interruptions_total",
  help: "Interrupted streaming responses.",
  labelNames: ["reason"],
});

export const firestoreLatencyMs = new client.Histogram({
  name: "adaptive_fitness_firestore_latency_ms",
  help: "Firestore operation latency in milliseconds.",
  labelNames: ["operation"],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
});

metricsRegistry.registerMetric(httpRequestDurationMs);
metricsRegistry.registerMetric(aiLatencyMs);
metricsRegistry.registerMetric(firstTokenLatencyMs);
metricsRegistry.registerMetric(tokenCountHistogram);
metricsRegistry.registerMetric(cacheOperations);
metricsRegistry.registerMetric(queueJobDurationMs);
metricsRegistry.registerMetric(validationFailures);
metricsRegistry.registerMetric(streamingInterruptions);
metricsRegistry.registerMetric(firestoreLatencyMs);

function routeLabel(req) {
  return req.route?.path
    ? `${req.baseUrl || ""}${req.route.path}`
    : req.originalUrl?.split("?")[0] || req.path || "unknown";
}

export function metricsMiddleware(req, res, next) {
  const start = performance.now();

  res.on("finish", () => {
    httpRequestDurationMs
      .labels(req.method, routeLabel(req), String(res.statusCode))
      .observe(performance.now() - start);
  });

  next();
}

export function observeAiLatency({ operation, provider = "unknown", model = "unknown", start }) {
  aiLatencyMs.labels(operation, provider, model).observe(Math.max(0, performance.now() - start));
}

export function observeCache({ layer, outcome, namespace = "app" }) {
  cacheOperations.labels(layer, outcome, namespace).inc();
}

export function observeValidationFailure(boundary) {
  validationFailures.labels(boundary || "unknown").inc();
}

export function mountMetricsEndpoint(app) {
  app.get("/metrics", async (_req, res) => {
    try {
      res.set("Content-Type", metricsRegistry.contentType);
      return res.send(await metricsRegistry.metrics());
    } catch (error) {
      logger.warn({ err: error }, "Failed to render Prometheus metrics.");
      return res.status(500).send("metrics-unavailable");
    }
  });
}

