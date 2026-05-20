import dotenv from "dotenv";
import { createClient } from "redis";

dotenv.config();

const REDIS_URL = String(process.env.REDIS_URL ?? "").trim();
const REDIS_CONNECT_TIMEOUT_MS = toPositiveInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 5000);
const CACHE_ENABLED =
  String(process.env.REDIS_CACHE_ENABLED ?? "true").toLowerCase() !== "false";
const DEFAULT_PREFIX = String(process.env.REDIS_KEY_PREFIX ?? "adaptive_fitness").trim();

let redisClient = null;
let redisReady = false;
let connectPromise = null;

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.floor(n);
}

function normalizeKeyPart(value) {
  return encodeURIComponent(
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " "),
  );
}

export function buildCacheKey(parts, namespace = "app") {
  return [DEFAULT_PREFIX, namespace, ...parts.map((part) => normalizeKeyPart(part))].join(":");
}

async function ensureRedis() {
  if (!CACHE_ENABLED || !REDIS_URL) {
    return null;
  }

  if (redisReady && redisClient) {
    return redisClient;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    const client = createClient({
      url: REDIS_URL,
      socket: {
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      },
    });

    client.on("error", (error) => {
      redisReady = false;
      console.warn("Redis client error", error instanceof Error ? error.message : "Unknown error");
    });

    try {
      await client.connect();
      redisClient = client;
      redisReady = true;
      console.log("Redis cache connected.");
      return client;
    } catch (error) {
      redisClient = null;
      redisReady = false;
      console.warn(
        "Redis cache connection failed.",
        error instanceof Error ? error.message : "Unknown error",
      );
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

export async function cacheGetJson(key) {
  const client = await ensureRedis();
  if (!client) {
    return null;
  }

  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Redis GET failed for key:", key);
    console.warn(error instanceof Error ? error.message : "Unknown Redis GET error");
    return null;
  }
}

export async function cacheSetJson(key, value, ttlSeconds) {
  const client = await ensureRedis();
  if (!client) {
    return;
  }

  try {
    await client.set(key, JSON.stringify(value), { EX: Math.max(1, Math.floor(ttlSeconds)) });
  } catch (error) {
    console.warn("Redis SET failed for key:", key);
    console.warn(error instanceof Error ? error.message : "Unknown Redis SET error");
  }
}

export async function cacheDeleteKey(key) {
  const client = await ensureRedis();
  if (!client) {
    return;
  }

  try {
    await client.del(key);
  } catch (error) {
    console.warn("Redis DEL failed for key:", key);
    console.warn(error instanceof Error ? error.message : "Unknown Redis DEL error");
  }
}

export async function closeRedisCache() {
  if (!redisClient) {
    return;
  }

  try {
    await redisClient.quit();
  } catch {
    // Ignore shutdown errors.
  } finally {
    redisClient = null;
    redisReady = false;
  }
}
