const DEFAULT_CONTEXT_WINDOW_DAYS = 7;
const MAX_CONTEXT_WINDOW_DAYS = 30;
const PROFILE_HISTORY_LIMIT = 30;
const MIN_ACTIVE_CALORIE_TARGET = 150;
const MAX_ACTIVE_CALORIE_TARGET = 650;
const ACTIVE_CALORIE_INTAKE_RATIO = 0.2;

function toNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey) {
  const parts = String(dateKey ?? "").split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetweenDateKeys(fromDateKeyValue, toDateKeyValue) {
  const from = fromDateKey(fromDateKeyValue);
  const to = fromDateKey(toDateKeyValue);
  if (!from || !to) {
    return null;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / msPerDay));
}

function toSerializable(value, depth = 0) {
  if (depth > 10) {
    return null;
  }

  if (value === null || value === undefined) {
    return null;
  }

  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item, depth + 1));
  }

  if (valueType === "object") {
    if (typeof value.toDate === "function") {
      try {
        const dateValue = value.toDate();
        if (dateValue instanceof Date) {
          return dateValue.toISOString();
        }
      } catch {
        return null;
      }
    }

    const out = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      out[key] = toSerializable(nestedValue, depth + 1);
    }
    return out;
  }

  return null;
}

function buildRecentDateKeys(windowDays) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = 0; offset < windowDays; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    out.push(toDateKey(date));
  }

  return out;
}

function parseProfile(rawProfile) {
  const profile = rawProfile && typeof rawProfile === "object" ? rawProfile : {};

  return {
    age: toNumber(profile.age, 0) || null,
    gender: typeof profile.gender === "string" ? profile.gender : null,
    heightCm: toNumber(profile.heightCm, 0) || null,
    weightKg: toNumber(profile.weightKg, 0) || null,
    fitnessGoal: typeof profile.fitnessGoal === "string" ? profile.fitnessGoal : null,
    lifestyle: typeof profile.lifestyle === "string" ? profile.lifestyle : null,
    dietType: typeof profile.dietType === "string" ? profile.dietType : null,
    injuries: typeof profile.injuries === "string" ? profile.injuries : null,
    medicalConditions:
      typeof profile.medicalConditions === "string" ? profile.medicalConditions : null,
    allergies: Array.isArray(profile.allergies)
      ? profile.allergies.filter((item) => typeof item === "string")
      : [],
    foodRestrictions:
      typeof profile.foodRestrictions === "string" ? profile.foodRestrictions : null,
  };
}

function normalizeProfileHistoryEntry(doc) {
  const data = doc?.data ? doc.data() ?? {} : doc ?? {};
  const snapshot = parseProfile(data.snapshot);

  return {
    id: typeof doc?.id === "string" ? doc.id : null,
    changedAt: toSerializable(data.changedAt),
    changedFields: Array.isArray(data.changedFields)
      ? data.changedFields.filter((field) => typeof field === "string")
      : [],
    snapshot,
    source: typeof data.source === "string" ? data.source : null,
  };
}

function normalizeNutritionEntry(raw, dateKey) {
  const serializableRaw = toSerializable(raw);

  return {
    dateKey,
    id: typeof raw.id === "string" ? raw.id : "",
    mealType: typeof raw.mealType === "string" ? raw.mealType : "snacks",
    name: typeof raw.name === "string" ? raw.name : "",
    source: typeof raw.source === "string" ? raw.source : "Manual",
    quantity: toNumber(raw.quantity, 0),
    unit: typeof raw.unit === "string" ? raw.unit : "serving",
    calories: toNumber(raw.calories, 0),
    protein: toNumber(raw.protein, 0),
    carbs: toNumber(raw.carbs, 0),
    fat: toNumber(raw.fat, 0),
    fiber: toNumber(raw.fiber, 0),
    sodiumMg: toNumber(raw.sodiumMg, 0),
    potassiumMg: toNumber(raw.potassiumMg, 0),
    calciumMg: toNumber(raw.calciumMg, 0),
    ironMg: toNumber(raw.ironMg, 0),
    vitaminCMg: toNumber(raw.vitaminCMg, 0),
    loggedAt: typeof raw.loggedAt === "string" ? raw.loggedAt : null,
    raw: serializableRaw,
  };
}

