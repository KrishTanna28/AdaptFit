/**
 * routes.js  (updated)
 *
 * Two changes from the original:
 *
 * 1. loadStepsForRanges() reads pre-aggregated Firestore collections for
 *    weekly / monthly / yearly ranges instead of summing daily logs.
 *
 * 2. A new upsertStepLog() helper mirrors the client-side logic: it reads
 *    the existing daily doc, computes step/goal deltas, and applies them
 *    to weeklyStepLogs / monthlyStepLogs / yearlyStepLogs in the same batch.
 *    Call this whenever the server needs to write a step count (e.g. if you
 *    add a server-side sync endpoint in the future).
 *
 * CACHE_SCHEMA_VERSION is bumped to "v3" so stale Redis entries with the
 * old per-day-summing output are not returned to clients.
 */

import express from "express";

import { getCoachFirestore, verifyCoachIdToken } from "../coach/firebaseAdmin.js";
import {
  buildCacheKey,
  getCachedJson as cacheGetJson,
  setCachedJson as cacheSetJson,
} from "../cache/cacheManager.js";
import { loadCoachContextForSources } from "../ai/retrieval/contextQueries.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HOME_SUMMARY_TTL_SECONDS = toPositiveInt(process.env.REDIS_HOME_TTL_SECONDS, 180);
const STEP_HISTORY_CURRENT_TTL_SECONDS = toPositiveInt(
  process.env.REDIS_STEP_HISTORY_CURRENT_TTL_SECONDS,
  300,
);
const STEP_HISTORY_ARCHIVE_TTL_SECONDS = toPositiveInt(
  process.env.REDIS_STEP_HISTORY_ARCHIVE_TTL_SECONDS,
  86400,
);
const CACHE_SCHEMA_VERSION = "v3"; // bumped: key format changed for weekly/monthly/yearly

