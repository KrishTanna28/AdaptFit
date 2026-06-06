/**
 * stepHistory.ts  (updated)
 *
 * loadStepsForRanges() now reads pre-aggregated Firestore docs for weekly,
 * monthly, and yearly ranges. Daily ranges are unchanged.
 *
 * The aggregated docs are kept current by upsertDailyStepLog() in stepLog.ts.
 */

import { Pedometer } from "expo-sensors";
import { getTodayDateKey } from "./helperFunctions";
import {
  loadDailyStepLogs,
  upsertDailyStepLog,
  type DailyStepLog,
} from "./stepLog";
import {
  loadWeeklyStepLogs,
  loadMonthlyStepLogs,
  loadYearlyStepLogs,
  toWeekKey,
  toMonthKey,
  toYearKey,
  type AggregatedStepLog,
} from "./aggregatedStepLog";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type StepRange = {
  key: string;
  label: string;
  start: Date;
  end: Date;
  target: number;
};

export type StepHistoryPoint = StepRange & {
  steps: number;
  isGoalMet: boolean;
};

type LoadStepsOptions = {
  uid?: string;
  saveMissing?: boolean;
};

// ─── Date helpers (unchanged) ─────────────────────────────────────────────────

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekStart(date: Date) {
  const base = startOfDay(date);
  const day = base.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(base, diffToMonday);
}

function getEffectiveTargetDays(rangeStart: Date, rangeEnd: Date, now: Date) {
  const effectiveEnd = rangeEnd > now ? now : rangeEnd;
  const diff = Math.max(0, effectiveEnd.getTime() - rangeStart.getTime());
  return Math.max(1, Math.ceil(diff / MS_PER_DAY));
}

function buildDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "2-digit",
  }).format(date);
}

// ─── Range builders ───────────────────────────────────────────────────────────

export function buildDailyRanges(input: {
  endDate: Date;
  count: number;
  dailyGoal: number;
  offset?: number;
}): StepRange[] {
  const { endDate, count, dailyGoal, offset = 0 } = input;
  const anchor = addDays(startOfDay(endDate), -(offset * count));
  const ranges: StepRange[] = [];

  for (let i = 0; i < count; i += 1) {
    const day = addDays(anchor, -i);
    const start = startOfDay(day);
    ranges.push({
      key: getTodayDateKey(day),
      label: buildDayLabel(day),
      start,
      end: addDays(start, 1),
      target: Math.max(0, Math.round(dailyGoal)),
    });
  }
  return ranges;
}

export function buildWeeklyRanges(input: {
  endDate: Date;
  count: number;
  dailyGoal: number;
  offset?: number;
}): StepRange[] {
  const { endDate, count, dailyGoal, offset = 0 } = input;
  const anchorWeekStart = addDays(getWeekStart(endDate), -(offset * count * 7));
  const ranges: StepRange[] = [];

  for (let i = 0; i < count; i += 1) {
    const start = addDays(anchorWeekStart, -(i * 7));
    ranges.push({
      key: toWeekKey(start),        // "YYYY-WNN" — matches the aggregated doc ID
      label: buildDayLabel(start),
      start,
      end: addDays(start, 7),
      target: Math.max(0, Math.round(dailyGoal)) * 7,
    });
  }
  return ranges;
}