function normalizeWorkoutEntry(raw, dateKey) {
  const serializableRaw = toSerializable(raw);

  return {
    dateKey,
    id: typeof raw.id === "string" ? raw.id : "",
    exerciseId: typeof raw.exerciseId === "string" ? raw.exerciseId : "",
    workoutName: typeof raw.workoutName === "string" ? raw.workoutName : "",
    workoutMode: typeof raw.workoutMode === "string" ? raw.workoutMode : "cardio",
    durationMin: toNumber(raw.durationMin, 0),
    sets: toNumber(raw.sets, 0) || null,
    reps: toNumber(raw.reps, 0) || null,
    secPerRep: toNumber(raw.secPerRep, 0) || null,
    restBetweenSetsSec: toNumber(raw.restBetweenSetsSec, 0) || null,
    setupSec: toNumber(raw.setupSec, 0) || null,
    minSessionMin: toNumber(raw.minSessionMin, 0) || null,
    intensity: typeof raw.intensity === "string" ? raw.intensity : "moderate",
    metRowId: typeof raw.metRowId === "string" ? raw.metRowId : "",
    metActivity: typeof raw.metActivity === "string" ? raw.metActivity : "",
    metValue: toNumber(raw.metValue, 0),
    caloriesActive: toNumber(raw.caloriesActive, 0),
    caloriesGross: toNumber(raw.caloriesGross, 0),
    datasetVersion: typeof raw.datasetVersion === "string" ? raw.datasetVersion : "",
    resolverVersion: typeof raw.resolverVersion === "string" ? raw.resolverVersion : "",
    mappingSource: typeof raw.mappingSource === "string" ? raw.mappingSource : "",
    loggedAt: typeof raw.loggedAt === "string" ? raw.loggedAt : null,
    raw: serializableRaw,
  };
}

function normalizeStepLog(raw, dateKey) {
  const source = raw && typeof raw === "object" ? raw : {};

  return {
    dateKey,
    steps: Math.max(0, Math.round(toNumber(source.steps, 0))),
    goal: Math.max(0, Math.round(toNumber(source.goal, 0))),
    source: typeof source.source === "string" ? source.source : "none",
    loggedAt: typeof source.loggedAt === "string" ? source.loggedAt : null,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  };
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeLifestyleLog(raw, dateKey) {
  const source = raw && typeof raw === "object" ? raw : {};
  const serializableRaw = toSerializable(source);
  const hydration = source.hydration && typeof source.hydration === "object" ? source.hydration : {};
  const weather = source.weather && typeof source.weather === "object" ? source.weather : {};
  const recovery = source.recovery && typeof source.recovery === "object" ? source.recovery : {};
  const intakeMl = Math.max(0, Math.round(toNumber(hydration.intakeMl, 0)));
  const goalMl = Math.max(0, Math.round(toNumber(hydration.goalMl, 0)));

  return {
    dateKey,
    hydration: {
      intakeMl,
      goalMl,
      progressPercent: goalMl > 0 ? Math.round((intakeMl / goalMl) * 100) : null,
      updatedAt: typeof hydration.updatedAt === "string" ? hydration.updatedAt : null,
    },
    weather: {
      locationName: typeof weather.locationName === "string" ? weather.locationName : "",
      temperatureC: toNullableNumber(weather.temperatureC),
      humidityPercent: toNullableNumber(weather.humidityPercent),
      condition: typeof weather.condition === "string" ? weather.condition : "mild",
      fetchedAt: typeof weather.fetchedAt === "string" ? weather.fetchedAt : null,
    },
    recovery: {
      sleepHours: toNullableNumber(recovery.sleepHours),
      sleepQuality: toNullableNumber(recovery.sleepQuality),
      stressLevel: toNullableNumber(recovery.stressLevel),
      notes: typeof recovery.notes === "string" ? recovery.notes : "",
      loggedAt: typeof recovery.loggedAt === "string" ? recovery.loggedAt : null,
    },
    raw: serializableRaw,
  };
}

async function loadDayDescriptors(db, uid, collectionName, windowDays, includeAllHistory) {
  const recentDateKeys = buildRecentDateKeys(windowDays);

  if (!includeAllHistory) {
    return recentDateKeys.map((dateKey) => ({
      dateKey,
      dayMeta: null,
    }));
  }

  const daySnapshot = await db.collection("users").doc(uid).collection(collectionName).get();
  const descriptors = daySnapshot.docs
    .map((dayDoc) => {
      const dayData = dayDoc.data() ?? {};
      const dateKeyFromData = typeof dayData.dateKey === "string" ? dayData.dateKey : "";
      const dateKey = dateKeyFromData || dayDoc.id;

      if (!dateKey) {
        return null;
      }

      return {
        dateKey,
        dayMeta: toSerializable({ id: dayDoc.id, ...dayData }),
      };
    })
    .filter((item) => item !== null)
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey));

  if (descriptors.length > 0) {
    const byDateKey = new Map(descriptors.map((descriptor) => [descriptor.dateKey, descriptor]));
    recentDateKeys.forEach((dateKey) => {
      if (!byDateKey.has(dateKey)) {
        byDateKey.set(dateKey, {
          dateKey,
          dayMeta: null,
        });
      }
    });

    return Array.from(byDateKey.values()).sort((left, right) =>
      right.dateKey.localeCompare(left.dateKey),
    );
  }

  return recentDateKeys.map((dateKey) => ({
    dateKey,
    dayMeta: null,
  }));
}