const CHUNK_SIZE = {
  days: 7,
  weeks: 6,
  months: 6,
  years: 3,
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

/** Parse "YYYY-MM-DD" → Date, or null for malformed keys. */
function parseDateKey(dateKey) {
  const parts = String(dateKey ?? "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p) || p <= 0)) {
    return null;
  }
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setHours(0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Aggregated-key helpers (must stay in sync with aggregatedStepLog.ts) ─────

function isoWeekNumber(date) {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function toWeekKey(date) {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const isoYear = tmp.getUTCFullYear();
  return `${isoYear}-W${String(isoWeekNumber(date)).padStart(2, "0")}`;
}

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toYearKey(date) {
  return String(date.getFullYear());
}

function aggregatedCollectionName(granularity) {
  return granularity === "weekly"
    ? "weeklyStepLogs"
    : granularity === "monthly"
      ? "monthlyStepLogs"
      : "yearlyStepLogs";
}

// ─── Date / range helpers ─────────────────────────────────────────────────────

function buildRecentDateKeys(count, now = new Date()) {
  const out = [];
  const base = startOfDay(now);
  for (let offset = 0; offset < count; offset += 1) {
    out.push(toDateKey(addDays(base, -offset)));
  }
  return out;
}

function getWeekStart(date) {
  const base = startOfDay(date);
  const day = base.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(base, diffToMonday);
}

function getEffectiveTargetDays(rangeStart, rangeEnd, now) {
  const effectiveEnd = rangeEnd > now ? now : rangeEnd;
  const diff = Math.max(0, effectiveEnd.getTime() - rangeStart.getTime());
  return Math.max(1, Math.ceil(diff / MS_PER_DAY));
}

function buildDayLabel(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "2-digit",
  }).format(date);
}

// ─── Range builders ───────────────────────────────────────────────────────────

function buildDailyRanges({ endDate, count, dailyGoal, offset = 0 }) {
  const anchor = addDays(startOfDay(endDate), -(offset * count));
  const ranges = [];
  for (let i = 0; i < count; i += 1) {
    const day = addDays(anchor, -i);
    const start = startOfDay(day);
    ranges.push({
      key: toDateKey(day),
      label: buildDayLabel(day),
      start,
      end: addDays(start, 1),
      target: Math.max(0, Math.round(dailyGoal)),
    });
  }
  return ranges;
}

function buildWeeklyRanges({ endDate, count, dailyGoal, offset = 0 }) {
  const anchorWeekStart = addDays(getWeekStart(endDate), -(offset * count * 7));
  const ranges = [];
  for (let i = 0; i < count; i += 1) {
    const start = addDays(anchorWeekStart, -(i * 7));
    ranges.push({
      key: toWeekKey(start),        // "YYYY-WNN"
      label: buildDayLabel(start),
      start,
      end: addDays(start, 7),
      target: Math.max(0, Math.round(dailyGoal)) * 7,
    });
  }
  return ranges;
}

function buildMonthlyRanges({ endDate, count, dailyGoal, offset = 0 }) {
  const anchor = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  anchor.setMonth(anchor.getMonth() - offset * count);
  const ranges = [];
  for (let i = 0; i < count; i += 1) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const daysInMonth = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
    ranges.push({
      key: toMonthKey(start),       // "YYYY-MM"
      label: buildDayLabel(start),
      start,
      end,
      target: Math.max(0, Math.round(dailyGoal)) * daysInMonth,
    });
  }
  return ranges;
}

function buildYearlyRanges({ endDate, count, dailyGoal, offset = 0 }) {
  const anchorYear = endDate.getFullYear() - offset * count;
  const ranges = [];
  for (let i = 0; i < count; i += 1) {
    const year = anchorYear - i;
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const daysInYear = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
    ranges.push({
      key: toYearKey(start),        // "YYYY"
      label: String(year),
      start,
      end,
      target: Math.max(0, Math.round(dailyGoal)) * daysInYear,
    });
  }
  return ranges;
}

function normalizeRange(value) {
  return value === "weeks" || value === "months" || value === "years"
    ? value
    : "days";
}

// ─── Auth middleware (unchanged) ──────────────────────────────────────────────

function parseBearerToken(authorizationHeader) {
  const header = String(authorizationHeader ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

async function requireHomeUser(req, res, next) {
  try {
    const idToken = parseBearerToken(req.headers.authorization);
    if (!idToken) return res.status(401).json({ message: "Missing auth token." });

    const decoded = await verifyCoachIdToken(idToken);
    req.homeUser = {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : null,
    };
    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired auth token.",
      detail: error instanceof Error ? error.message : "Auth verification failed.",
    });
  }
}

// ─── Daily stepLog helpers ────────────────────────────────────────────────────

function normalizeStepLog(raw, dateKey) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    dateKey,
    steps: Math.max(0, Math.round(toNumber(source.steps, 0))),
    goal: Math.max(0, Math.round(toNumber(source.goal, 0))),
    source: typeof source.source === "string" ? source.source : "none",
    loggedAt: typeof source.loggedAt === "string" ? source.loggedAt : null,
  };
}

async function loadStepLogs(db, uid, dateKeys) {
  const uniqueKeys = Array.from(new Set(dateKeys.filter(Boolean)));
  const docs = await Promise.all(
    uniqueKeys.map((dateKey) =>
      db.collection("users").doc(uid).collection("stepLogs").doc(dateKey).get(),
    ),
  );
  const byKey = new Map();
  docs.forEach((snapshot, index) => {
    if (snapshot.exists) {
      byKey.set(uniqueKeys[index], normalizeStepLog(snapshot.data(), uniqueKeys[index]));
    }
  });
  return byKey;
}

/**
 * Server-side equivalent of the client upsertDailyStepLog().
 * Reads the old daily doc, computes deltas, then commits a single batch:
 *   1 daily write + 3 aggregated increments.
 *
 * Use this whenever the server needs to write step data (e.g. a future
 * server-side sync endpoint). The home-summary route currently builds daily
 * ranges only from existing logs, so this helper is available but not yet
 * wired to an HTTP handler.
 */
