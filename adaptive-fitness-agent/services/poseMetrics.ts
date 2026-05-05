export type PoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type PoseFrameMetrics = {
  timestampMs: number;
  confidence: number;
  landmarkCount: number;
  signals: Record<string, number>;
};

export type PoseTimelineSample = {
  tSec: number;
  confidence: number;
  values: Record<string, number>;
};

export type PoseMetricSummary = {
  exerciseName: string;
  durationSec: number;
  repsDetected: number;
  repCounting: {
    mode: "general";
    dominantSignal: string | null;
    confidence: number;
  };
  confidenceAvg: number;
  signals: Record<
    string,
    {
      min: number;
      max: number;
      avg: number;
      movement: number;
    }
  >;
  landmarks: {
    count: number;
    points: Record<
      string,
      {
        xAvg: number | null;
        yAvg: number | null;
        zAvg: number | null;
        visibilityAvg: number | null;
        movement: number;
      }
    >;
  };
  posture: {
    torsoLeanDegAvg: number | null;
    torsoLeanDegMax: number | null;
    shoulderImbalanceAvg: number | null;
    hipImbalanceAvg: number | null;
    shoulderTiltDegAvg: number | null;
    shoulderTiltDegMax: number | null;
    hipTiltDegAvg: number | null;
    hipTiltDegMax: number | null;
    leftKneeAngleAvg: number | null;
    rightKneeAngleAvg: number | null;
    kneeAngleDifferenceAvg: number | null;
    leftElbowAngleAvg: number | null;
    rightElbowAngleAvg: number | null;
    elbowAngleDifferenceAvg: number | null;
  };
  movementDetail: {
    baseline: PoseTimelineSample | null;
    timeline: PoseTimelineSample[];
    notableChanges: string[];
  };
  sampleCount: number;
};

export type PoseConnection = {
  start: number;
  end: number;
};

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function getLandmark(landmarks: PoseLandmark[], index: number): PoseLandmark | null {
  const landmark = landmarks[index];
  if (!landmark) return null;
  const x = toFiniteNumber(landmark.x);
  const y = toFiniteNumber(landmark.y);
  if (x === null || y === null) return null;
  return landmark;
}

function visible(landmark: PoseLandmark | null) {
  if (!landmark) return false;
  return landmark.visibility === undefined || landmark.visibility >= 0.35;
}

