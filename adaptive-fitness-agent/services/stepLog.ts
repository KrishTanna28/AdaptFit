/**
 * stepLog.ts  (updated)
 *
 * upsertDailyStepLog() now atomically maintains the three aggregated
 * collections (weeklyStepLogs, monthlyStepLogs, yearlyStepLogs) in the
 * same Firestore batch as the daily write — no Cloud Function required.
 *
 * Strategy: delta-based increment
 *   1. Read the current daily doc (if it exists) to know the old steps/goal.
 *   2. Compute stepsDelta = newSteps - oldSteps  (and same for goal).
 *   3. Apply increment(stepsDelta) to the three aggregated docs.
 *
 * This means:
 *   - No need to re-read sibling days.
 *   - The batch is always exactly 4 writes (1 daily + 3 aggregated).
 *   - Concurrent writes for different days in the same period are safe
 *     because increment() is atomic in Firestore.
 */

import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { toNumber, toText } from "./helperFunctions";
import { publishIntelligenceEvent } from "./intelligenceEvents";
import {
  aggregatedCollection,
  toWeekKey,
  toMonthKey,
  toYearKey,
} from "./aggregatedStepLog";

export type StepLogSource = "health-connect" | "pedometer" | "none";

export type DailyStepLog = {
  dateKey: string;
  steps: number;
  goal: number;
  source: StepLogSource;
  loggedAt: string | null;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function stepLogDocRef(uid: string, dateKey: string) {
  return doc(db, "users", uid, "stepLogs", dateKey);
}

function aggregatedDocRef(
  uid: string,
  granularity: "weekly" | "monthly" | "yearly",
  periodKey: string,
) {
  return doc(db, "users", uid, aggregatedCollection(granularity), periodKey);
}

function normalizeSource(value: unknown): StepLogSource {
  if (
    value === "health-connect" ||
    value === "pedometer" ||
    value === "none"
  ) {
    return value;
  }
  return "none";
}

function normalizeDailyStepLog(
  raw: Partial<DailyStepLog> | undefined,
  dateKey: string,
): DailyStepLog {
  return {
    dateKey,
    steps: Math.max(0, Math.round(toNumber(raw?.steps, 0))),
    goal: Math.max(0, Math.round(toNumber(raw?.goal, 0))),
    source: normalizeSource(raw?.source),
    loggedAt: toText(raw?.loggedAt) || null,
  };
}

/** Parse "YYYY-MM-DD" → Date, returns null for malformed keys. */
function parseDateKey(dateKey: string): Date | null {
  const parts = String(dateKey ?? "").split("-").map(Number);
  if (
    parts.length !== 3 ||
    parts.some((p) => !Number.isFinite(p) || p <= 0)
  ) {
    return null;
  }
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setHours(0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Public read API (unchanged) ──────────────────────────────────────────────

export async function loadDailyStepLog(
  uid: string,
  dateKey: string,
): Promise<DailyStepLog | null> {
  const snapshot = await getDoc(stepLogDocRef(uid, dateKey));
  if (!snapshot.exists()) return null;
  return normalizeDailyStepLog(
    snapshot.data() as Partial<DailyStepLog>,
    dateKey,
  );
}

export async function loadDailyStepLogs(
  uid: string,
  dateKeys: string[],
): Promise<Array<DailyStepLog | null>> {
  const uniqueKeys = Array.from(new Set(dateKeys));
  const snapshots = await Promise.all(
    uniqueKeys.map((dateKey) => getDoc(stepLogDocRef(uid, dateKey))),
  );

  const logsByKey = new Map<string, DailyStepLog>();
  snapshots.forEach((snapshot, index) => {
    if (!snapshot.exists()) return;
    const dateKey = uniqueKeys[index];
    logsByKey.set(
      dateKey,
      normalizeDailyStepLog(snapshot.data() as Partial<DailyStepLog>, dateKey),
    );
  });

  return dateKeys.map((dateKey) => logsByKey.get(dateKey) ?? null);
}

// ─── Write API (updated) ──────────────────────────────────────────────────────

export async function upsertDailyStepLog(
  uid: string,
  dateKey: string,
  input: {
    steps: number;
    goal: number;
    source?: StepLogSource;
    loggedAt?: string | null;
  },
) {
  const date = parseDateKey(dateKey);

  const newPayload = normalizeDailyStepLog(
    {
      dateKey,
      steps: input.steps,
      goal: input.goal,
      source: input.source ?? "none",
      loggedAt: input.loggedAt ?? new Date().toISOString(),
    },
    dateKey,
  );

  // ── 1. Read the existing daily doc so we can compute deltas ───────────────
  //    This is 1 read regardless of how large the week/month/year is.
  const existingSnap = await getDoc(stepLogDocRef(uid, dateKey));
  const existing = existingSnap.exists()
    ? normalizeDailyStepLog(
        existingSnap.data() as Partial<DailyStepLog>,
        dateKey,
      )
    : null;

  const stepsDelta = newPayload.steps - (existing?.steps ?? 0);
  const goalDelta = newPayload.goal - (existing?.goal ?? 0);

  // ── 2. Build the batch: 1 daily write + up to 3 aggregated writes ─────────
  const batch = writeBatch(db);

  // Daily doc
  batch.set(
    stepLogDocRef(uid, dateKey),
    { ...newPayload, updatedAt: serverTimestamp() },
    { merge: true },
  );

  // Only update aggregated docs when date is parseable and there is a real change.
  // First-time inserts always have a delta (old = 0), so they are always written.
  if (date && (stepsDelta !== 0 || goalDelta !== 0 || !existing)) {
    const weekKey = toWeekKey(date);
    const monthKey = toMonthKey(date);
    const yearKey = toYearKey(date);
    const ts = serverTimestamp();

    // For a brand-new aggregated doc, setDoc with merge:true will create it.
    // increment() on a field that doesn't exist yet starts from 0, which is
    // exactly what we want for the first day in any period.
    const aggUpdate = {
      steps: increment(stepsDelta),
      goal: increment(goalDelta),
      updatedAt: ts,
    };

    batch.set(
      aggregatedDocRef(uid, "weekly", weekKey),
      { periodKey: weekKey, ...aggUpdate },
      { merge: true },
    );

    batch.set(
      aggregatedDocRef(uid, "monthly", monthKey),
      { periodKey: monthKey, ...aggUpdate },
      { merge: true },
    );

    batch.set(
      aggregatedDocRef(uid, "yearly", yearKey),
      { periodKey: yearKey, ...aggUpdate },
      { merge: true },
    );
  }

  await batch.commit();

  // ── 3. Intelligence event (fire-and-forget, unchanged) ────────────────────
  void publishIntelligenceEvent({
    type: "steps_updated",
    payload: {
      dateKey,
      steps: newPayload.steps,
      goal: newPayload.goal,
      source: newPayload.source,
    },
  });
}