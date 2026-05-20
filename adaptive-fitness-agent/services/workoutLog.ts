import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { MetIntensity } from "./workoutMetDataset";
import type { MappingSource } from "./workoutMetMapping";
import {toText, toNumber, toPositiveNumber, toOptionalPositiveInt} from "./helperFunctions"
import { publishIntelligenceEvent } from "./intelligenceEvents";

export type LoggedWorkoutMode = "cardio" | "strength" | "sports";

export type LoggedWorkoutEntry = {
  id: string;
  exerciseId: string;
  workoutName: string;
  workoutMode: LoggedWorkoutMode;
  durationMin: number;
  sets: number | null;
  reps: number | null;
  secPerRep: number | null;
  restBetweenSetsSec: number | null;
  setupSec: number | null;
  minSessionMin: number | null;
  intensity: MetIntensity;
  metRowId: string;
  metActivity: string;
  metValue: number;
  caloriesGross: number;
  caloriesActive: number;
  datasetVersion: string;
  resolverVersion: string;
  mappingSource: MappingSource;
  loggedAt: string;
};

type DailyWorkoutLog = {
  dateKey: string;
  entries: LoggedWorkoutEntry[];
};

function normalizeIntensity(value: unknown): MetIntensity {
  if (value === "low" || value === "moderate" || value === "vigorous") {
    return value;
  }
  return "moderate";
}

function normalizeMappingSource(value: unknown): MappingSource {
  if (value === "auto" || value === "auto-needs-review" || value === "confirmed") {
    return value;
  }
  return "auto";
}

function toOptionalPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }

  return n;
}

function normalizeWorkoutMode(raw: Partial<LoggedWorkoutEntry>): LoggedWorkoutMode {
  if (
    raw.workoutMode === "cardio" ||
    raw.workoutMode === "strength" ||
    raw.workoutMode === "sports"
  ) {
    return raw.workoutMode;
  }

  const sets = toOptionalPositiveInt(raw.sets);
  const reps = toOptionalPositiveInt(raw.reps);
  if (sets !== null || reps !== null) {
    return "strength";
  }

  return "cardio";
}

function normalizeEntry(raw: Partial<LoggedWorkoutEntry>): LoggedWorkoutEntry {
  return {
    id: toText(raw.id) || "entry-" + Date.now().toString(),
    exerciseId: toText(raw.exerciseId),
    workoutName: toText(raw.workoutName),
    workoutMode: normalizeWorkoutMode(raw),
    durationMin: toPositiveNumber(raw.durationMin, 1),
    sets: toOptionalPositiveInt(raw.sets),
    reps: toOptionalPositiveInt(raw.reps),
    secPerRep: toOptionalPositiveNumber(raw.secPerRep),
    restBetweenSetsSec: toOptionalPositiveNumber(raw.restBetweenSetsSec),
    setupSec: toOptionalPositiveNumber(raw.setupSec),
    minSessionMin: toOptionalPositiveNumber(raw.minSessionMin),
    intensity: normalizeIntensity(raw.intensity),
    metRowId: toText(raw.metRowId),
    metActivity: toText(raw.metActivity),
    metValue: toNumber(raw.metValue, 0),
    caloriesGross: toNumber(raw.caloriesGross, 0),
    caloriesActive: toNumber(raw.caloriesActive, 0),
    datasetVersion: toText(raw.datasetVersion),
    resolverVersion: toText(raw.resolverVersion),
    mappingSource: normalizeMappingSource(raw.mappingSource),
    loggedAt:
      typeof raw.loggedAt === "string" && raw.loggedAt
        ? raw.loggedAt
        : new Date().toISOString(),
  };
}

function dayDocRef(uid: string, dateKey: string) {
  return doc(db, "users", uid, "workoutLogs", dateKey);
}

function entryDocRef(uid: string, dateKey: string, entryId: string) {
  return doc(db, "users", uid, "workoutLogs", dateKey, "entries", entryId);
}

function entriesCollectionRef(uid: string, dateKey: string) {
  return collection(db, "users", uid, "workoutLogs", dateKey, "entries");
}

function sortByLoggedAt(entries: LoggedWorkoutEntry[]) {
  return [...entries].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
}

export async function loadDailyWorkoutLog(
  uid: string,
  dateKey: string,
): Promise<DailyWorkoutLog> {
  const snapshot = await getDocs(entriesCollectionRef(uid, dateKey));
  const entries = snapshot.docs.map((entryDoc) =>
    normalizeEntry({
      id: entryDoc.id,
      ...((entryDoc.data() ?? {}) as Partial<LoggedWorkoutEntry>),
    }),
  );

  return {
    dateKey,
    entries: sortByLoggedAt(entries),
  };
}

export async function upsertLoggedWorkoutEntryPartial(
  uid: string,
  dateKey: string,
  input: LoggedWorkoutEntry,
): Promise<{ updated: boolean; changedFields: string[] }> {
  const normalized = normalizeEntry(input);
  const ref = entryDocRef(uid, dateKey, normalized.id);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as Record<string, unknown>) : null;

  const patch: Record<string, unknown> = {};
  const changedFields: string[] = [];

  const maybeSet = (key: keyof LoggedWorkoutEntry, value: unknown) => {
    const prev = existing ? existing[key] : undefined;
    if (prev !== value) {
      patch[key] = value;
      changedFields.push(String(key));
    }
  };

  maybeSet("id", normalized.id);
  maybeSet("exerciseId", normalized.exerciseId);
  maybeSet("workoutName", normalized.workoutName);
  maybeSet("workoutMode", normalized.workoutMode);
  maybeSet("durationMin", normalized.durationMin);
  maybeSet("sets", normalized.sets);
  maybeSet("reps", normalized.reps);
  maybeSet("secPerRep", normalized.secPerRep);
  maybeSet("restBetweenSetsSec", normalized.restBetweenSetsSec);
  maybeSet("setupSec", normalized.setupSec);
  maybeSet("minSessionMin", normalized.minSessionMin);
  maybeSet("intensity", normalized.intensity);
  maybeSet("metRowId", normalized.metRowId);
  maybeSet("metActivity", normalized.metActivity);
  maybeSet("metValue", normalized.metValue);
  maybeSet("caloriesGross", normalized.caloriesGross);
  maybeSet("caloriesActive", normalized.caloriesActive);
  maybeSet("datasetVersion", normalized.datasetVersion);
  maybeSet("resolverVersion", normalized.resolverVersion);
  maybeSet("mappingSource", normalized.mappingSource);
  maybeSet("loggedAt", normalized.loggedAt);

  if (changedFields.length === 0) {
    return { updated: false, changedFields: [] };
  }

  patch.updatedAt = serverTimestamp();

  await Promise.all([
    setDoc(ref, patch, { merge: true }),
    setDoc(
      dayDocRef(uid, dateKey),
      {
        dateKey,
        usesEntryDocs: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
  ]);

  void publishIntelligenceEvent({
    type: "workout_logged",
    payload: {
      dateKey,
      entryId: normalized.id,
      workoutName: normalized.workoutName,
    },
  });

  return { updated: true, changedFields };
}

export async function deleteLoggedWorkoutEntry(
  uid: string,
  dateKey: string,
  entryId: string,
) {
  await Promise.all([
    deleteDoc(entryDocRef(uid, dateKey, entryId)),
    setDoc(
      dayDocRef(uid, dateKey),
      {
        dateKey,
        usesEntryDocs: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
  ]);

  void publishIntelligenceEvent({
    type: "workout_logged",
    payload: {
      dateKey,
      entryId,
    },
  });
}