function averageVisibility(landmarks: PoseLandmark[]) {
  const values = landmarks
    .map((landmark) => toFiniteNumber(landmark.visibility))
    .filter((value): value is number => value !== null);

  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function angleDeg(a: PoseLandmark | null, b: PoseLandmark | null, c: PoseLandmark | null) {
  if (!visible(a) || !visible(b) || !visible(c) || !a || !b || !c) return null;

  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const abMag = Math.hypot(ab.x, ab.y);
  const cbMag = Math.hypot(cb.x, cb.y);
  if (abMag === 0 || cbMag === 0) return null;

  const cosine = Math.max(-1, Math.min(1, (ab.x * cb.x + ab.y * cb.y) / (abMag * cbMag)));
  return Math.round((Math.acos(cosine) * 180) / Math.PI);
}

function midpoint(a: PoseLandmark | null, b: PoseLandmark | null) {
  if (!visible(a) || !visible(b) || !a || !b) return null;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function distance(a: PoseLandmark | null, b: PoseLandmark | null) {
  if (!visible(a) || !visible(b) || !a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function tiltDeg(a: PoseLandmark | null, b: PoseLandmark | null) {
  if (!visible(a) || !visible(b) || !a || !b) return null;
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (dx === 0 && dy === 0) return null;
  return Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
}

function torsoLeanDeg(shoulderMid: { x: number; y: number } | null, hipMid: { x: number; y: number } | null) {
  if (!shoulderMid || !hipMid) return null;
  const dx = Math.abs(shoulderMid.x - hipMid.x);
  const dy = Math.abs(shoulderMid.y - hipMid.y);
  if (dx === 0 && dy === 0) return null;
  return Math.round((Math.atan2(dx, dy) * 180) / Math.PI);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function addSignal(signals: Record<string, number>, key: string, value: number | null) {
  if (value === null || !Number.isFinite(value)) return;
  signals[key] = round(value);
}

function normalizeConnection(raw: unknown): PoseConnection | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const start = toFiniteNumber(value.start ?? value.from ?? value[0]);
  const end = toFiniteNumber(value.end ?? value.to ?? value[1]);
  if (start === null || end === null) return null;
  return {
    start: Math.floor(start),
    end: Math.floor(end),
  };
}

function normalizeConnections(connections: unknown) {
  if (!Array.isArray(connections)) {
    return [];
  }

  return connections
    .map(normalizeConnection)
    .filter((connection): connection is PoseConnection => connection !== null);
}

function buildConnectedTriples(connections: PoseConnection[]) {
  const neighborsByIndex = new Map<number, Set<number>>();

  connections.forEach((connection) => {
    if (!neighborsByIndex.has(connection.start)) {
      neighborsByIndex.set(connection.start, new Set());
    }
    if (!neighborsByIndex.has(connection.end)) {
      neighborsByIndex.set(connection.end, new Set());
    }
    neighborsByIndex.get(connection.start)?.add(connection.end);
    neighborsByIndex.get(connection.end)?.add(connection.start);
  });

  const triples: Array<[number, number, number]> = [];

  neighborsByIndex.forEach((neighbors, center) => {
    const neighborList = Array.from(neighbors).sort((a, b) => a - b);
    for (let leftIndex = 0; leftIndex < neighborList.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < neighborList.length; rightIndex += 1) {
        triples.push([neighborList[leftIndex], center, neighborList[rightIndex]]);
      }
    }
  });

  return triples;
}

function averageLandmark(landmarks: PoseLandmark[]) {
  const visibleLandmarks = landmarks.filter(visible);
  if (!visibleLandmarks.length) return null;

  return {
    x: visibleLandmarks.reduce((sum, landmark) => sum + landmark.x, 0) / visibleLandmarks.length,
    y: visibleLandmarks.reduce((sum, landmark) => sum + landmark.y, 0) / visibleLandmarks.length,
  };
}

function addAllLandmarkSignals(signals: Record<string, number>, landmarks: PoseLandmark[]) {
  landmarks.forEach((landmark, index) => {
    if (!visible(landmark)) return;

    addSignal(signals, `landmark.${String(index)}.x`, landmark.x);
    addSignal(signals, `landmark.${String(index)}.y`, landmark.y);

    const z = toFiniteNumber(landmark.z);
    if (z !== null) {
      addSignal(signals, `landmark.${String(index)}.z`, z);
    }

    const visibilityValue = toFiniteNumber(landmark.visibility);
    if (visibilityValue !== null) {
      addSignal(signals, `landmark.${String(index)}.visibility`, visibilityValue);
    }
  });
}

function addConnectionSignals(
  signals: Record<string, number>,
  landmarks: PoseLandmark[],
  connections: PoseConnection[],
) {
  connections.forEach((connection) => {
    addSignal(
      signals,
      `connection.${String(connection.start)}.${String(connection.end)}.distance`,
      distance(getLandmark(landmarks, connection.start), getLandmark(landmarks, connection.end)),
    );
  });

  buildConnectedTriples(connections).forEach(([a, b, c]) => {
    addSignal(
      signals,
      `angle.${String(a)}.${String(b)}.${String(c)}.deg`,
      angleDeg(getLandmark(landmarks, a), getLandmark(landmarks, b), getLandmark(landmarks, c)),
    );
  });
}

function addPostureSignals(signals: Record<string, number>, landmarks: PoseLandmark[]) {
  const leftShoulder = getLandmark(landmarks, 11);
  const rightShoulder = getLandmark(landmarks, 12);
  const leftElbow = getLandmark(landmarks, 13);
  const rightElbow = getLandmark(landmarks, 14);
  const leftWrist = getLandmark(landmarks, 15);
  const rightWrist = getLandmark(landmarks, 16);
  const leftHip = getLandmark(landmarks, 23);
  const rightHip = getLandmark(landmarks, 24);
  const leftKnee = getLandmark(landmarks, 25);
  const rightKnee = getLandmark(landmarks, 26);
  const leftAnkle = getLandmark(landmarks, 27);
  const rightAnkle = getLandmark(landmarks, 28);

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const leftKneeAngle = angleDeg(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = angleDeg(rightHip, rightKnee, rightAnkle);
  const leftElbowAngle = angleDeg(leftShoulder, leftElbow, leftWrist);
  const rightElbowAngle = angleDeg(rightShoulder, rightElbow, rightWrist);

  addSignal(signals, "posture.torsoLeanDeg", torsoLeanDeg(shoulderMid, hipMid));
  addSignal(
    signals,
    "posture.shoulderImbalance",
    visible(leftShoulder) && visible(rightShoulder) && leftShoulder && rightShoulder
      ? Math.abs(leftShoulder.y - rightShoulder.y)
      : null,
  );
  addSignal(
    signals,
    "posture.hipImbalance",
    visible(leftHip) && visible(rightHip) && leftHip && rightHip ? Math.abs(leftHip.y - rightHip.y) : null,
  );
  addSignal(signals, "posture.shoulderTiltDeg", tiltDeg(leftShoulder, rightShoulder));
  addSignal(signals, "posture.hipTiltDeg", tiltDeg(leftHip, rightHip));
  addSignal(signals, "posture.leftKneeAngleDeg", leftKneeAngle);
  addSignal(signals, "posture.rightKneeAngleDeg", rightKneeAngle);
  addSignal(
    signals,
    "posture.kneeAngleDifference",
    leftKneeAngle !== null && rightKneeAngle !== null ? Math.abs(leftKneeAngle - rightKneeAngle) : null,
  );
  addSignal(signals, "posture.leftElbowAngleDeg", leftElbowAngle);
  addSignal(signals, "posture.rightElbowAngleDeg", rightElbowAngle);
  addSignal(
    signals,
    "posture.elbowAngleDifference",
    leftElbowAngle !== null && rightElbowAngle !== null ? Math.abs(leftElbowAngle - rightElbowAngle) : null,
  );
}

export function extractPoseFrameMetrics(
  landmarks: PoseLandmark[],
  timestampMs = Date.now(),
  connectionsInput?: unknown,
): PoseFrameMetrics | null {
  if (!Array.isArray(landmarks) || landmarks.length === 0) {
    return null;
  }

  const signals: Record<string, number> = {};
  const connections = normalizeConnections(connectionsInput);
  addAllLandmarkSignals(signals, landmarks);
  addConnectionSignals(signals, landmarks, connections);
  addPostureSignals(signals, landmarks);

  const center = averageLandmark(landmarks);
  addSignal(signals, "pose.center.x", center?.x ?? null);
  addSignal(signals, "pose.center.y", center?.y ?? null);

  return {
    timestampMs,
    confidence: round(averageVisibility(landmarks), 3),
    landmarkCount: landmarks.length,
    signals,
  };
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

function movingAverage(values: number[], radius = 2) {
  return values.map((_, index) => {
    const from = Math.max(0, index - radius);
    const to = Math.min(values.length - 1, index + radius);
    const window = values.slice(from, to + 1);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });
}

function countCycles(values: number[]) {
  if (values.length < 12) return 0;

  const low = 0.35;
  const high = 0.65;

  let seenLow = false;
  let highAfterLow = 0;
  for (const value of values) {
    if (value <= low) {
      seenLow = true;
    } else if (value >= high && seenLow) {
      highAfterLow += 1;
      seenLow = false;
    }
  }

  let seenHigh = false;
  let lowAfterHigh = 0;
  for (const value of values) {
    if (value >= high) {
      seenHigh = true;
    } else if (value <= low && seenHigh) {
      lowAfterHigh += 1;
      seenHigh = false;
    }
  }

  return Math.max(highAfterLow, lowAfterHigh);
}

function analyzeSignal(frames: PoseFrameMetrics[], key: string) {
  if (key.endsWith(".visibility")) {
    return null;
  }

  const values = frames
    .map((frame) => frame.signals[key])
    .filter((value) => Number.isFinite(value));

  if (values.length < 12) {
    return null;
  }

  const smoothed = movingAverage(values);
  const low = percentile(smoothed, 0.05);
  const high = percentile(smoothed, 0.95);
  const movement = high - low;
  if (movement <= 0) return null;

  const normalized = smoothed.map((value) => Math.max(0, Math.min(1, (value - low) / movement)));
  const reps = countCycles(normalized);
  const coverage = values.length / Math.max(1, frames.length);
  const isAngle = key.startsWith("angle.");
  const isCoordinate = /^landmark\.\d+\.[xyz]$/.test(key) || key.startsWith("pose.center.");
  const movementThreshold = isAngle ? 22 : isCoordinate ? 0.04 : 0.06;
  const movementScore = Math.max(0, Math.min(1, movement / (isAngle ? 70 : 0.35)));
  const periodicScore = Math.max(0, Math.min(1, reps / 3));
  const score = movement >= movementThreshold ? movementScore * 0.55 + periodicScore * 0.35 + coverage * 0.1 : 0;

  return {
    key,
    reps,
    score,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    movement,
  };
}

function summarizeLandmarks(frames: PoseFrameMetrics[]) {
  const landmarkCount = Math.max(0, ...frames.map((frame) => frame.landmarkCount || 0));
  const points: PoseMetricSummary["landmarks"]["points"] = {};

  for (let index = 0; index < landmarkCount; index += 1) {
    const xValues = frames
      .map((frame) => frame.signals[`landmark.${String(index)}.x`])
      .filter((value) => Number.isFinite(value));
    const yValues = frames
      .map((frame) => frame.signals[`landmark.${String(index)}.y`])
      .filter((value) => Number.isFinite(value));
    const zValues = frames
      .map((frame) => frame.signals[`landmark.${String(index)}.z`])
      .filter((value) => Number.isFinite(value));
    const visibilityValues = frames
      .map((frame) => frame.signals[`landmark.${String(index)}.visibility`])
      .filter((value) => Number.isFinite(value));

    const avg = (values: number[]) =>
      values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 4) : null;

    const movement =
      xValues.length && yValues.length
        ? Math.hypot(Math.max(...xValues) - Math.min(...xValues), Math.max(...yValues) - Math.min(...yValues))
        : 0;

    points[String(index)] = {
      xAvg: avg(xValues),
      yAvg: avg(yValues),
      zAvg: avg(zValues),
      visibilityAvg: avg(visibilityValues),
      movement: round(movement, 4),
    };
  }

  return {
    count: landmarkCount,
    points,
  };
}

const TIMELINE_SIGNAL_KEYS = [
  "posture.torsoLeanDeg",
  "posture.shoulderTiltDeg",
  "posture.hipTiltDeg",
  "posture.leftKneeAngleDeg",
  "posture.rightKneeAngleDeg",
  "posture.kneeAngleDifference",
  "posture.leftElbowAngleDeg",
  "posture.rightElbowAngleDeg",
  "posture.elbowAngleDifference",
  "pose.center.x",
  "pose.center.y",
] as const;

const TIMELINE_SIGNAL_LABELS: Record<(typeof TIMELINE_SIGNAL_KEYS)[number], string> = {
  "posture.torsoLeanDeg": "torso lean",
  "posture.shoulderTiltDeg": "shoulder tilt",
  "posture.hipTiltDeg": "hip tilt",
  "posture.leftKneeAngleDeg": "left knee angle",
  "posture.rightKneeAngleDeg": "right knee angle",
  "posture.kneeAngleDifference": "knee angle difference",
  "posture.leftElbowAngleDeg": "left elbow angle",
  "posture.rightElbowAngleDeg": "right elbow angle",
  "posture.elbowAngleDifference": "elbow angle difference",
  "pose.center.x": "side-to-side body position",
  "pose.center.y": "vertical body position",
};

function compactSignalName(key: string) {
  return key
    .replace(/^posture\./, "")
    .replace(/^pose\.center\./, "center")
    .replace(/Deg$/, "")
    .replace(/\./g, "");
}

function snapshotFromFrame(frame: PoseFrameMetrics, startTimestampMs: number): PoseTimelineSample {
  const values: Record<string, number> = {};

  TIMELINE_SIGNAL_KEYS.forEach((key) => {
    const value = frame.signals[key];
    if (Number.isFinite(value)) {
      values[compactSignalName(key)] = round(value, key.startsWith("pose.center.") ? 3 : 1);
    }
  });

  return {
    tSec: round((frame.timestampMs - startTimestampMs) / 1000, 1),
    confidence: round(frame.confidence, 2),
    values,
  };
}

function sampleTimeline(frames: PoseFrameMetrics[], maxSamples = 24) {
  if (!frames.length) {
    return [];
  }

  if (frames.length <= maxSamples) {
    return frames.map((frame) => snapshotFromFrame(frame, frames[0].timestampMs));
  }

  return Array.from({ length: maxSamples }, (_, index) => {
    const sourceIndex = Math.round((index * (frames.length - 1)) / (maxSamples - 1));
    return snapshotFromFrame(frames[sourceIndex], frames[0].timestampMs);
  });
}

function firstUsableTimelineSample(timeline: PoseTimelineSample[]) {
  return timeline.find((sample) => Object.keys(sample.values).length > 0) ?? null;
}

function valueFromSample(sample: PoseTimelineSample | null, key: string) {
  if (!sample) return null;
  const value = sample.values[compactSignalName(key)];
  return Number.isFinite(value) ? value : null;
}

function describeChange(key: (typeof TIMELINE_SIGNAL_KEYS)[number], from: number, to: number) {
  const label = TIMELINE_SIGNAL_LABELS[key];
  const delta = round(to - from, 1);
  const direction = delta > 0 ? "increased" : "decreased";
  return `${label} ${direction} from ${String(from)} to ${String(to)} during the set.`;
}

function buildNotableChanges(timeline: PoseTimelineSample[]) {
  const baseline = firstUsableTimelineSample(timeline);
  const changes: Array<{ text: string; score: number }> = [];

  TIMELINE_SIGNAL_KEYS.forEach((key) => {
    const baselineValue = valueFromSample(baseline, key);
    if (baselineValue === null) {
      return;
    }

    const biggestChange = timeline
      .map((sample) => valueFromSample(sample, key))
      .filter((value): value is number => value !== null)
      .map((value) => ({
        value,
        delta: Math.abs(value - baselineValue),
      }))
      .sort((a, b) => b.delta - a.delta)[0];

    if (!biggestChange) {
      return;
    }

    const delta = biggestChange.delta;
    const threshold = key.startsWith("pose.center.") ? 0.08 : key.includes("Difference") ? 8 : 12;
    if (delta >= threshold) {
      changes.push({
        text: describeChange(key, baselineValue, biggestChange.value),
        score: delta / threshold,
      });
    }
  });

  const lowConfidenceSamples = timeline.filter((sample) => sample.confidence < 0.45).length;
  if (timeline.length && lowConfidenceSamples / timeline.length >= 0.35) {
    changes.push({
      text: "Pose visibility dropped for much of the recording, so form feedback may be less certain.",
      score: 1,
    });
  }

  return changes
    .sort((a, b) => b.score - a.score)
    .map((change) => change.text)
    .slice(0, 6);
}

function buildMovementDetail(frames: PoseFrameMetrics[]): PoseMetricSummary["movementDetail"] {
  const timeline = sampleTimeline(frames);
  return {
    baseline: firstUsableTimelineSample(timeline),
    timeline,
    notableChanges: buildNotableChanges(timeline),
  };
}

export function summarizePoseMetrics(
  exerciseName: string,
  frames: PoseFrameMetrics[],
): PoseMetricSummary {
  const sortedFrames = [...frames].sort((a, b) => a.timestampMs - b.timestampMs);
  const durationMs =
    sortedFrames.length >= 2
      ? sortedFrames[sortedFrames.length - 1].timestampMs - sortedFrames[0].timestampMs
      : 0;

  const keys = Array.from(new Set(sortedFrames.flatMap((frame) => Object.keys(frame.signals))));
  const signalAnalyses = keys
    .map((key) => analyzeSignal(sortedFrames, key))
    .filter((item): item is NonNullable<ReturnType<typeof analyzeSignal>> => item !== null);

  const dominant = [...signalAnalyses].sort((a, b) => b.score - a.score)[0] ?? null;
  const signals = Object.fromEntries(
    signalAnalyses.map((signal) => [
      signal.key,
      {
        min: round(signal.min),
        max: round(signal.max),
        avg: round(signal.avg),
        movement: round(signal.movement),
      },
    ]),
  );

  const confidenceValues = sortedFrames.map((frame) => frame.confidence).filter(Number.isFinite);
  const avgConfidence = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0;

  const postureValue = (key: string, mode: "avg" | "max") => {
    const values = sortedFrames
      .map((frame) => frame.signals[key])
      .filter((value) => Number.isFinite(value));
    if (!values.length) return null;
    const result =
      mode === "avg"
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : Math.max(...values);
    return round(result);
  };

  return {
    exerciseName: exerciseName.trim(),
    durationSec: round(durationMs / 1000, 1),
    repsDetected: dominant ? dominant.reps : 0,
    repCounting: {
      mode: "general",
      dominantSignal: dominant?.key ?? null,
      confidence: round(Math.max(0, Math.min(1, dominant?.score ?? 0)), 2),
    },
    confidenceAvg: round(avgConfidence, 2),
    signals,
    landmarks: summarizeLandmarks(sortedFrames),
    posture: {
      torsoLeanDegAvg: postureValue("posture.torsoLeanDeg", "avg"),
      torsoLeanDegMax: postureValue("posture.torsoLeanDeg", "max"),
      shoulderImbalanceAvg: postureValue("posture.shoulderImbalance", "avg"),
      hipImbalanceAvg: postureValue("posture.hipImbalance", "avg"),
      shoulderTiltDegAvg: postureValue("posture.shoulderTiltDeg", "avg"),
      shoulderTiltDegMax: postureValue("posture.shoulderTiltDeg", "max"),
      hipTiltDegAvg: postureValue("posture.hipTiltDeg", "avg"),
      hipTiltDegMax: postureValue("posture.hipTiltDeg", "max"),
      leftKneeAngleAvg: postureValue("posture.leftKneeAngleDeg", "avg"),
      rightKneeAngleAvg: postureValue("posture.rightKneeAngleDeg", "avg"),
      kneeAngleDifferenceAvg: postureValue("posture.kneeAngleDifference", "avg"),
      leftElbowAngleAvg: postureValue("posture.leftElbowAngleDeg", "avg"),
      rightElbowAngleAvg: postureValue("posture.rightElbowAngleDeg", "avg"),
      elbowAngleDifferenceAvg: postureValue("posture.elbowAngleDifference", "avg"),
    },
    movementDetail: buildMovementDetail(sortedFrames),
    sampleCount: sortedFrames.length,
  };
}