export function buildMonthlyRanges(input: {
  endDate: Date;
  count: number;
  dailyGoal: number;
  offset?: number;
}): StepRange[] {
  const { endDate, count, dailyGoal, offset = 0 } = input;
  const anchor = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  anchor.setMonth(anchor.getMonth() - offset * count);
  const ranges: StepRange[] = [];

  for (let i = 0; i < count; i += 1) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const daysInMonth = Math.round(
      (end.getTime() - start.getTime()) / MS_PER_DAY,
    );
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

export function buildYearlyRanges(input: {
  endDate: Date;
  count: number;
  dailyGoal: number;
  offset?: number;
}): StepRange[] {
  const { endDate, count, dailyGoal, offset = 0 } = input;
  const anchorYear = endDate.getFullYear() - offset * count;
  const ranges: StepRange[] = [];

  for (let i = 0; i < count; i += 1) {
    const year = anchorYear - i;
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const daysInYear = Math.round(
      (end.getTime() - start.getTime()) / MS_PER_DAY,
    );
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

// ─── Granularity detection ────────────────────────────────────────────────────

function detectGranularity(
  ranges: StepRange[],
): "daily" | "weekly" | "monthly" | "yearly" {
  if (ranges.length === 0) return "daily";
  const days = Math.round(
    (ranges[0].end.getTime() - ranges[0].start.getTime()) / MS_PER_DAY,
  );
  if (days <= 1) return "daily";
  if (days <= 7) return "weekly";
  if (days <= 31) return "monthly";
  return "yearly";
}

// ─── Aggregated → StepHistoryPoint ───────────────────────────────────────────

function pointFromAggregatedLog(
  range: StepRange,
  log: AggregatedStepLog | undefined,
  now: Date,
): StepHistoryPoint {
  const rangeEnd = range.end > now ? now : range.end;
  const fullRangeDays = Math.max(
    1,
    Math.round((range.end.getTime() - range.start.getTime()) / MS_PER_DAY),
  );
  const targetDays = getEffectiveTargetDays(range.start, rangeEnd, now);
  const dailyGoal = range.target / fullRangeDays;
  // Fallback target: prorated to elapsed days (so in-progress periods
  // show a fair target rather than the full-period goal)
  const fallbackTarget = Math.max(0, Math.round(dailyGoal * targetDays));

  const steps = log ? Math.max(0, log.steps) : 0;
  // Prefer the stored goal (sum of per-day goals from real logs).
  // Fall back to the computed target only when no logs exist yet.
  const target = log && log.goal > 0 ? Math.max(0, log.goal) : fallbackTarget;

  return { ...range, steps, target, isGoalMet: steps >= target };
}

// ─── Main loader ──────────────────────────────────────────────────────────────

export async function loadStepsForRanges(
  ranges: StepRange[],
  options: LoadStepsOptions = {},
): Promise<StepHistoryPoint[]> {
  const now = new Date();

  if (ranges.length === 0) return [];

  const granularity = detectGranularity(ranges);

  // ── Daily: pedometer + daily stepLogs (unchanged) ─────────────────────────
  if (granularity === "daily") {
    return loadDailyPoints(ranges, options, now);
  }

  // ── Weekly / Monthly / Yearly: read from pre-aggregated collections ────────
  if (!options.uid) {
    // No uid → can't hit Firestore; return zeroed points so chart renders empty
    return ranges.map((range) => ({
      ...range,
      steps: 0,
      isGoalMet: false,
    }));
  }

  const keys = ranges.map((r) => r.key);
  let logMap: Map<string, AggregatedStepLog>;

  if (granularity === "weekly") {
    logMap = await loadWeeklyStepLogs(options.uid, keys);
  } else if (granularity === "monthly") {
    logMap = await loadMonthlyStepLogs(options.uid, keys);
  } else {
    logMap = await loadYearlyStepLogs(options.uid, keys);
  }

  return ranges.map((range) =>
    pointFromAggregatedLog(range, logMap.get(range.key), now),
  );
}

// ─── Daily loader (extracted, unchanged logic) ────────────────────────────────

async function loadDailyPoints(
  ranges: StepRange[],
  options: LoadStepsOptions,
  now: Date,
): Promise<StepHistoryPoint[]> {
  const savedLogsByKey: Record<string, DailyStepLog> = {};

  if (options.uid) {
    const savedLogs = await loadDailyStepLogs(
      options.uid,
      ranges.map((r) => r.key),
    );
    savedLogs.forEach((log) => {
      if (log) savedLogsByKey[log.dateKey] = log;
    });
  }

  return Promise.all(
    ranges.map(async (range) => {
      const rangeStart = range.start;
      const rangeEnd = range.end > now ? now : range.end;
      const targetDays = getEffectiveTargetDays(rangeStart, rangeEnd, now);
      const adjustedTarget = Math.max(
        0,
        Math.round(range.target * targetDays),
      );
      const savedLog = options.uid ? savedLogsByKey[range.key] : undefined;

      if (savedLog) {
        const savedGoal = Math.max(0, Math.round(savedLog.goal));
        const target = savedGoal > 0 ? savedGoal : adjustedTarget;
        const steps = Math.max(0, Math.round(savedLog.steps));
        return { ...range, steps, target, isGoalMet: steps >= target };
      }

      if (rangeEnd <= rangeStart) {
        return { ...range, steps: 0, target: adjustedTarget, isGoalMet: false };
      }

      try {
        const result = await Pedometer.getStepCountAsync(rangeStart, rangeEnd);
        const steps = Math.max(0, Math.round(result.steps));

        if (options.uid && options.saveMissing !== false) {
          await upsertDailyStepLog(options.uid, range.key, {
            steps,
            goal: adjustedTarget,
            source: "pedometer",
            loggedAt: new Date().toISOString(),
          });
        }

        return {
          ...range,
          steps,
          target: adjustedTarget,
          isGoalMet: steps >= adjustedTarget,
        };
      } catch {
        return {
          ...range,
          steps: 0,
          target: adjustedTarget,
          isGoalMet: false,
        };
      }
    }),
  );
}