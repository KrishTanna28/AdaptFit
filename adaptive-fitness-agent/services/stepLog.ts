import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { toNumber, toText } from "./helperFunctions";

export type StepLogSource = "health-connect" | "pedometer" | "none";

export type DailyStepLog = {
  dateKey: string;
  steps: number;
  goal: number;
  source: StepLogSource;
  loggedAt: string | null;
};

function stepLogDocRef(uid: string, dateKey: string) {
  return doc(db, "users", uid, "stepLogs", dateKey);
}

function normalizeSource(value: unknown): StepLogSource {
  if (value === "health-connect" || value === "pedometer" || value === "none") {
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

export async function loadDailyStepLog(
  uid: string,
  dateKey: string,
): Promise<DailyStepLog | null> {
  const snapshot = await getDoc(stepLogDocRef(uid, dateKey));
  if (!snapshot.exists()) {
    return null;
  }

  return normalizeDailyStepLog(snapshot.data() as Partial<DailyStepLog>, dateKey);
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
    if (!snapshot.exists()) {
      return;
    }

    const dateKey = uniqueKeys[index];
    logsByKey.set(
      dateKey,
      normalizeDailyStepLog(snapshot.data() as Partial<DailyStepLog>, dateKey),
    );
  });

  return dateKeys.map((dateKey) => logsByKey.get(dateKey) ?? null);
}

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
  const payload = normalizeDailyStepLog(
    {
      dateKey,
      steps: input.steps,
      goal: input.goal,
      source: input.source ?? "none",
      loggedAt: input.loggedAt ?? new Date().toISOString(),
    },
    dateKey,
  );

  await setDoc(
    stepLogDocRef(uid, dateKey),
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
