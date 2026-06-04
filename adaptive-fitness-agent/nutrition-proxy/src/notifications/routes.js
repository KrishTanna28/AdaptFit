import crypto from "crypto";
import express from "express";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getCoachFirestore, verifyCoachIdToken } from "../coach/firebaseAdmin.js";
import { logger } from "../observability/logger.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const DEFAULT_TIME_ZONE = "UTC";
const DEFAULT_SENDS_MIN = 3;
const DEFAULT_SENDS_MAX = 5;
const DEFAULT_GAP_MINUTES_MIN = 180;
const DEFAULT_GAP_MINUTES_MAX = 240;
const DEFAULT_MAX_USERS_PER_TICK = 500;
const DEFAULT_MAX_DUE_PER_TICK = 100;
const MINUTE_MS = 60 * 1000;
const LOCAL_MIDNIGHT_WINDOW_MINUTES = 2;

const FALLBACK_COPY = {
  log_nudge: [
    {
      title: "Log today's progress",
      body: "Add a meal or workout so your coach can keep today's plan accurate.",
    },
    {
      title: "Quick check-in",
      body: "No meals or workouts logged yet. A 30-second update keeps your day on track.",
    },
  ],
  late_low_progress: [
    {
      title: "Still time to move the needle",
      body: "You're under 60% for today. Log what you've done or take one small action now.",
    },
    {
      title: "Finish the day strong",
      body: "A short walk, a simple meal log, or a quick workout can still count today.",
    },
  ],
  praise: [
    {
      title: "Nice work today",
      body: "You're on track. We'll keep the reminders lighter for the rest of the day.",
    },
    {
      title: "Goal momentum",
      body: "Today's progress is looking good. Keep doing what is already working.",
    },
  ],
  check_in: [
    {
      title: "Small progress counts",
      body: "Log your latest meal, workout, or steps so AdaptFit can update your day.",
    },
    {
      title: "Keep the thread going",
      body: "A quick update now helps your coach understand where today is headed.",
    },
  ],
};

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.floor(n);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseBearerToken(authorizationHeader) {
  const header = String(authorizationHeader ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

async function requireNotificationUser(req, res, next) {
  try {
    const idToken = parseBearerToken(req.headers.authorization);
    if (!idToken) {
      return res.status(401).json({ message: "Missing auth token." });
    }

    const decoded = await verifyCoachIdToken(idToken);
    req.notificationUser = {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : null,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired auth token.",
      detail: error instanceof Error ? error.message : "Auth verification failed.",
    });
  }
}

function requireCronSecret(req, res, next) {
  const expected = String(process.env.NOTIFICATIONS_CRON_SECRET ?? "").trim();
  if (!expected && process.env.NODE_ENV !== "production") {
    return next();
  }

  const provided = String(req.headers["x-cron-secret"] ?? req.query.secret ?? "").trim();
  if (expected && provided === expected) {
    return next();
  }

  return res.status(401).json({ message: "Invalid cron secret." });
}

function hashId(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function isExpoPushToken(value) {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(String(value ?? "").trim());
}

function normalizeTimeZone(value) {
  const timeZone = String(value ?? "").trim();
  if (!timeZone) {
    return DEFAULT_TIME_ZONE;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function getLocalParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function localDateKey(date, timeZone) {
  const parts = getLocalParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function zonedLocalDateTimeToUtc(dateKey, minuteOfDay, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utc = new Date(targetUtcMs);

  for (let i = 0; i < 3; i += 1) {
    const local = getLocalParts(utc, timeZone);
    const localAsUtcMs = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
      0,
    );
    utc = new Date(utc.getTime() + targetUtcMs - localAsUtcMs);
  }

  return utc;
}

function seededRandom(seed) {
  let state = crypto.createHash("sha256").update(seed).digest().readUInt32BE(0);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function pickRandomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function buildScheduleSlots({ uid, dateKey, timeZone }) {
  const random = seededRandom(`${uid}:${dateKey}:notifications`);
  const sendsMin = toPositiveInt(process.env.NOTIFICATIONS_DAILY_SENDS_MIN, DEFAULT_SENDS_MIN);
  const sendsMax = toPositiveInt(process.env.NOTIFICATIONS_DAILY_SENDS_MAX, DEFAULT_SENDS_MAX);
  const targetSends = pickRandomInt(random, Math.min(sendsMin, sendsMax), Math.max(sendsMin, sendsMax));
  const minGapMin = toPositiveInt(process.env.NOTIFICATIONS_MIN_GAP_MINUTES_MIN, DEFAULT_GAP_MINUTES_MIN);
  const minGapMax = toPositiveInt(process.env.NOTIFICATIONS_MIN_GAP_MINUTES_MAX, DEFAULT_GAP_MINUTES_MAX);
  const minGapMinutes = pickRandomInt(random, Math.min(minGapMin, minGapMax), Math.max(minGapMin, minGapMax));
  const latestMinute = 24 * 60 - 1;
  const extraWindow = Math.max(0, latestMinute - minGapMinutes * (targetSends - 1));
  const bases = Array.from({ length: targetSends }, () => pickRandomInt(random, 0, extraWindow)).sort(
    (a, b) => a - b,
  );

  return {
    targetSends,
    minGapMinutes,
    slots: bases.map((baseMinute, index) => {
      const minuteOfDay = clamp(baseMinute + index * minGapMinutes, 0, latestMinute);
      const dueAtUtcDate = zonedLocalDateTimeToUtc(dateKey, minuteOfDay, timeZone);
      return {
        slotId: `slot-${String(index + 1).padStart(2, "0")}`,
        minuteOfDay,
        dueAtUtcDate,
        dueAtLocalTime: `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`,
      };
    }),
  };
}

function scheduleRef(db, uid, dateKey) {
  return db.collection("users").doc(uid).collection("notificationSchedules").doc(dateKey);
}

function slotRef(db, uid, dateKey, slotId) {
  return db
    .collection("users")
    .doc(uid)
    .collection("notificationScheduleSlots")
    .doc(`${dateKey}_${slotId}`);
}

function sendLogRef(db, uid, dateKey, slotId) {
  return db.collection("users").doc(uid).collection("notificationSendLogs").doc(`${dateKey}_${slotId}`);
}

function queueRef(db, uid, dateKey, slotId) {
  return db.collection("notificationDueQueue").doc(hashId(`${uid}:${dateKey}:${slotId}`));
}

async function createDailyScheduleForUser(db, userSnapshot, dateKey, timeZone, source) {
  const uid = userSnapshot.id;
  const ref = scheduleRef(db, uid, dateKey);
  const { targetSends, minGapMinutes, slots } = buildScheduleSlots({ uid, dateKey, timeZone });
  const now = Timestamp.now();

  const created = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      return false;
    }

    transaction.set(ref, {
      uid,
      dateKey,
      timeZone,
      targetSends,
      minGapMinutes,
      status: "scheduled",
      generatedBy: source,
      generatedAt: now,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      dataModel: {
        scheduleCollection: "users/{uid}/notificationSchedules/{dateKey}",
        slotCollection: "users/{uid}/notificationScheduleSlots/{dateKey}_{slotId}",
        sendLogCollection: "users/{uid}/notificationSendLogs/{dateKey}_{slotId}",
      },
    });

    slots.forEach((slot) => {
      const dueAtUtc = Timestamp.fromDate(slot.dueAtUtcDate);
      const slotPayload = {
        uid,
        dateKey,
        slotId: slot.slotId,
        status: "scheduled",
        timeZone,
        minuteOfDay: slot.minuteOfDay,
        dueAtLocalTime: slot.dueAtLocalTime,
        dueAtUtc,
        createdAt: now,
      };
      transaction.set(slotRef(db, uid, dateKey, slot.slotId), slotPayload);
      transaction.set(queueRef(db, uid, dateKey, slot.slotId), {
        uid,
        dateKey,
        slotId: slot.slotId,
        dueAtUtc,
        createdAt: now,
      });
    });

    return true;
  });

  return {
    uid,
    dateKey,
    timeZone,
    targetSends,
    minGapMinutes,
    created,
  };
}

function shouldGenerateForLocalMidnight(now, timeZone) {
  const local = getLocalParts(now, timeZone);
  const minuteOfDay = local.hour * 60 + local.minute;
  return minuteOfDay < LOCAL_MIDNIGHT_WINDOW_MINUTES;
}

async function generateDailySchedules({ force = false, source = "cron", now = new Date() } = {}) {
  const db = getCoachFirestore();
  const maxUsers = toPositiveInt(process.env.NOTIFICATIONS_MAX_USERS_PER_TICK, DEFAULT_MAX_USERS_PER_TICK);
  const usersSnapshot = await db
    .collection("users")
    .where("pushNotifications.enabled", "==", true)
    .limit(maxUsers)
    .get();

  const results = [];
  for (const userSnapshot of usersSnapshot.docs) {
    const user = userSnapshot.data() ?? {};
    const timeZone = normalizeTimeZone(user.pushNotifications?.timeZone);
    if (!force && !shouldGenerateForLocalMidnight(now, timeZone)) {
      continue;
    }

    const dateKey = localDateKey(now, timeZone);
    try {
      results.push(await createDailyScheduleForUser(db, userSnapshot, dateKey, timeZone, source));
    } catch (error) {
      logger.error(
        {
          uid: userSnapshot.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to create notification schedule.",
      );
      results.push({ uid: userSnapshot.id, created: false, error: "schedule-create-failed" });
    }
  }

  return {
    checkedUsers: usersSnapshot.size,
    created: results.filter((result) => result.created).length,
    results,
  };
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function loadEntryDocs(db, uid, collectionName, dateKey) {
  const snapshot = await db
    .collection("users")
    .doc(uid)
    .collection(collectionName)
    .doc(dateKey)
    .collection("entries")
    .get();
  return snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...(docSnapshot.data() ?? {}) }));
}

function sumBy(entries, key) {
  return entries.reduce((sum, entry) => sum + Math.max(0, toNumber(entry[key], 0)), 0);
}

async function loadDailyProgress(db, uid, dateKey, timeZone, now) {
  const userRef = db.collection("users").doc(uid);
  const [userSnapshot, workoutEntries, nutritionEntries, stepSnapshot] = await Promise.all([
    userRef.get(),
    loadEntryDocs(db, uid, "workoutLogs", dateKey),
    loadEntryDocs(db, uid, "nutritionLogs", dateKey),
    userRef.collection("stepLogs").doc(dateKey).get(),
  ]);
  const user = userSnapshot.data() ?? {};
  const stepLog = stepSnapshot.exists ? stepSnapshot.data() ?? {} : {};
  const stepGoal = Math.max(0, toNumber(stepLog.goal, toNumber(user.dailyStepGoal, 0)));
  const steps = Math.max(0, toNumber(stepLog.steps, 0));
  const mealsLogged = nutritionEntries.length;
  const workoutsLogged = workoutEntries.length;
  const mealScore = Math.min(mealsLogged / 3, 1) * 0.35;
  const workoutScore = workoutsLogged > 0 ? 0.25 : 0;
  const stepScore = stepGoal > 0 ? Math.min(steps / stepGoal, 1) * 0.4 : 0;
  const progressRatio = clamp(mealScore + workoutScore + stepScore, 0, 1);
  const local = getLocalParts(now, timeZone);
  const minuteOfDay = local.hour * 60 + local.minute;
  const expectedProgress = clamp(minuteOfDay / (24 * 60), 0, 1);
  const caloriesIntake = sumBy(nutritionEntries, "calories");
  const workoutCaloriesBurned = sumBy(workoutEntries, "caloriesActive");

  return {
    uid,
    dateKey,
    timeZone,
    localHour: local.hour,
    minuteOfDay,
    mealsLogged,
    workoutsLogged,
    steps,
    stepGoal,
    caloriesIntake: Math.round(caloriesIntake),
    workoutCaloriesBurned: Math.round(workoutCaloriesBurned),
    progressRatio,
    expectedProgress,
    goalReached:
      progressRatio >= 0.95 ||
      (stepGoal > 0 && steps >= stepGoal && (mealsLogged >= 2 || workoutsLogged > 0)),
    onTrack:
      progressRatio >= 0.6 &&
      progressRatio >= Math.max(0.25, expectedProgress * 0.8) &&
      (mealsLogged > 0 || workoutsLogged > 0 || steps > 0),
  };
}

function pickCopy(kind, seed) {
  const choices = FALLBACK_COPY[kind] ?? FALLBACK_COPY.check_in;
  const random = seededRandom(seed);
  return choices[Math.floor(random() * choices.length)] ?? choices[0];
}

function selectMessage(progress, slotId) {
  let kind = "check_in";
  if (progress.mealsLogged === 0 && progress.workoutsLogged === 0) {
    kind = "log_nudge";
  } else if (progress.goalReached || progress.onTrack) {
    kind = "praise";
  } else if (progress.localHour >= 16 && progress.progressRatio < 0.6) {
    kind = "late_low_progress";
  }

  const copy = pickCopy(kind, `${progress.uid}:${progress.dateKey}:${slotId}:${kind}`);
  return {
    kind,
    title: copy.title,
    body: copy.body,
    data: {
      screen: "Home",
      dateKey: progress.dateKey,
      kind,
      progressPercent: Math.round(progress.progressRatio * 100),
      mealsLogged: progress.mealsLogged,
      workoutsLogged: progress.workoutsLogged,
      steps: Math.round(progress.steps),
      stepGoal: Math.round(progress.stepGoal),
    },
  };
}

async function loadActiveTokens(db, uid) {
  const snapshot = await db
    .collection("users")
    .doc(uid)
    .collection("pushTokens")
    .where("enabled", "==", true)
    .limit(10)
    .get();

  return snapshot.docs
    .map((docSnapshot) => ({ id: docSnapshot.id, ...(docSnapshot.data() ?? {}) }))
    .filter((tokenDoc) => isExpoPushToken(tokenDoc.expoPushToken));
}

function buildExpoPayloads(tokens, message) {
  return tokens.map((tokenDoc) => ({
    to: tokenDoc.expoPushToken,
    sound: "default",
    title: message.title,
    body: message.body,
    data: message.data,
    priority: "default",
    channelId: "daily-progress",
  }));
}

async function sendExpoPushMessages(payloads) {
  const headers = {
    Accept: "application/json",
    "Accept-encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  const accessToken = String(process.env.EXPO_ACCESS_TOKEN ?? "").trim();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payloads),
  });
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = { raw };
  }

  if (!response.ok) {
    const detail = typeof payload?.errors?.[0]?.message === "string" ? payload.errors[0].message : raw;
    throw new Error(detail || `Expo Push API failed with ${response.status}`);
  }

  return payload;
}

