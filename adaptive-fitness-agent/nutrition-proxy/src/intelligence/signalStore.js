import { buildCacheKey, getCachedJson, setCachedJson } from "../cache/cacheManager.js";
import { SignalPacketSchema } from "../schemas/signals.js";
import { safeValidate, validateOrThrow } from "../schemas/validators.js";
import { logger } from "../observability/logger.js";

const SIGNAL_STATE_COLLECTION = "intelligence";
const SIGNAL_STATE_DOC = "signalState";
const SIGNAL_CACHE_TTL_SECONDS = Number(process.env.SIGNAL_CACHE_TTL_SECONDS ?? 5 * 60);
const SIGNAL_STATE_MAX_AGE_SECONDS = Number(process.env.SIGNAL_STATE_MAX_AGE_SECONDS ?? 0);

export function signalCacheKey(uid, windowDays = 30) {
  return buildCacheKey(["signal-state", uid, String(windowDays)], "intelligence");
}

function signalStateRef(db, uid) {
  return db.collection("users").doc(uid).collection(SIGNAL_STATE_COLLECTION).doc(SIGNAL_STATE_DOC);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isTooOld(updatedAt) {
  if (!Number.isFinite(SIGNAL_STATE_MAX_AGE_SECONDS) || SIGNAL_STATE_MAX_AGE_SECONDS <= 0) {
    return false;
  }

  const updatedAtMs = Date.parse(String(updatedAt ?? ""));
  if (!Number.isFinite(updatedAtMs)) {
    return true;
  }

  return Date.now() - updatedAtMs > SIGNAL_STATE_MAX_AGE_SECONDS * 1000;
}

function unwrapWindowState(rawState, windowDays) {
  const byWindow = rawState?.windows?.[String(windowDays)];
  if (byWindow && typeof byWindow === "object") {
    return byWindow;
  }

  return rawState;
}

function normalizeLoadedState(rawState, windowDays, source) {
  const candidate = unwrapWindowState(rawState, windowDays);
  const validation = candidate ? safeValidate(SignalPacketSchema, candidate.signalPacket ?? candidate, `${source} signal state`) : null;
  if (!validation?.ok) {
    return null;
  }

  const signalPacket = validation.data;
  if (signalPacket.window?.requestedDays !== windowDays) {
    return null;
  }

  if (signalPacket.currentDateKey !== toDateKey(new Date())) {
    return null;
  }

  if (isTooOld(candidate.updatedAt)) {
    return null;
  }

  return {
    signalPacket,
    signature: candidate.signature ?? null,
    updatedAt: candidate.updatedAt ?? null,
    windowDays,
    cacheSource: source,
  };
}

export async function loadSignalState(db, uid, options = {}) {
  const windowDays = options.windowDays ?? 30;
  const cacheKey = signalCacheKey(uid, windowDays);
  const cached = await getCachedJson(cacheKey, { namespace: "intelligence", ttlSeconds: SIGNAL_CACHE_TTL_SECONDS });
  const cachedState = normalizeLoadedState(cached, windowDays, "cache-hit");
  if (cachedState) {
    return cachedState;
  }

  const snapshot = await signalStateRef(db, uid).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() ?? {};
  const state = normalizeLoadedState(data, windowDays, "firestore");
  if (!state) {
    logger.warn({ uid, windowDays }, "Stored signal packet is missing, stale, or invalid for requested window.");
    return null;
  }

  await setCachedJson(cacheKey, state, SIGNAL_CACHE_TTL_SECONDS, { namespace: "intelligence" });
  return state;
}

export async function saveSignalState(db, uid, state, options = {}) {
  const signalPacket = validateOrThrow(SignalPacketSchema, state.signalPacket, "signal packet");
  const windowDays = options.windowDays ?? signalPacket.window?.requestedDays ?? 30;
  const updatedAt = new Date().toISOString();
  const payload = {
    signalPacket,
    signature: state.signature,
    reason: state.reason ?? "manual",
    updatedAt,
    schemaVersion: signalPacket.version,
    windowDays,
  };

  await signalStateRef(db, uid).set(
    {
      ...payload,
      windows: {
        [String(windowDays)]: payload,
      },
    },
    { merge: true },
  );
  await setCachedJson(
    signalCacheKey(uid, windowDays),
    {
      signalPacket,
      signature: state.signature,
      updatedAt,
      windowDays,
      cacheSource: "write-through",
    },
    SIGNAL_CACHE_TTL_SECONDS,
    { namespace: "intelligence" },
  );

  return payload;
}