async function upsertStepLog(db, uid, dateKey, { steps, goal, source, loggedAt }) {
  const date = parseDateKey(dateKey);

  const newPayload = {
    dateKey,
    steps: Math.max(0, Math.round(toNumber(steps, 0))),
    goal: Math.max(0, Math.round(toNumber(goal, 0))),
    source: source ?? "none",
    loggedAt: loggedAt ?? new Date().toISOString(),
  };

  const userRef = db.collection("users").doc(uid);
  const dailyRef = userRef.collection("stepLogs").doc(dateKey);

  // Read existing daily doc to compute deltas
  const existingSnap = await dailyRef.get();
  const existing = existingSnap.exists
    ? normalizeStepLog(existingSnap.data(), dateKey)
    : null;

  const stepsDelta = newPayload.steps - (existing?.steps ?? 0);
  const goalDelta = newPayload.goal - (existing?.goal ?? 0);

  const batch = db.batch();

  // Daily write
  batch.set(dailyRef, { ...newPayload, updatedAt: new Date() }, { merge: true });

  // Aggregated writes (only when date parses and there's a real change)
  if (date && (stepsDelta !== 0 || goalDelta !== 0 || !existing)) {
    const aggUpdate = {
      steps: db.FieldValue.increment(stepsDelta),
      goal: db.FieldValue.increment(goalDelta),
      updatedAt: new Date(),
    };

    batch.set(
      userRef.collection("weeklyStepLogs").doc(toWeekKey(date)),
      { periodKey: toWeekKey(date), ...aggUpdate },
      { merge: true },
    );
    batch.set(
      userRef.collection("monthlyStepLogs").doc(toMonthKey(date)),
      { periodKey: toMonthKey(date), ...aggUpdate },
      { merge: true },
    );
    batch.set(
      userRef.collection("yearlyStepLogs").doc(toYearKey(date)),
      { periodKey: toYearKey(date), ...aggUpdate },
      { merge: true },
    );
  }

  await batch.commit();
}

// ─── Aggregated-collection read helper ───────────────────────────────────────

function normalizeAggregatedLog(raw, periodKey) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    periodKey,
    steps: Math.max(0, Math.round(toNumber(source.steps, 0))),
    goal: Math.max(0, Math.round(toNumber(source.goal, 0))),
  };
}

async function loadAggregatedLogs(db, uid, granularity, periodKeys) {
  const uniqueKeys = Array.from(new Set(periodKeys.filter(Boolean)));
  if (uniqueKeys.length === 0) return new Map();

  const collName = aggregatedCollectionName(granularity);
  const docs = await Promise.all(
    uniqueKeys.map((key) =>
      db.collection("users").doc(uid).collection(collName).doc(key).get(),
    ),
  );

  const byKey = new Map();
  docs.forEach((snapshot, index) => {
    if (snapshot.exists) {
      byKey.set(
        uniqueKeys[index],
        normalizeAggregatedLog(snapshot.data(), uniqueKeys[index]),
      );
    }
  });
  return byKey;
}

// ─── Step serialiser ──────────────────────────────────────────────────────────

function serializeStepPoint(point) {
  return {
    ...point,
    start: point.start instanceof Date ? point.start.toISOString() : point.start,
    end: point.end instanceof Date ? point.end.toISOString() : point.end,
  };
}

// ─── Unified range loader ─────────────────────────────────────────────────────