async function disableUnregisteredTokens(db, uid, tokenResults) {
  const disabledAt = FieldValue.serverTimestamp();
  await Promise.all(
    tokenResults
      .filter((result) => result.details?.error === "DeviceNotRegistered")
      .map((result) =>
        db.collection("users").doc(uid).collection("pushTokens").doc(result.tokenId).set(
          {
            enabled: false,
            disabledReason: "DeviceNotRegistered",
            disabledAt,
          },
          { merge: true },
        ),
      ),
  );
}

async function claimDueQueueItem(db, dueSnapshot, now) {
  const dueData = dueSnapshot.data() ?? {};
  const uid = String(dueData.uid ?? "");
  const dateKey = String(dueData.dateKey ?? "");
  const slotId = String(dueData.slotId ?? "");
  if (!uid || !dateKey || !slotId) {
    await dueSnapshot.ref.delete();
    return null;
  }

  const claimedAt = Timestamp.fromDate(now);
  const slotDocumentRef = slotRef(db, uid, dateKey, slotId);
  const logDocumentRef = sendLogRef(db, uid, dateKey, slotId);

  return db.runTransaction(async (transaction) => {
    const [queueDoc, slotDoc, existingLog] = await Promise.all([
      transaction.get(dueSnapshot.ref),
      transaction.get(slotDocumentRef),
      transaction.get(logDocumentRef),
    ]);

    if (!queueDoc.exists) {
      return null;
    }

    const slot = slotDoc.data() ?? {};
    if (!slotDoc.exists || slot.status !== "scheduled" || existingLog.exists) {
      transaction.delete(dueSnapshot.ref);
      return null;
    }

    transaction.update(slotDocumentRef, {
      status: "sending",
      claimedAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(logDocumentRef, {
      uid,
      dateKey,
      slotId,
      dueAtUtc: slot.dueAtUtc ?? dueData.dueAtUtc ?? null,
      status: "sending",
      attemptCount: 1,
      claimedAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.delete(dueSnapshot.ref);

    return {
      uid,
      dateKey,
      slotId,
      timeZone: normalizeTimeZone(slot.timeZone ?? dueData.timeZone),
    };
  });
}

async function skipSlot(db, claimed, reason, extra = {}) {
  const skippedAt = FieldValue.serverTimestamp();
  await Promise.all([
    slotRef(db, claimed.uid, claimed.dateKey, claimed.slotId).set(
      {
        status: "skipped",
        skippedReason: reason,
        skippedAt,
        updatedAt: skippedAt,
        ...extra,
      },
      { merge: true },
    ),
    sendLogRef(db, claimed.uid, claimed.dateKey, claimed.slotId).set(
      {
        uid: claimed.uid,
        dateKey: claimed.dateKey,
        slotId: claimed.slotId,
        status: "skipped",
        skippedReason: reason,
        skippedAt,
        updatedAt: skippedAt,
        ...extra,
      },
      { merge: true },
    ),
    scheduleRef(db, claimed.uid, claimed.dateKey).set(
      {
        skippedCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
  ]);
}

async function reduceRemainingSends(db, claimed, mode, now) {
  if (mode !== "praise") {
    return 0;
  }

  const snapshot = await db
    .collection("users")
    .doc(claimed.uid)
    .collection("notificationScheduleSlots")
    .where("dateKey", "==", claimed.dateKey)
    .where("status", "==", "scheduled")
    .get();
  const futureSlots = snapshot.docs
    .map((docSnapshot) => ({ id: docSnapshot.id, ...(docSnapshot.data() ?? {}) }))
    .filter((slot) => {
      const dueAt = typeof slot.dueAtUtc?.toDate === "function" ? slot.dueAtUtc.toDate() : null;
      return dueAt && dueAt.getTime() > now.getTime();
    })
    .sort((a, b) => a.dueAtUtc.toMillis() - b.dueAtUtc.toMillis());

  const keepCount = futureSlots.length > 1 ? 1 : futureSlots.length;
  const slotsToSkip = futureSlots.slice(keepCount);
  await Promise.all(
    slotsToSkip.map(async (slot) => {
      const slotId = String(slot.slotId ?? slot.id);
      await Promise.all([
        slotRef(db, claimed.uid, claimed.dateKey, slotId).set(
          {
            status: "skipped",
            skippedReason: "positive_progress_reduce_remaining",
            skippedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
        queueRef(db, claimed.uid, claimed.dateKey, slotId).delete().catch(() => {}),
      ]);
    }),
  );

  if (slotsToSkip.length > 0) {
    await scheduleRef(db, claimed.uid, claimed.dateKey).set(
      {
        skippedCount: FieldValue.increment(slotsToSkip.length),
        reducedAfterSlotId: claimed.slotId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  return slotsToSkip.length;
}

async function processDueNotification(db, dueSnapshot, now) {
  const claimed = await claimDueQueueItem(db, dueSnapshot, now);
  if (!claimed) {
    return { processed: false, reason: "not-claimed" };
  }

  const tokens = await loadActiveTokens(db, claimed.uid);
  if (tokens.length === 0) {
    await skipSlot(db, claimed, "no_active_push_token");
    return { processed: true, status: "skipped", reason: "no_active_push_token" };
  }

  const progress = await loadDailyProgress(db, claimed.uid, claimed.dateKey, claimed.timeZone, now);
  const message = selectMessage(progress, claimed.slotId);
  const payloads = buildExpoPayloads(tokens, message);
  const sentAt = FieldValue.serverTimestamp();

  try {
    const expoResponse = await sendExpoPushMessages(payloads);
    const ticketData = Array.isArray(expoResponse?.data) ? expoResponse.data : [];
    const tokenResults = tokens.map((tokenDoc, index) => ({
      tokenId: tokenDoc.id,
      status: ticketData[index]?.status ?? "unknown",
      id: ticketData[index]?.id ?? null,
      message: ticketData[index]?.message ?? null,
      details: ticketData[index]?.details ?? null,
    }));
    const hasOkTicket = tokenResults.some((result) => result.status === "ok");

    await disableUnregisteredTokens(db, claimed.uid, tokenResults);
    await Promise.all([
      slotRef(db, claimed.uid, claimed.dateKey, claimed.slotId).set(
        {
          status: hasOkTicket ? "sent" : "failed",
          sentAt,
          messageKind: message.kind,
          title: message.title,
          body: message.body,
          tokenCount: tokens.length,
          expoTickets: tokenResults,
          progressSnapshot: progress,
          updatedAt: sentAt,
        },
        { merge: true },
      ),
      sendLogRef(db, claimed.uid, claimed.dateKey, claimed.slotId).set(
        {
          status: hasOkTicket ? "success" : "failed",
          sentAt,
          messageKind: message.kind,
          title: message.title,
          body: message.body,
          tokenCount: tokens.length,
          expoTickets: tokenResults,
          progressSnapshot: progress,
          updatedAt: sentAt,
        },
        { merge: true },
      ),
      scheduleRef(db, claimed.uid, claimed.dateKey).set(
        {
          sentCount: hasOkTicket ? FieldValue.increment(1) : FieldValue.increment(0),
          failedCount: hasOkTicket ? FieldValue.increment(0) : FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    ]);

    const reducedCount = hasOkTicket ? await reduceRemainingSends(db, claimed, message.kind, now) : 0;
    return {
      processed: true,
      status: hasOkTicket ? "success" : "failed",
      messageKind: message.kind,
      tokenCount: tokens.length,
      reducedCount,
    };
  } catch (error) {
    const failedAt = FieldValue.serverTimestamp();
    const detail = error instanceof Error ? error.message : "Unknown Expo Push API failure.";
    await Promise.all([
      slotRef(db, claimed.uid, claimed.dateKey, claimed.slotId).set(
        {
          status: "failed",
          failureReason: detail,
          failedAt,
          updatedAt: failedAt,
        },
        { merge: true },
      ),
      sendLogRef(db, claimed.uid, claimed.dateKey, claimed.slotId).set(
        {
          status: "failed",
          failureReason: detail,
          failedAt,
          updatedAt: failedAt,
        },
        { merge: true },
      ),
      scheduleRef(db, claimed.uid, claimed.dateKey).set(
        {
          failedCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    ]);

    return { processed: true, status: "failed", reason: detail };
  }
}

async function sendDueNotifications({ now = new Date() } = {}) {
  const db = getCoachFirestore();
  const maxDue = toPositiveInt(process.env.NOTIFICATIONS_MAX_DUE_PER_TICK, DEFAULT_MAX_DUE_PER_TICK);
  const snapshot = await db
    .collection("notificationDueQueue")
    .where("dueAtUtc", "<=", Timestamp.fromDate(now))
    .limit(maxDue)
    .get();
  const results = [];

  for (const dueSnapshot of snapshot.docs) {
    try {
      results.push(await processDueNotification(db, dueSnapshot, now));
    } catch (error) {
      logger.error(
        {
          queueId: dueSnapshot.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Notification due item failed.",
      );
      results.push({ processed: false, status: "failed", reason: "process-failed" });
    }
  }

  return {
    due: snapshot.size,
    processed: results.filter((result) => result.processed).length,
    results,
  };
}

export function mountNotificationRoutes(app) {
  const router = express.Router();

  router.post("/register-token", requireNotificationUser, async (req, res) => {
    const expoPushToken = String(req.body?.expoPushToken ?? "").trim();
    if (!isExpoPushToken(expoPushToken)) {
      return res.status(400).json({ message: "A valid Expo push token is required." });
    }

    const uid = req.notificationUser.uid;
    const db = getCoachFirestore();
    const timeZone = normalizeTimeZone(req.body?.timeZone);
    const tokenHash = hashId(expoPushToken);
    const userRef = db.collection("users").doc(uid);
    const tokenRef = userRef.collection("pushTokens").doc(tokenHash);
    const existingToken = await tokenRef.get();
    const now = FieldValue.serverTimestamp();
    const device = req.body?.device && typeof req.body.device === "object" ? req.body.device : {};

    await Promise.all([
      userRef.set(
        {
          pushNotifications: {
            enabled: true,
            timeZone,
            lastTokenHash: tokenHash,
            lastRegisteredAt: now,
          },
        },
        { merge: true },
      ),
      tokenRef.set(
        {
          expoPushToken,
          tokenHash,
          enabled: true,
          timeZone,
          platform: typeof device.platform === "string" ? device.platform : null,
          appVersion: typeof device.appVersion === "string" ? device.appVersion : null,
          nativeBuildVersion: typeof device.nativeBuildVersion === "string" ? device.nativeBuildVersion : null,
          permissionStatus: typeof req.body?.permissionStatus === "string" ? req.body.permissionStatus : null,
          createdAt: existingToken.exists ? existingToken.data()?.createdAt ?? now : now,
          lastRegisteredAt: now,
          updatedAt: now,
        },
        { merge: true },
      ),
    ]);

    return res.status(202).json({
      registered: true,
      tokenHash,
      timeZone,
    });
  });

  router.post("/cron/generate-daily", requireCronSecret, async (req, res) => {
    const force = req.body?.force === true || req.query.force === "true";
    const result = await generateDailySchedules({ force, source: "hosted-cron" });
    return res.json(result);
  });

  router.post("/cron/send-due", requireCronSecret, async (_req, res) => {
    const result = await sendDueNotifications();
    return res.json(result);
  });

  app.use("/api/notifications", router);
}

let schedulerStarted = false;
let schedulerTimer = null;
let generateInFlight = false;
let sendInFlight = false;

async function runSchedulerTick() {
  if (!generateInFlight) {
    generateInFlight = true;
    generateDailySchedules({ source: "in-process-cron" })
      .catch((error) => {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, "Notification schedule tick failed.");
      })
      .finally(() => {
        generateInFlight = false;
      });
  }

  if (!sendInFlight) {
    sendInFlight = true;
    sendDueNotifications()
      .catch((error) => {
        logger.error({ error: error instanceof Error ? error.message : String(error) }, "Notification send tick failed.");
      })
      .finally(() => {
        sendInFlight = false;
      });
  }
}

export function startNotificationCronJobs() {
  if (schedulerStarted || process.env.NOTIFICATIONS_CRON_ENABLED === "false") {
    return;
  }

  schedulerStarted = true;
  const delayMs = MINUTE_MS - (Date.now() % MINUTE_MS) + 250;
  schedulerTimer = setTimeout(() => {
    runSchedulerTick();
    schedulerTimer = setInterval(runSchedulerTick, MINUTE_MS);
  }, delayMs);
  logger.info("Notification cron jobs scheduled.");
}

export function stopNotificationCronJobs() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  schedulerStarted = false;
}

export const notificationInternals = {
  buildScheduleSlots,
  selectMessage,
  generateDailySchedules,
  sendDueNotifications,
};
