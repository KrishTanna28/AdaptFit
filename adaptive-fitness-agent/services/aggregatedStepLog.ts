/**
 * aggregatedStepLog.ts
 *
 * Two responsibilities:
 *   1. Key builders  – toWeekKey / toMonthKey / toYearKey
 *      Used by both the write path (stepLog.ts) and the read path (stepHistory.ts)
 *      so document IDs are always consistent.
 *
 *   2. Read helpers  – batch-load aggregated docs for the chart.
 *
 * Collections (all under users/{uid}/):
 *   weeklyStepLogs/{YYYY-WNN}   e.g. "2025-W23"
 *   monthlyStepLogs/{YYYY-MM}   e.g. "2025-06"
 *   yearlyStepLogs/{YYYY}       e.g. "2025"
 *
 * Each document shape:
 *   { periodKey: string, steps: number, goal: number, updatedAt: Timestamp }
 *
 * The documents are maintained by upsertDailyStepLog() in stepLog.ts — no
 * Cloud Function or cron is required.
 */

import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { toNumber, toText } from "./helperFunctions";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AggregatedStepLog = {
  periodKey: string;
  steps: number;
  goal: number;
  updatedAt: string | null;
};

// ─── Key builders ─────────────────────────────────────────────────────────────

/** ISO week number (Mon–Sun). Week 1 = week containing Jan 4. */
function isoWeekNumber(date: Date): number {
  const tmp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
}

/** "YYYY-WNN"  — uses the ISO week-year so late-Dec/early-Jan is handled correctly. */
export function toWeekKey(date: Date): string {
  const tmp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const isoYear = tmp.getUTCFullYear();
  return `${isoYear}-W${String(isoWeekNumber(date)).padStart(2, "0")}`;
}

/** "YYYY-MM" */
export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY" */
export function toYearKey(date: Date): string {
  return String(date.getFullYear());
}

/** Firestore collection name for a given granularity. */
export function aggregatedCollection(
  granularity: "weekly" | "monthly" | "yearly",
): string {
  return granularity === "weekly"
    ? "weeklyStepLogs"
    : granularity === "monthly"
      ? "monthlyStepLogs"
      : "yearlyStepLogs";
}

// ─── Normalisation ────────────────────────────────────────────────────────────

function normalizeAggregatedLog(
  raw: Record<string, unknown> | undefined,
  periodKey: string,
): AggregatedStepLog {
  return {
    periodKey,
    steps: Math.max(0, Math.round(toNumber(raw?.steps, 0))),
    goal: Math.max(0, Math.round(toNumber(raw?.goal, 0))),
    updatedAt: toText(raw?.updatedAt) || null,
  };
}

// ─── Batch read helpers ───────────────────────────────────────────────────────

async function loadAggregatedBatch(
  uid: string,
  granularity: "weekly" | "monthly" | "yearly",
  keys: string[],
): Promise<Map<string, AggregatedStepLog>> {
  const uniqueKeys = Array.from(new Set(keys));
  if (uniqueKeys.length === 0) return new Map();

  const snaps = await Promise.all(
    uniqueKeys.map((key) =>
      getDoc(doc(db, "users", uid, aggregatedCollection(granularity), key)),
    ),
  );

  const result = new Map<string, AggregatedStepLog>();
  snaps.forEach((snap, i) => {
    if (snap.exists()) {
      result.set(
        uniqueKeys[i],
        normalizeAggregatedLog(
          snap.data() as Record<string, unknown>,
          uniqueKeys[i],
        ),
      );
    }
  });
  return result;
}

export async function loadWeeklyStepLogs(
  uid: string,
  weekKeys: string[],
): Promise<Map<string, AggregatedStepLog>> {
  return loadAggregatedBatch(uid, "weekly", weekKeys);
}

export async function loadMonthlyStepLogs(
  uid: string,
  monthKeys: string[],
): Promise<Map<string, AggregatedStepLog>> {
  return loadAggregatedBatch(uid, "monthly", monthKeys);
}

export async function loadYearlyStepLogs(
  uid: string,
  yearKeys: string[],
): Promise<Map<string, AggregatedStepLog>> {
  return loadAggregatedBatch(uid, "yearly", yearKeys);
}