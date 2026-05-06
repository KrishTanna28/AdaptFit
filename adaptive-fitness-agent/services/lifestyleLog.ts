import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { toNumber, toText } from "./helperFunctions";
import type { LoggedWorkoutEntry } from "./workoutLog";

export type WeatherCondition = "cool" | "mild" | "hot" | "humid";

export type LifestyleWeatherSnapshot = {
  locationName: string;
  temperatureC: number | null;
  humidityPercent: number | null;
  condition: WeatherCondition;
  fetchedAt: string | null;
};

export type HydrationLog = {
  intakeMl: number;
  goalMl: number;
  updatedAt: string | null;
};

export type RecoveryLog = {
  sleepHours: number | null;
  sleepQuality: number | null;
  stressLevel: number | null;
  notes: string;
  loggedAt: string | null;
};

export type DailyLifestyleLog = {
  dateKey: string;
  hydration: HydrationLog;
  weather: LifestyleWeatherSnapshot;
  recovery: RecoveryLog;
};

export type HydrationGoalBreakdown = {
  goalMl: number;
  baseMl: number;
  workoutMl: number;
  weatherMl: number;
  notes: string[];
};

const DEFAULT_HYDRATION_GOAL_ML = 2500;
const MIN_HYDRATION_GOAL_ML = 1800;
const MAX_HYDRATION_GOAL_ML = 5200;

export const EMPTY_WEATHER: LifestyleWeatherSnapshot = {
  locationName: "",
  temperatureC: null,
  humidityPercent: null,
  condition: "mild",
  fetchedAt: null,
};

export const EMPTY_HYDRATION: HydrationLog = {
  intakeMl: 0,
  goalMl: DEFAULT_HYDRATION_GOAL_ML,
  updatedAt: null,
};

export const EMPTY_RECOVERY: RecoveryLog = {
  sleepHours: null,
  sleepQuality: null,
  stressLevel: null,
  notes: "",
  loggedAt: null,
};

