import { mean, safeDivide, toNumber } from "./utils.js";

export function buildDailySeries(dateKeys, dailyRecords, selector, fallback = 0) {
  const map = new Map(
    (Array.isArray(dailyRecords) ? dailyRecords : []).map((record) => [record.dateKey, selector(record)]),
  );

  return (Array.isArray(dateKeys) ? dateKeys : []).map((dateKey) => {
    const value = map.get(dateKey);
    return Number.isFinite(value) ? value : fallback;
  });
}

export function buildDailyNullableSeries(dateKeys, dailyRecords, selector) {
  const map = new Map(
    (Array.isArray(dailyRecords) ? dailyRecords : []).map((record) => [record.dateKey, selector(record)]),
  );

  return (Array.isArray(dateKeys) ? dateKeys : []).map((dateKey) => {
    const value = map.get(dateKey);
    return Number.isFinite(value) ? value : null;
  });
}

export function computeSlope(values) {
  const points = (Array.isArray(values) ? values : [])
    .map((value, index) => ({ x: index, y: toNumber(value, null) }))
    .filter((point) => Number.isFinite(point.y));

  if (points.length < 2) {
    return 0;
  }

  const meanX = mean(points.map((point) => point.x));
  const meanY = mean(points.map((point) => point.y));

  let numerator = 0;
  let denominator = 0;

  for (const point of points) {
    const dx = point.x - meanX;
    numerator += dx * (point.y - meanY);
    denominator += dx * dx;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

function averageWindow(values, window, offset = 0) {
  const sliced = values.slice(Math.max(0, values.length - window - offset), values.length - offset);
  const valid = sliced.map((value) => toNumber(value, null)).filter(Number.isFinite);
  return valid.length ? mean(valid) : 0;
}

export function computeTrend(values, options = {}) {
  const window = Number.isFinite(options.window) ? Math.max(2, options.window) : 7;
  const slope = computeSlope(values);
  const currentAvg = averageWindow(values, window, 0);
  const prevAvg = averageWindow(values, window, window);
  const changePct = prevAvg > 0 ? safeDivide(currentAvg - prevAvg, prevAvg, 0) : 0;

  const threshold = Number.isFinite(options.threshold)
    ? options.threshold
    : Math.max(0.05, Math.abs(slope) > 0 ? Math.abs(slope) * 0.05 : 0.05);

  let direction = "flat";
  if (slope > threshold) direction = "up";
  if (slope < -threshold) direction = "down";

  return {
    slope,
    direction,
    currentAvg: Math.round(currentAvg * 10) / 10,
    previousAvg: Math.round(prevAvg * 10) / 10,
    changePct: Math.round(changePct * 1000) / 1000,
  };
}
