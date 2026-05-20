import { LRUCache } from "lru-cache";

const DEFAULT_MAX_ITEMS = Number(process.env.MEMORY_CACHE_MAX_ITEMS ?? 500);
const DEFAULT_TTL_MS = Number(process.env.MEMORY_CACHE_TTL_MS ?? 60_000);

const memoryCache = new LRUCache({
  max: Number.isFinite(DEFAULT_MAX_ITEMS) && DEFAULT_MAX_ITEMS > 0 ? DEFAULT_MAX_ITEMS : 500,
  ttl: Number.isFinite(DEFAULT_TTL_MS) && DEFAULT_TTL_MS > 0 ? DEFAULT_TTL_MS : 60_000,
});

export function getMemoryCacheJson(key) {
  return memoryCache.get(key) ?? null;
}

export function setMemoryCacheJson(key, value, ttlSeconds) {
  memoryCache.set(key, value, {
    ttl: Math.max(1, Math.floor(Number(ttlSeconds) || 1)) * 1000,
  });
}

export function deleteMemoryCacheKey(key) {
  memoryCache.delete(key);
}

export function memoryCacheStats() {
  return {
    size: memoryCache.size,
    calculatedSize: memoryCache.calculatedSize,
    max: memoryCache.max,
  };
}

