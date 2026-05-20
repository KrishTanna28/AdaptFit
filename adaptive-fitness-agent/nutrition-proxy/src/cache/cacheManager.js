import {
  buildCacheKey,
  cacheDeleteKey,
  cacheGetJson,
  cacheSetJson,
} from "../redisCache.js";
import {
  deleteMemoryCacheKey,
  getMemoryCacheJson,
  setMemoryCacheJson,
} from "./memoryCache.js";
import { observeCache } from "../observability/metrics.js";

export { buildCacheKey };

export async function getCachedJson(key, options = {}) {
  const namespace = options.namespace ?? "app";
  const memoryValue = getMemoryCacheJson(key);
  if (memoryValue !== null) {
    observeCache({ layer: "memory", outcome: "hit", namespace });
    return memoryValue;
  }

  observeCache({ layer: "memory", outcome: "miss", namespace });
  const redisValue = await cacheGetJson(key);
  if (redisValue !== null) {
    observeCache({ layer: "redis", outcome: "hit", namespace });
    setMemoryCacheJson(key, redisValue, options.memoryTtlSeconds ?? options.ttlSeconds ?? 60);
    return redisValue;
  }

  observeCache({ layer: "redis", outcome: "miss", namespace });
  return null;
}

export async function setCachedJson(key, value, ttlSeconds, options = {}) {
  const namespace = options.namespace ?? "app";
  setMemoryCacheJson(key, value, options.memoryTtlSeconds ?? ttlSeconds);
  observeCache({ layer: "memory", outcome: "set", namespace });
  await cacheSetJson(key, value, ttlSeconds);
  observeCache({ layer: "redis", outcome: "set", namespace });
}

export async function deleteCachedJson(key, options = {}) {
  const namespace = options.namespace ?? "app";
  deleteMemoryCacheKey(key);
  observeCache({ layer: "memory", outcome: "delete", namespace });
  await cacheDeleteKey(key);
  observeCache({ layer: "redis", outcome: "delete", namespace });
}

