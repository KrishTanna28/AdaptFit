import { Pedometer } from "expo-sensors";
import { getTodayDateKey } from "./helperFunctions";
import {
  loadDailyStepLogs,
  upsertDailyStepLog,
  type DailyStepLog,
} from "./stepLog";

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

function buildDateKeysBetween(rangeStart: Date, rangeEnd: Date) {
  const keys: string[] = [];
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  for (let cursor = start; cursor < end; cursor = addDays(cursor, 1)) {
    keys.push(getTodayDateKey(cursor));
  }
  return keys;
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
    const end = addDays(start, 1);
    ranges.push({
      key: getTodayDateKey(day),
      label: buildDayLabel(day),
      start,
      end,
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
    const end = addDays(start, 7);
    ranges.push({
      key: getTodayDateKey(start),
      label: buildDayLabel(start),
      start,
      end,
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
    const daysInMonth = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);

    ranges.push({
      key: getTodayDateKey(start),
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

export async function loadStepsForRanges(
  ranges: StepRange[],
  options: LoadStepsOptions = {},
): Promise<StepHistoryPoint[]> {
  const now = new Date();
  const savedLogsByKey: Record<string, DailyStepLog> = {};

  if (options.uid) {
    const dateKeys = new Set<string>();

    ranges.forEach((range) => {
      const rangeEnd = range.end > now ? now : range.end;
      const fullRangeDays = Math.max(
        1,
        Math.round((range.end.getTime() - range.start.getTime()) / MS_PER_DAY),
      );
      const isDailyRange = fullRangeDays === 1;

      if (isDailyRange) {
        dateKeys.add(range.key);
        return;
      }

      buildDateKeysBetween(range.start, rangeEnd).forEach((key) => dateKeys.add(key));
    });

    const savedLogs = await loadDailyStepLogs(options.uid, Array.from(dateKeys));

    savedLogs.forEach((log) => {
      if (log) {
        savedLogsByKey[log.dateKey] = log;
      }
    });
  }

  return Promise.all(
    ranges.map(async (range) => {
      const rangeStart = range.start;
      const rangeEnd = range.end > now ? now : range.end;
      const targetDays = getEffectiveTargetDays(rangeStart, rangeEnd, now);
      const fullRangeDays = Math.max(
        1,
        Math.round((range.end.getTime() - range.start.getTime()) / MS_PER_DAY),
      );
      const dailyGoal = range.target / fullRangeDays;
      let adjustedTarget = Math.max(0, Math.round(dailyGoal * targetDays));
      const isDailyRange = fullRangeDays === 1;
      const savedLog =
        options.uid && isDailyRange ? savedLogsByKey[range.key] : undefined;

      if (savedLog) {
        const savedGoal = Math.max(0, Math.round(savedLog.goal));
        if (savedGoal > 0) {
          adjustedTarget = savedGoal;
        }

        const steps = Math.max(0, Math.round(savedLog.steps));
        return {
          ...range,
          steps,
          target: adjustedTarget,
          isGoalMet: steps >= adjustedTarget,
        };
      }

      if (rangeEnd <= rangeStart) {
        return {
          ...range,
          steps: 0,
          target: adjustedTarget,
          isGoalMet: false,
        };
      }

      if (options.uid && !isDailyRange) {
        const dateKeys = buildDateKeysBetween(rangeStart, rangeEnd);
        let stepsSum = 0;
        let targetSum = 0;
        let hasLog = false;

        dateKeys.forEach((key) => {
          const log = savedLogsByKey[key];
          if (log) {
            hasLog = true;
            stepsSum += Math.max(0, Math.round(log.steps));
          }
          const goalValue = log && log.goal > 0 ? log.goal : dailyGoal;
          targetSum += Math.max(0, Math.round(goalValue));
        });

        if (hasLog) {
          const steps = Math.max(0, Math.round(stepsSum));
          const target = Math.max(0, Math.round(targetSum));
          return {
            ...range,
            steps,
            target,
            isGoalMet: steps >= target,
          };
        }
      }

      try {
        const result = await Pedometer.getStepCountAsync(rangeStart, rangeEnd);
        const steps = Math.max(0, Math.round(result.steps));

        if (options.uid && isDailyRange && options.saveMissing !== false) {
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