async function loadEntriesByDate(db, uid, collectionName, dayDescriptors) {
  const dayResults = await Promise.all(
    dayDescriptors.map(async (dayDescriptor) => {
      const dateKey = dayDescriptor.dateKey;
      const snapshot = await db
        .collection("users")
        .doc(uid)
        .collection(collectionName)
        .doc(dateKey)
        .collection("entries")
        .get();

      return {
        dateKey,
        dayMeta: dayDescriptor.dayMeta,
        entries: snapshot.docs.map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() })),
      };
    }),
  );

  return dayResults;
}

async function loadDocumentsByDate(db, uid, collectionName, dayDescriptors) {
  const dayResults = await Promise.all(
    dayDescriptors.map(async (dayDescriptor) => {
      const snapshot = await db
        .collection("users")
        .doc(uid)
        .collection(collectionName)
        .doc(dayDescriptor.dateKey)
        .get();

      return {
        dateKey: dayDescriptor.dateKey,
        data: snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : dayDescriptor.dayMeta,
      };
    }),
  );

  return dayResults;
}

async function loadProfileHistory(db, uid, limit) {
  try {
    const snapshot = await db
      .collection("users")
      .doc(uid)
      .collection("profileHistory")
      .orderBy("changedAt", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => normalizeProfileHistoryEntry(doc)).reverse();
  } catch {
    return [];
  }
}

function buildDailyNutritionSummary(dateKeys, nutritionEntries) {
  return dateKeys.map((dateKey) => {
    const dayEntries = nutritionEntries.filter((entry) => entry.dateKey === dateKey);

    return {
      dateKey,
      calories: Math.round(dayEntries.reduce((sum, entry) => sum + entry.calories, 0)),
      protein: Math.round(dayEntries.reduce((sum, entry) => sum + entry.protein, 0)),
      carbs: Math.round(dayEntries.reduce((sum, entry) => sum + entry.carbs, 0)),
      fat: Math.round(dayEntries.reduce((sum, entry) => sum + entry.fat, 0)),
      mealsLogged: dayEntries.length,
    };
  });
}

function buildDailyWorkoutSummary(dateKeys, workoutEntries) {
  return dateKeys.map((dateKey) => {
    const dayEntries = workoutEntries.filter((entry) => entry.dateKey === dateKey);

    return {
      dateKey,
      sessions: dayEntries.length,
      durationMin: Math.round(dayEntries.reduce((sum, entry) => sum + entry.durationMin, 0)),
      activeCalories: Math.round(
        dayEntries.reduce((sum, entry) => sum + Math.max(0, entry.caloriesActive), 0),
      ),
    };
  });
}