function lifestyleDocRef(uid: string, dateKey: string) {
  return doc(db, "users", uid, "lifestyleLogs", dateKey);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundToNearest(value: number, step: number) {
  return Math.round(value / step) * step;
}

function normalizeRating(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return clamp(Math.round(n), 1, 5);
}

function normalizeWeather(raw: Partial<LifestyleWeatherSnapshot> | undefined): LifestyleWeatherSnapshot {
  const condition = raw?.condition;

  return {
    locationName: toText(raw?.locationName),
    temperatureC: raw?.temperatureC === null || raw?.temperatureC === undefined
      ? null
      : toNumber(raw.temperatureC, 0),
    humidityPercent: raw?.humidityPercent === null || raw?.humidityPercent === undefined
      ? null
      : clamp(toNumber(raw.humidityPercent, 0), 0, 100),
    condition:
      condition === "cool" || condition === "hot" || condition === "humid"
        ? condition
        : "mild",
    fetchedAt: toText(raw?.fetchedAt) || null,
  };
}

function normalizeHydration(raw: Partial<HydrationLog> | undefined): HydrationLog {
  return {
    intakeMl: Math.max(0, Math.round(toNumber(raw?.intakeMl, 0))),
    goalMl: Math.max(MIN_HYDRATION_GOAL_ML, Math.round(toNumber(raw?.goalMl, DEFAULT_HYDRATION_GOAL_ML))),
    updatedAt: toText(raw?.updatedAt) || null,
  };
}

function normalizeRecovery(raw: Partial<RecoveryLog> | undefined): RecoveryLog {
  const sleepHours = raw?.sleepHours === null || raw?.sleepHours === undefined
    ? null
    : clamp(toNumber(raw.sleepHours, 0), 0, 24);

  return {
    sleepHours,
    sleepQuality: normalizeRating(raw?.sleepQuality),
    stressLevel: normalizeRating(raw?.stressLevel),
    notes: toText(raw?.notes),
    loggedAt: toText(raw?.loggedAt) || null,
  };
}

export function normalizeLifestyleLog(
  raw: Partial<DailyLifestyleLog> | undefined,
  dateKey: string,
): DailyLifestyleLog {
  return {
    dateKey,
    hydration: normalizeHydration(raw?.hydration),
    weather: normalizeWeather(raw?.weather),
    recovery: normalizeRecovery(raw?.recovery),
  };
}

export async function loadDailyLifestyleLog(
  uid: string,
  dateKey: string,
): Promise<DailyLifestyleLog> {
  const snapshot = await getDoc(lifestyleDocRef(uid, dateKey));
  const raw = snapshot.exists()
    ? (snapshot.data() as Partial<DailyLifestyleLog>)
    : undefined;

  return normalizeLifestyleLog(raw, dateKey);
}

export async function upsertDailyLifestyleLog(
  uid: string,
  dateKey: string,
  patch: Partial<Pick<DailyLifestyleLog, "hydration" | "weather" | "recovery">>,
) {
  const payload: Record<string, unknown> = {
    dateKey,
    updatedAt: serverTimestamp(),
  };

  if (patch.hydration) {
    payload.hydration = normalizeHydration({
      ...patch.hydration,
      updatedAt: patch.hydration.updatedAt ?? new Date().toISOString(),
    });
  }

  if (patch.weather) {
    payload.weather = normalizeWeather(patch.weather);
  }

  if (patch.recovery) {
    payload.recovery = normalizeRecovery({
      ...patch.recovery,
      loggedAt: patch.recovery.loggedAt ?? new Date().toISOString(),
    });
  }

  await setDoc(lifestyleDocRef(uid, dateKey), payload, { merge: true });
}

export function inferWeatherCondition(input: {
  temperatureC: number | null;
  humidityPercent: number | null;
}): WeatherCondition {
  const temperatureC = input.temperatureC;
  const humidityPercent = input.humidityPercent;

  if (typeof humidityPercent === "number" && humidityPercent >= 75) {
    return "humid";
  }

  if (typeof temperatureC === "number" && temperatureC >= 30) {
    return "hot";
  }

  if (typeof temperatureC === "number" && temperatureC <= 18) {
    return "cool";
  }

  return "mild";
}

export function calculateAdaptiveHydrationGoal(input: {
  weightKg?: number | null;
  workouts: LoggedWorkoutEntry[];
  weather: LifestyleWeatherSnapshot;
}): HydrationGoalBreakdown {
  const weightKg =
    typeof input.weightKg === "number" && Number.isFinite(input.weightKg) && input.weightKg > 0
      ? input.weightKg
      : null;
  const baseMl = weightKg
    ? clamp(roundToNearest(weightKg * 35, 50), MIN_HYDRATION_GOAL_ML, 3800)
    : DEFAULT_HYDRATION_GOAL_ML;

  const totalDurationMin = input.workouts.reduce((sum, workout) => {
    const value = Number(workout.durationMin);
    return Number.isFinite(value) ? sum + Math.max(0, value) : sum;
  }, 0);

  const hasVigorous = input.workouts.some((workout) => workout.intensity === "vigorous");
  const hasModerate = input.workouts.some((workout) => workout.intensity === "moderate");
  const hasLow = input.workouts.some((workout) => workout.intensity === "low");

  let workoutMl = 0;
  if (hasVigorous) {
    workoutMl += 650;
  } else if (hasModerate) {
    workoutMl += 450;
  } else if (hasLow) {
    workoutMl += 250;
  }
  workoutMl += Math.min(700, Math.round(totalDurationMin / 15) * 100);

  const weather = input.weather;
  let weatherMl = 0;
  const temperatureC = weather.temperatureC;
  const humidityPercent = weather.humidityPercent;

  if (typeof temperatureC === "number") {
    if (temperatureC >= 35) {
      weatherMl += 700;
    } else if (temperatureC >= 30) {
      weatherMl += 500;
    } else if (temperatureC >= 26) {
      weatherMl += 250;
    }
  }

  if (typeof humidityPercent === "number" && humidityPercent >= 70) {
    weatherMl += 250;
  }

  if (weather.condition === "hot") {
    weatherMl += 200;
  } else if (weather.condition === "humid") {
    weatherMl += 300;
  }

  const notes: string[] = [];
  if (weightKg) {
    notes.push("Base uses your profile weight.");
  } else {
    notes.push("Base uses the default daily goal.");
  }

  if (workoutMl > 0) {
    notes.push("Workout load added " + String(workoutMl) + " ml.");
  } else {
    notes.push("No workout adjustment yet.");
  }

  if (weatherMl > 0) {
    notes.push("Weather added " + String(weatherMl) + " ml.");
  }

  const goalMl = clamp(
    roundToNearest(baseMl + workoutMl + weatherMl, 50),
    MIN_HYDRATION_GOAL_ML,
    MAX_HYDRATION_GOAL_ML,
  );

  return {
    goalMl,
    baseMl,
    workoutMl,
    weatherMl,
    notes,
  };
}