async function loadStepsForRanges(db, uid, ranges) {
  if (ranges.length === 0) return [];

  const now = new Date();
  const { start: s0, end: e0 } = ranges[0];
  const days0 = Math.round((e0.getTime() - s0.getTime()) / MS_PER_DAY);
  const granularity =
    days0 <= 1 ? "daily" : days0 <= 7 ? "weekly" : days0 <= 31 ? "monthly" : "yearly";

  // ── Daily: read from stepLogs (unchanged) ──────────────────────────────────
  if (granularity === "daily") {
    const logsByKey = await loadStepLogs(db, uid, ranges.map((r) => r.key));

    return ranges.map((range) => {
      const rangeEnd = range.end > now ? now : range.end;
      const targetDays = getEffectiveTargetDays(range.start, rangeEnd, now);
      const adjustedTarget = Math.max(0, Math.round(range.target * targetDays));
      const log = logsByKey.get(range.key);
      const target =
        log?.goal > 0 ? Math.max(0, Math.round(log.goal)) : adjustedTarget;
      const steps = Math.max(0, Math.round(log?.steps ?? 0));
      return serializeStepPoint({
        ...range,
        steps,
        target,
        isGoalMet: steps >= target,
      });
    });
  }

  // ── Weekly / Monthly / Yearly: read from aggregated collections ────────────
  const logsByKey = await loadAggregatedLogs(
    db,
    uid,
    granularity,
    ranges.map((r) => r.key),
  );

  return ranges.map((range) => {
    const rangeEnd = range.end > now ? now : range.end;
    const fullRangeDays = Math.max(
      1,
      Math.round((range.end.getTime() - range.start.getTime()) / MS_PER_DAY),
    );
    const targetDays = getEffectiveTargetDays(range.start, rangeEnd, now);
    const dailyGoal = range.target / fullRangeDays;
    const fallbackTarget = Math.max(0, Math.round(dailyGoal * targetDays));

    const log = logsByKey.get(range.key);
    const steps = log ? Math.max(0, log.steps) : 0;
    const target = log && log.goal > 0 ? Math.max(0, log.goal) : fallbackTarget;

    return serializeStepPoint({
      ...range,
      steps,
      target,
      isGoalMet: steps >= target,
    });
  });
}

// ─── Home summary helpers (unchanged) ────────────────────────────────────────

