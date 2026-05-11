export function toNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

export function safeDivide(numerator, denominator, fallback = 0) {
  const n = toNumber(numerator, null);
  const d = toNumber(denominator, null);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) {
    return fallback;
  }
  return n / d;
}

export function sum(values) {
  if (!Array.isArray(values)) {
    return 0;
  }
  return values.reduce((acc, value) => {
    const n = toNumber(value, 0);
    return acc + n;
  }, 0);
}

export function mean(values) {
  if (!Array.isArray(values)) {
    return 0;
  }
  const valid = values.map((value) => toNumber(value, null)).filter(Number.isFinite);
  if (!valid.length) {
    return 0;
  }
  return sum(valid) / valid.length;
}

export function roundTo(value, digits = 1) {
  const factor = Math.pow(10, digits);
  return Math.round(toNumber(value, 0) * factor) / factor;
}

export function scoreLevel(score) {
  const value = toNumber(score, 0);
  if (value >= 75) return "high";
  if (value >= 50) return "moderate";
  if (value >= 30) return "low";
  return "very_low";
}

export function normalizeGoal(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "LOSE_WEIGHT" || normalized === "GAIN_MUSCLE" || normalized === "MAINTAIN") {
    return normalized;
  }
  return "MAINTAIN";
}

export function normalizeLifestyle(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "SEDENTARY" || normalized === "LIGHT" || normalized === "MODERATE" || normalized === "ACTIVE" || normalized === "VERY_ACTIVE") {
    return normalized;
  }
  return "MODERATE";
}

export function normalizeGender(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "MALE" || normalized === "M" || normalized === "MAN") {
    return "male";
  }
  if (normalized === "FEMALE" || normalized === "F" || normalized === "WOMAN") {
    return "female";
  }
  return null;
}

export function computeStreak(dateKeys, isActiveByDateKey) {
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) {
    return 0;
  }

  let streak = 0;
  for (const dateKey of dateKeys) {
    if (isActiveByDateKey.get(dateKey)) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}