function buildDailyLifestyleSummary(dateKeys, lifestyleLogs) {
  return dateKeys.map((dateKey) => {
    const log = lifestyleLogs.find((entry) => entry.dateKey === dateKey);

    return {
      dateKey,
      hydrationMl: log?.hydration.intakeMl ?? 0,
      hydrationGoalMl: log?.hydration.goalMl ?? 0,
      hydrationProgressPercent: log?.hydration.progressPercent ?? null,
      sleepHours: log?.recovery.sleepHours ?? null,
      sleepQuality: log?.recovery.sleepQuality ?? null,
      stressLevel: log?.recovery.stressLevel ?? null,
      weatherCondition: log?.weather.condition ?? null,
      temperatureC: log?.weather.temperatureC ?? null,
      humidityPercent: log?.weather.humidityPercent ?? null,
    };
  });
}

function getEntriesForDate(entries, dateKey) {
  return entries.filter((entry) => entry.dateKey === dateKey);
}

function getMostRecentEntry(entries) {
  if (!entries.length) {
    return null;
  }

  return [...entries].sort((left, right) => {
    const leftDate = String(left.dateKey ?? "");
    const rightDate = String(right.dateKey ?? "");
    const dateCompare = leftDate.localeCompare(rightDate);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return String(left.loggedAt ?? "").localeCompare(String(right.loggedAt ?? ""));
  })[entries.length - 1];
}

function buildRecencySummary(input) {
  const { currentDateKey, nutritionEntries, workoutEntries } = input;
  const todaysNutritionEntries = getEntriesForDate(nutritionEntries, currentDateKey);
  const todaysWorkoutEntries = getEntriesForDate(workoutEntries, currentDateKey);
  const lastNutritionEntry = getMostRecentEntry(nutritionEntries);
  const lastWorkoutEntry = getMostRecentEntry(workoutEntries);
  const nutritionCaloriesToday = Math.round(
    todaysNutritionEntries.reduce((sum, entry) => sum + entry.calories, 0),
  );
  const workoutDurationMinToday = Math.round(
    todaysWorkoutEntries.reduce((sum, entry) => sum + entry.durationMin, 0),
  );
  const workoutActiveCaloriesToday = Math.round(
    todaysWorkoutEntries.reduce((sum, entry) => sum + Math.max(0, entry.caloriesActive), 0),
  );

  return {
    currentDateKey,
    hasNutritionLoggedToday: todaysNutritionEntries.length > 0,
    mealsLoggedToday: todaysNutritionEntries.length,
    nutritionCaloriesToday,
    lastNutritionDateKey: lastNutritionEntry?.dateKey ?? null,
    daysSinceLastNutritionLog: lastNutritionEntry
      ? daysBetweenDateKeys(lastNutritionEntry.dateKey, currentDateKey)
      : null,
    hasWorkoutLoggedToday: todaysWorkoutEntries.length > 0,
    workoutsLoggedToday: todaysWorkoutEntries.length,
    workoutDurationMinToday,
    workoutActiveCaloriesToday,
    lastWorkoutDateKey: lastWorkoutEntry?.dateKey ?? null,
    lastWorkoutName: lastWorkoutEntry?.workoutName || null,
    daysSinceLastWorkout: lastWorkoutEntry
      ? daysBetweenDateKeys(lastWorkoutEntry.dateKey, currentDateKey)
      : null,
  };
}