function normalizeDailyGoal(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function getWorkoutEntriesForDate(context, dateKey) {
  const day = context.workouts.entriesByDay.find((e) => e.dateKey === dateKey);
  return Array.isArray(day?.entries) ? day.entries : [];
}

function getLifestyleLogForDate(context, dateKey) {
  const day = context.lifestyle.entriesByDay.find((e) => e.dateKey === dateKey);
  return (
    day?.log ?? {
      dateKey,
      hydration: { intakeMl: 0, goalMl: 2500, updatedAt: null },
      weather: {
        locationName: "",
        temperatureC: null,
        humidityPercent: null,
        condition: "mild",
        fetchedAt: null,
      },
      recovery: {
        sleepHours: null,
        sleepQuality: null,
        stressLevel: null,
        notes: "",
        loggedAt: null,
      },
    }
  );
}

function buildWorkoutStreak(context) {
  const byDate = new Map(
    context.workouts.entriesByDay.map((day) => [
      day.dateKey,
      Array.isArray(day.entries) ? day.entries : [],
    ]),
  );
  const dateKeys = buildRecentDateKeys(365);
  const logsToCount = byDate.get(dateKeys[0])?.length ? dateKeys : dateKeys.slice(1);
  let streak = 0;
  for (const dateKey of logsToCount) {
    if ((byDate.get(dateKey)?.length ?? 0) > 0) streak += 1;
    else break;
  }
  return streak;
}

async function buildStepGoalStreak(db, uid, dailyGoal, context) {
  const dateKeys = buildRecentDateKeys(365);
  const logsByKey = await loadStepLogs(db, uid, dateKeys);
  const fallbackGoal = Math.max(0, Math.round(dailyGoal || context.stepGoal || 0));

  const isGoalMetForDate = (dateKey) => {
    const log = logsByKey.get(dateKey);
    if (!log) return false;
    const target = Math.max(0, Math.round(log.goal > 0 ? log.goal : fallbackGoal));
    return target > 0 && Math.max(0, Math.round(log.steps)) >= target;
  };

  const logsToCount = isGoalMetForDate(dateKeys[0]) ? dateKeys : dateKeys.slice(1);
  let streak = 0;
  for (const dateKey of logsToCount) {
    if (isGoalMetForDate(dateKey)) streak += 1;
    else break;
  }
  return streak;
}

async function buildHomeSummary(db, uid, dailyGoal) {
  const context = await loadCoachContextForSources(db, uid, {
    windowDays: 30,
    sources: ["profile", "nutrition", "workouts", "lifestyle", "steps"],
  });
  const todayKey = context.currentDateKey;
  const workoutEntries = getWorkoutEntriesForDate(context, todayKey);
  const stepRanges = buildDailyRanges({
    endDate: new Date(),
    count: CHUNK_SIZE.days,
    dailyGoal: dailyGoal || context.stepGoal || 0,
  });
  const stepHistory = await loadStepsForRanges(db, uid, stepRanges);
  const stepGoalStreak = await buildStepGoalStreak(db, uid, dailyGoal, context);

  return {
    generatedAt: new Date().toISOString(),
    dateKey: todayKey,
    caloriesIntake: Math.round(context.recency.nutritionCaloriesToday || 0),
    workoutCaloriesBurned: Math.round(context.recency.workoutActiveCaloriesToday || 0),
    workoutEntries,
    lifestyleLog: getLifestyleLogForDate(context, todayKey),
    profileWeightKg: context.profile.weightKg ?? null,
    stepGoalStreak,
    workoutStreak: buildWorkoutStreak(context),
    stepHistory,
    cacheSource: "redis-miss",
  };
}

// ─── Route mounting ───────────────────────────────────────────────────────────

export function mountHomeRoutes(app) {
  const router = express.Router();

  router.get("/summary", requireHomeUser, async (req, res) => {
    try {
      const uid = req.homeUser.uid;
      const dailyGoal = normalizeDailyGoal(req.query.dailyGoal);
      const dateKey = toDateKey(new Date());
      const cacheKey = buildCacheKey(
        [CACHE_SCHEMA_VERSION, "summary", uid, dateKey, String(dailyGoal)],
        "home",
      );

      if (req.query.forceRefresh !== "true") {
        const cached = await cacheGetJson(cacheKey);
        if (cached) {
          res.set("X-Home-Cache", "HIT");
          return res.json({ ...cached, cacheSource: "redis-hit" });
        }
      }

      const db = getCoachFirestore();
      const payload = await buildHomeSummary(db, uid, dailyGoal);
      await cacheSetJson(cacheKey, payload, HOME_SUMMARY_TTL_SECONDS);

      res.set("X-Home-Cache", "MISS");
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        message: "Home summary failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/steps-history", requireHomeUser, async (req, res) => {
    try {
      const uid = req.homeUser.uid;
      const range = normalizeRange(req.query.range);
      const offset = Math.max(0, toPositiveInt(req.query.offset, 0));
      const count = Math.max(
        1,
        Math.min(toPositiveInt(req.query.count, CHUNK_SIZE[range]), 24),
      );
      const dailyGoal = normalizeDailyGoal(req.query.dailyGoal);
      const dateKey = toDateKey(new Date());
      const cacheKey = buildCacheKey(
        [
          CACHE_SCHEMA_VERSION,
          "steps-history",
          uid,
          range,
          String(offset),
          String(count),
          String(dailyGoal),
          dateKey,
        ],
        "home",
      );

      const cached = await cacheGetJson(cacheKey);
      if (cached) {
        res.set("X-Steps-Cache", "HIT");
        return res.json({ ...cached, cacheSource: "redis-hit" });
      }

      const now = new Date();
      const ranges =
        range === "days"
          ? buildDailyRanges({ endDate: now, count, dailyGoal, offset })
          : range === "weeks"
            ? buildWeeklyRanges({ endDate: now, count, dailyGoal, offset })
            : range === "months"
              ? buildMonthlyRanges({ endDate: now, count, dailyGoal, offset })
              : buildYearlyRanges({ endDate: now, count, dailyGoal, offset });

      const db = getCoachFirestore();
      const points = await loadStepsForRanges(db, uid, ranges);
      const payload = {
        range,
        offset,
        count,
        dailyGoal,
        points,
        generatedAt: new Date().toISOString(),
        cacheSource: "redis-miss",
      };
      const ttl =
        offset === 0
          ? STEP_HISTORY_CURRENT_TTL_SECONDS
          : STEP_HISTORY_ARCHIVE_TTL_SECONDS;
      await cacheSetJson(cacheKey, payload, ttl);

      res.set("X-Steps-Cache", "MISS");
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({
        message: "Step history failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.use("/api/home", router);
}