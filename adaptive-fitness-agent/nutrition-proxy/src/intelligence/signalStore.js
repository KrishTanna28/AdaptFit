import { buildCacheKey, getCachedJson, setCachedJson } from "../cache/cacheManager.js";
import { SignalPacketSchema } from "../schemas/signals.js";
import { safeValidate, validateOrThrow } from "../schemas/validators.js";
import { logger } from "../observability/logger.js";

const SIGNAL_STATE_COLLECTION = "intelligence";
const SIGNAL_STATE_DOC = "signalState";
const SIGNAL_CACHE_TTL_SECONDS = Number(process.env.SIGNAL_CACHE_TTL_SECONDS ?? 5 * 60);

export function signalCacheKey(uid, windowDays = 30) {
  return buildCacheKey(["signal-state", uid, String(windowDays)], "intelligence");
}

function signalStateRef(db, uid) {
  return db.collection("users").doc(uid).collection(SIGNAL_STATE_COLLECTION).doc(SIGNAL_STATE_DOC);
}

export async function loadSignalState(db, uid, options = {}) {
  const windowDays = options.windowDays ?? 30;
  const cacheKey = signalCacheKey(uid, windowDays);
  const cached = await getCachedJson(cacheKey, { namespace: "intelligence", ttlSeconds: SIGNAL_CACHE_TTL_SECONDS });
  const cachedValidation = cached ? safeValidate(SignalPacketSchema, cached.signalPacket ?? cached, "cached signal state") : null;
  if (cachedValidation?.ok) {
    return {
      signalPacket: cachedValidation.data,
      signature: cached?.signature ?? null,
      cacheSource: "cache-hit",
    };
  }

  const snapshot = await signalStateRef(db, uid).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() ?? {};
  const validation = safeValidate(SignalPacketSchema, data.signalPacket, "stored signal state");
  if (!validation.ok) {
    logger.warn({ uid, detail: validation.detail }, "Stored signal packet is invalid.");
    return null;
  }

  const state = {
    signalPacket: validation.data,
    signature: typeof data.signature === "string" ? data.signature : null,
    cacheSource: "firestore",
  };

  await setCachedJson(cacheKey, state, SIGNAL_CACHE_TTL_SECONDS, { namespace: "intelligence" });
  return state;
}

export async function saveSignalState(db, uid, state, options = {}) {
  const signalPacket = validateOrThrow(SignalPacketSchema, state.signalPacket, "signal packet");
  const payload = {
    signalPacket,
    signature: state.signature,
    reason: state.reason ?? "manual",
    updatedAt: new Date().toISOString(),
    schemaVersion: signalPacket.version,
  };

  await signalStateRef(db, uid).set(payload, { merge: true });
  await setCachedJson(
    signalCacheKey(uid, options.windowDays ?? 30),
    {
      signalPacket,
      signature: state.signature,
      cacheSource: "write-through",
    },
    SIGNAL_CACHE_TTL_SECONDS,
    { namespace: "intelligence" },
  );

  return payload;
}