function buildSignals(input) {
  const signals = [];
  const {
    profile,
    workoutSummary,
    nutritionSummary,
    lifestyleSummary,
    stepGoal,
    recency,
    stepsSummary,
  } = input;

  if (!nutritionSummary.totalMealsLogged) {
    signals.push("No nutrition logs in the selected window.");
  }

  if (!workoutSummary.sessions) {
    signals.push("No workouts logged in the selected window.");
  }

  if (recency && !recency.hasWorkoutLoggedToday && recency.lastWorkoutDateKey) {
    signals.push(
      `No workout logged today. Last logged workout was ${recency.lastWorkoutName || "a workout"} on ${recency.lastWorkoutDateKey}.`,
    );
  }

  if (
    recency &&
    typeof recency.workoutGoalTargetActiveCalories === "number" &&
    recency.workoutGoalTargetActiveCalories > 0 &&
    recency.workoutActiveCaloriesToday < recency.workoutGoalTargetActiveCalories
  ) {
    const gap = Math.max(0, recency.workoutGoalTargetActiveCalories - recency.workoutActiveCaloriesToday);
    signals.push(
      `Workout energy today is ${String(recency.workoutActiveCaloriesToday)} kcal, ${String(gap)} kcal below the target.`,
    );
  }

  if (
    profile.weightKg &&
    nutritionSummary.avgDailyProtein > 0 &&
    nutritionSummary.avgDailyProtein < profile.weightKg * 1.2
  ) {
    signals.push("Protein intake appears low for body weight and recovery goals.");
  }

  if (
    nutritionSummary.avgDailyCalories > 0 &&
    workoutSummary.avgDailyActiveCalories > 0 &&
    workoutSummary.avgDailyActiveCalories > nutritionSummary.avgDailyCalories
  ) {
    signals.push("High estimated energy expenditure relative to logged calories.");
  }

  if (typeof stepGoal === "number" && stepGoal >= 10000) {
    signals.push("User has an ambitious daily step target.");
  }

  if (stepsSummary?.goalMetToday && recency && !recency.hasWorkoutLoggedToday) {
    signals.push("Step goal met today; treat it as light activity even without a logged workout.");
  }

  const todayLifestyle = lifestyleSummary?.daily?.find(
    (day) => day.dateKey === recency?.currentDateKey,
  );

  if (todayLifestyle) {
    if (
      (typeof todayLifestyle.sleepHours === "number" && todayLifestyle.sleepHours > 0 && todayLifestyle.sleepHours < 6) ||
      (typeof todayLifestyle.sleepQuality === "number" && todayLifestyle.sleepQuality <= 2)
    ) {
      signals.push("Poor sleep recovery logged today. Coach should reduce intensity and be more lenient.");
    }

    if (typeof todayLifestyle.stressLevel === "number" && todayLifestyle.stressLevel >= 4) {
      signals.push("High stress logged today. Coach should favor low-friction, recovery-aware guidance.");
    }

    if (
      typeof todayLifestyle.hydrationProgressPercent === "number" &&
      todayLifestyle.hydrationGoalMl > 0 &&
      todayLifestyle.hydrationProgressPercent < 70
    ) {
      signals.push("Hydration is behind today's adaptive goal.");
    }

    if (
      todayLifestyle.weatherCondition === "hot" ||
      todayLifestyle.weatherCondition === "humid" ||
      (typeof todayLifestyle.temperatureC === "number" && todayLifestyle.temperatureC >= 30)
    ) {
      signals.push("Hot or humid weather is logged today. Hydration and heat management matter.");
    }
  }

  if (lifestyleSummary?.poorRecoveryDays > 0) {
    signals.push("Recent lifestyle logs include poor recovery days; avoid aggressive coaching defaults.");
  }

  if (!signals.length) {
    signals.push("Training and nutrition logging are active. Focus on consistency improvements.");
  }

  return signals;
}

