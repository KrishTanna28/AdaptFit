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
const CACHE_SCHEMA_VERSION = "v2";

const CHUNK_SIZE = {
  days: 7,
  weeks: 6,
  months: 6,
  years: 3,
};

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.floor(n);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey) {
  const parts = String(dateKey ?? "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildRecentDateKeys(count, now = new Date()) {
  const out = [];
  const base = startOfDay(now);

  for (let offset = 0; offset < count; offset += 1) {
    out.push(toDateKey(addDays(base, -offset)));
  }

  return out;
}

function buildDateKeysBetween(rangeStart, rangeEnd) {
  const keys = [];
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  for (let cursor = start; cursor < end; cursor = addDays(cursor, 1)) {
    keys.push(toDateKey(cursor));
  }
  return keys;
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
      key: toDateKey(start),
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
      key: toDateKey(start),
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
      key: String(year),
      label: String(year),
      start,
      end,
      target: Math.max(0, Math.round(dailyGoal)) * daysInYear,
    });
  }

  return ranges;
}

function normalizeRange(value) {
  return value === "weeks" || value === "months" || value === "years" ? value : "days";
}

function parseBearerToken(authorizationHeader) {
  const header = String(authorizationHeader ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

async function requireHomeUser(req, res, next) {
  try {
    const idToken = parseBearerToken(req.headers.authorization);
    if (!idToken) {
      return res.status(401).json({ message: "Missing auth token." });
    }

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
      const dateKey = uniqueKeys[index];
      byKey.set(dateKey, normalizeStepLog(snapshot.data(), dateKey));
    }
  });

  return byKey;
}

function serializeStepPoint(point) {
  return {
    ...point,
    start: point.start instanceof Date ? point.start.toISOString() : point.start,
    end: point.end instanceof Date ? point.end.toISOString() : point.end,
  };
}

async function loadStepsForRanges(db, uid, ranges) {
  const now = new Date();
  const dateKeys = new Set();

  ranges.forEach((range) => {
    const rangeEnd = range.end > now ? now : range.end;
    const fullRangeDays = Math.max(
      1,
      Math.round((range.end.getTime() - range.start.getTime()) / MS_PER_DAY),
    );

    if (fullRangeDays === 1) {
      dateKeys.add(range.key);
      return;
    }

    buildDateKeysBetween(range.start, rangeEnd).forEach((key) => dateKeys.add(key));
  });

  const logsByKey = await loadStepLogs(db, uid, Array.from(dateKeys));

  return ranges.map((range) => {
    const rangeStart = range.start;
    const rangeEnd = range.end > now ? now : range.end;
    const targetDays = getEffectiveTargetDays(rangeStart, rangeEnd, now);
    const fullRangeDays = Math.max(
      1,
      Math.round((range.end.getTime() - range.start.getTime()) / MS_PER_DAY),
    );
    const dailyGoal = range.target / fullRangeDays;
    let target = Math.max(0, Math.round(dailyGoal * targetDays));

    if (fullRangeDays === 1) {
      const log = logsByKey.get(range.key);
      if (log?.goal > 0) {
        target = Math.max(0, Math.round(log.goal));
      }
      const steps = Math.max(0, Math.round(log?.steps ?? 0));
      return serializeStepPoint({
        ...range,
        steps,
        target,
        isGoalMet: steps >= target,
      });
    }

    const keys = buildDateKeysBetween(rangeStart, rangeEnd);
    let steps = 0;
    let targetSum = 0;

    keys.forEach((key) => {
      const log = logsByKey.get(key);
      steps += Math.max(0, Math.round(log?.steps ?? 0));
      targetSum += Math.max(0, Math.round(log && log.goal > 0 ? log.goal : dailyGoal));
    });

    target = Math.max(0, Math.round(targetSum || target));
    return serializeStepPoint({
      ...range,
      steps,
      target,
      isGoalMet: steps >= target,
    });
  });
}

function normalizeDailyGoal(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  return Math.round(n);
}

function getWorkoutEntriesForDate(context, dateKey) {
  const day = context.workouts.entriesByDay.find((entry) => entry.dateKey === dateKey);
  return Array.isArray(day?.entries) ? day.entries : [];
}

function getLifestyleLogForDate(context, dateKey) {
  const day = context.lifestyle.entriesByDay.find((entry) => entry.dateKey === dateKey);
  return day?.log ?? {
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
  };
}

function buildWorkoutStreak(context) {
  const byDate = new Map(
    context.workouts.entriesByDay.map((day) => [day.dateKey, Array.isArray(day.entries) ? day.entries : []]),
  );
  const dateKeys = buildRecentDateKeys(365);
  const logsToCount = byDate.get(dateKeys[0])?.length ? dateKeys : dateKeys.slice(1);
  let streak = 0;

  for (const dateKey of logsToCount) {
    if ((byDate.get(dateKey)?.length ?? 0) > 0) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

async function buildStepGoalStreak(db, uid, dailyGoal, context) {
  const dateKeys = buildRecentDateKeys(365);
  const logsByKey = await loadStepLogs(db, uid, dateKeys);
  const fallbackGoal = Math.max(0, Math.round(dailyGoal || context.stepGoal || 0));

  const isGoalMetForDate = (dateKey) => {
    const log = logsByKey.get(dateKey);
    if (!log) {
      return false;
    }

    const target = Math.max(0, Math.round(log.goal > 0 ? log.goal : fallbackGoal));
    return target > 0 && Math.max(0, Math.round(log.steps)) >= target;
  };

  const logsToCount = isGoalMetForDate(dateKeys[0]) ? dateKeys : dateKeys.slice(1);
  let streak = 0;

  for (const dateKey of logsToCount) {
    if (isGoalMetForDate(dateKey)) {
      streak += 1;
    } else {
      break;
    }
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
      const count = Math.max(1, Math.min(toPositiveInt(req.query.count, CHUNK_SIZE[range]), 24));
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
      const ttl = offset === 0 ? STEP_HISTORY_CURRENT_TTL_SECONDS : STEP_HISTORY_ARCHIVE_TTL_SECONDS;
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
