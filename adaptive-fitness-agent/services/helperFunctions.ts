export function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function toNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toPositiveNumberOrThrow(value: number, fieldName: string) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(fieldName + " must be a positive number.");
    }
    return value;
}

export function toPositiveNumber(value: unknown, fallback = 1) {
  const n = toNumber(value, fallback);
  return n > 0 ? n : fallback;
}

export function toOptionalPositiveInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }

  return Math.floor(n);
}

export function getTodayDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}