export async function loadCoachContext(db, uid, options = {}) {
  const now = new Date();
  const currentDateKey = toDateKey(now);
  const requestedWindow = toNumber(options.windowDays, DEFAULT_CONTEXT_WINDOW_DAYS);
  const windowDays = Math.min(
    MAX_CONTEXT_WINDOW_DAYS,
    Math.max(DEFAULT_CONTEXT_WINDOW_DAYS, Math.floor(requestedWindow || DEFAULT_CONTEXT_WINDOW_DAYS)),
  );
  const includeAllHistory = options.includeAllHistory !== false;

  const userDoc = await db.collection("users").doc(uid).get();
  const userDataRaw = userDoc.exists ? userDoc.data() ?? {} : {};
  const userData = toSerializable(userDataRaw);
  const profile = parseProfile(userData.profile);
  const stepGoal = toNumber(userData.dailyStepGoal, 0) || null;

  const profileHistoryEntries = await loadProfileHistory(db, uid, PROFILE_HISTORY_LIMIT);

  const [nutritionDayDescriptors, workoutDayDescriptors, lifestyleDayDescriptors, stepDayDescriptors] = await Promise.all([
    loadDayDescriptors(db, uid, "nutritionLogs", windowDays, includeAllHistory),
    loadDayDescriptors(db, uid, "workoutLogs", windowDays, includeAllHistory),
    loadDayDescriptors(db, uid, "lifestyleLogs", windowDays, includeAllHistory),
    loadDayDescriptors(db, uid, "stepLogs", windowDays, includeAllHistory),
  ]);

  const [nutritionByDateRaw, workoutByDateRaw, lifestyleByDateRaw, stepByDateRaw] = await Promise.all([
    loadEntriesByDate(db, uid, "nutritionLogs", nutritionDayDescriptors),
    loadEntriesByDate(db, uid, "workoutLogs", workoutDayDescriptors),
    loadDocumentsByDate(db, uid, "lifestyleLogs", lifestyleDayDescriptors),
    loadDocumentsByDate(db, uid, "stepLogs", stepDayDescriptors),
  ]);

  const nutritionByDate = nutritionByDateRaw.map((day) => ({
    dateKey: day.dateKey,
    dayMeta: day.dayMeta,
    entries: day.entries
      .map((entry) => normalizeNutritionEntry(entry, day.dateKey))
      .sort((a, b) => String(a.loggedAt ?? "").localeCompare(String(b.loggedAt ?? ""))),
  }));

  const workoutByDate = workoutByDateRaw.map((day) => ({
    dateKey: day.dateKey,
    dayMeta: day.dayMeta,
    entries: day.entries
      .map((entry) => normalizeWorkoutEntry(entry, day.dateKey))
      .sort((a, b) => String(a.loggedAt ?? "").localeCompare(String(b.loggedAt ?? ""))),
  }));

  const nutritionEntries = nutritionByDate
    .flatMap((day) => day.entries)
    .sort((a, b) => String(a.loggedAt ?? "").localeCompare(String(b.loggedAt ?? "")));

  const workoutEntries = workoutByDate
    .flatMap((day) => day.entries)
    .sort((a, b) => String(a.loggedAt ?? "").localeCompare(String(b.loggedAt ?? "")));

  const lifestyleByDate = lifestyleByDateRaw.map((day) => ({
    dateKey: day.dateKey,
    log: normalizeLifestyleLog(day.data, day.dateKey),
  }));

  const lifestyleLogs = lifestyleByDate
    .map((day) => day.log)
    .sort((a, b) => String(a.dateKey ?? "").localeCompare(String(b.dateKey ?? "")));

  const stepLogs = stepByDateRaw
    .map((day) => normalizeStepLog(day.data, day.dateKey))
    .sort((a, b) => String(a.dateKey ?? "").localeCompare(String(b.dateKey ?? "")));

  const nutritionDateKeys = nutritionByDate.map((day) => day.dateKey);
  const workoutDateKeys = workoutByDate.map((day) => day.dateKey);
  const lifestyleDateKeys = lifestyleByDate.map((day) => day.dateKey);
  const mergedDateKeys = Array.from(new Set([...nutritionDateKeys, ...workoutDateKeys, ...lifestyleDateKeys])).sort();

  const averagingDays = Math.max(
    1,
    includeAllHistory
      ? mergedDateKeys.length || windowDays
      : windowDays,
  );

  const nutritionTotals = {
    totalCalories: Math.round(nutritionEntries.reduce((sum, entry) => sum + entry.calories, 0)),
    totalProtein: Math.round(nutritionEntries.reduce((sum, entry) => sum + entry.protein, 0)),
    totalCarbs: Math.round(nutritionEntries.reduce((sum, entry) => sum + entry.carbs, 0)),
    totalFat: Math.round(nutritionEntries.reduce((sum, entry) => sum + entry.fat, 0)),
    totalMealsLogged: nutritionEntries.length,
  };

  const workoutTotals = {
    sessions: workoutEntries.length,
    totalDurationMin: Math.round(workoutEntries.reduce((sum, entry) => sum + entry.durationMin, 0)),
    totalActiveCalories: Math.round(
      workoutEntries.reduce((sum, entry) => sum + Math.max(0, entry.caloriesActive), 0),
    ),
  };

  const nutritionSummary = {
    ...nutritionTotals,
    avgDailyCalories: Math.round(nutritionTotals.totalCalories / averagingDays),
    avgDailyProtein: Math.round(nutritionTotals.totalProtein / averagingDays),
    avgDailyCarbs: Math.round(nutritionTotals.totalCarbs / averagingDays),
    avgDailyFat: Math.round(nutritionTotals.totalFat / averagingDays),
    daily: buildDailyNutritionSummary(nutritionDateKeys, nutritionEntries),
    allEntries: nutritionEntries,
    entriesByDay: nutritionByDate,
  };

  const intensityCounts = workoutEntries.reduce(
    (acc, entry) => {
      const key = entry.intensity === "low" || entry.intensity === "vigorous" ? entry.intensity : "moderate";
      acc[key] += 1;
      return acc;
    },
    { low: 0, moderate: 0, vigorous: 0 },
  );

  const workoutSummary = {
    ...workoutTotals,
    avgDailyDurationMin: Math.round(workoutTotals.totalDurationMin / averagingDays),
    avgDailyActiveCalories: Math.round(workoutTotals.totalActiveCalories / averagingDays),
    intensityCounts,
    daily: buildDailyWorkoutSummary(workoutDateKeys, workoutEntries),
    allEntries: workoutEntries,
    entriesByDay: workoutByDate,
  };

  const hydrationLogs = lifestyleLogs.filter(
    (entry) => entry.hydration.intakeMl > 0 || entry.hydration.goalMl > 0,
  );
  const recoveryLogs = lifestyleLogs.filter(
    (entry) =>
      entry.recovery.sleepHours !== null ||
      entry.recovery.sleepQuality !== null ||
      entry.recovery.stressLevel !== null ||
      entry.recovery.notes,
  );
  const sleepLogs = recoveryLogs.filter((entry) => typeof entry.recovery.sleepHours === "number");
  const stressLogs = recoveryLogs.filter((entry) => typeof entry.recovery.stressLevel === "number");
  const hydrationProgressLogs = hydrationLogs.filter(
    (entry) => typeof entry.hydration.progressPercent === "number",
  );

  const poorRecoveryDays = recoveryLogs.filter((entry) => {
    const sleepHours = entry.recovery.sleepHours;
    const sleepQuality = entry.recovery.sleepQuality;
    const stressLevel = entry.recovery.stressLevel;
    return (
      (typeof sleepHours === "number" && sleepHours > 0 && sleepHours < 6) ||
      (typeof sleepQuality === "number" && sleepQuality <= 2) ||
      (typeof stressLevel === "number" && stressLevel >= 4)
    );
  }).length;

  const lifestyleSummary = {
    daysLogged: lifestyleLogs.filter((entry) =>
      entry.hydration.intakeMl > 0 ||
      entry.recovery.sleepHours !== null ||
      entry.recovery.sleepQuality !== null ||
      entry.recovery.stressLevel !== null ||
      entry.weather.temperatureC !== null ||
      entry.weather.humidityPercent !== null,
    ).length,
    hydrationDays: hydrationLogs.length,
    avgHydrationProgressPercent: hydrationProgressLogs.length
      ? Math.round(
          hydrationProgressLogs.reduce(
            (sum, entry) => sum + toNumber(entry.hydration.progressPercent, 0),
            0,
          ) / hydrationProgressLogs.length,
        )
      : null,
    recoveryDays: recoveryLogs.length,
    avgSleepHours: sleepLogs.length
      ? Number(
          (
            sleepLogs.reduce((sum, entry) => sum + toNumber(entry.recovery.sleepHours, 0), 0) /
            sleepLogs.length
          ).toFixed(1),
        )
      : null,
    avgStressLevel: stressLogs.length
      ? Number(
          (
            stressLogs.reduce((sum, entry) => sum + toNumber(entry.recovery.stressLevel, 0), 0) /
            stressLogs.length
          ).toFixed(1),
        )
      : null,
    poorRecoveryDays,
    daily: buildDailyLifestyleSummary(lifestyleDateKeys, lifestyleLogs),
    allEntries: lifestyleLogs,
    entriesByDay: lifestyleByDate,
  };

  const stepLogTotal = stepLogs.reduce((sum, log) => sum + log.steps, 0);
  const stepsToday = stepLogs.find((log) => log.dateKey === currentDateKey)?.steps ?? 0;
  const stepGoalToday = stepLogs.find((log) => log.dateKey === currentDateKey)?.goal ?? stepGoal ?? null;
  const lastStepEntry = getMostRecentEntry(stepLogs);
  const stepsSummary = {
    totalSteps: Math.round(stepLogTotal),
    avgDailySteps: stepLogs.length ? Math.round(stepLogTotal / stepLogs.length) : 0,
    daysLogged: stepLogs.length,
    stepsToday,
    stepGoalToday,
    goalMetToday:
      typeof stepGoalToday === "number" && stepGoalToday > 0
        ? stepsToday >= stepGoalToday
        : null,
    lastStepDateKey: lastStepEntry?.dateKey ?? null,
    daysSinceLastStepLog: lastStepEntry
      ? daysBetweenDateKeys(lastStepEntry.dateKey, currentDateKey)
      : null,
    daily: stepLogs,
  };

  const recencyBase = buildRecencySummary({
    currentDateKey,
    nutritionEntries,
    workoutEntries,
  });
  const intakeDrivenTarget = recencyBase.nutritionCaloriesToday > 0
    ? clampNumber(
        Math.round(recencyBase.nutritionCaloriesToday * ACTIVE_CALORIE_INTAKE_RATIO),
        MIN_ACTIVE_CALORIE_TARGET,
        MAX_ACTIVE_CALORIE_TARGET,
      )
    : null;
  const historyDrivenTarget = workoutSummary.avgDailyActiveCalories > 0
    ? Math.round(workoutSummary.avgDailyActiveCalories)
    : null;
  const workoutGoalTargetActiveCalories =
    typeof intakeDrivenTarget === "number"
      ? Math.max(intakeDrivenTarget, historyDrivenTarget ?? 0, MIN_ACTIVE_CALORIE_TARGET)
      : historyDrivenTarget ?? MIN_ACTIVE_CALORIE_TARGET;
  const workoutGoalTargetMin = workoutSummary.avgDailyDurationMin > 0
    ? workoutSummary.avgDailyDurationMin
    : null;
  const workoutGoalAchievedToday =
    typeof workoutGoalTargetActiveCalories === "number"
      ? recencyBase.workoutActiveCaloriesToday >= workoutGoalTargetActiveCalories
      : typeof workoutGoalTargetMin === "number" &&
        recencyBase.hasWorkoutLoggedToday &&
        recencyBase.workoutDurationMinToday >= workoutGoalTargetMin;
  const workoutActiveCalorieGapToday =
    typeof workoutGoalTargetActiveCalories === "number"
      ? Math.max(0, workoutGoalTargetActiveCalories - recencyBase.workoutActiveCaloriesToday)
      : null;
  const recency = {
    ...recencyBase,
    workoutGoalTargetActiveCalories,
    workoutActiveCalorieGapToday,
    workoutGoalTargetMin,
    workoutGoalAchievedToday,
  };

  const signals = buildSignals({
    profile,
    profileHistory: {
      entries: profileHistoryEntries,
      entryCount: profileHistoryEntries.length,
    },
    workoutSummary,
    nutritionSummary,
    lifestyleSummary,
    stepGoal,
    recency,
    stepsSummary,
  });

  return {
    generatedAt: now.toISOString(),
    currentDateKey,
    recentDateKeys: buildRecentDateKeys(windowDays),
    user: {
      uid,
      displayName: typeof userData.displayName === "string" ? userData.displayName : null,
      email: typeof userData.email === "string" ? userData.email : null,
      rawDocument: userData,
    },
    profile,
    stepGoal,
    window: {
      includeAllHistory,
      requestedDays: windowDays,
      averagingDays,
      nutritionDays: nutritionDateKeys.length,
      workoutDays: workoutDateKeys.length,
      fromDateKey: mergedDateKeys[0] ?? null,
      toDateKey: mergedDateKeys[mergedDateKeys.length - 1] ?? null,
    },
    recency,
    nutrition: nutritionSummary,
    workouts: workoutSummary,
    lifestyle: lifestyleSummary,
    steps: stepsSummary,
    signals,
  };
}
