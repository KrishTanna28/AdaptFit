import { getCoachFirestore } from "../coach/firebaseAdmin.js";
import { recomputeUserSignalState } from "../intelligence/signalEngine.js";
import { QueueEventSchema } from "../schemas/events.js";
import { validateOrThrow } from "../schemas/validators.js";

const DEFAULT_EVENT_WINDOW_DAYS = "7,30";
const SIGNAL_RECOMPUTE_EVENT_TYPES = new Set([
  "workout_logged",
  "meal_logged",
  "steps_updated",
  "hydration_updated",
  "sleep_updated",
  "lifestyle_updated",
  "profile_updated",
]);

function parseEventWindowDays(value) {
  const raw = String(value ?? DEFAULT_EVENT_WINDOW_DAYS)
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part >= 7 && part <= 30)
    .map((part) => Math.floor(part));

  return Array.from(new Set(raw)).length ? Array.from(new Set(raw)) : [7, 30];
}

export async function handleIntelligenceEvent(rawEvent, options = {}) {
  const event = validateOrThrow(QueueEventSchema, rawEvent, "intelligence event");
  const db = options.db ?? getCoachFirestore();

  if (!SIGNAL_RECOMPUTE_EVENT_TYPES.has(event.type)) {
    return {
      eventId: event.eventId,
      type: event.type,
      uid: event.uid,
      skipped: true,
      reason: "non-mutating-event",
    };
  }

  const recomputeResults = await Promise.all(
    parseEventWindowDays(process.env.INTELLIGENCE_EVENT_WINDOW_DAYS).map((windowDays) =>
      recomputeUserSignalState(db, event.uid, {
        windowDays,
        includeAllHistory: true,
        reason: event.type,
        event,
      }),
    ),
  );
  const primaryResult = recomputeResults[0];

  return {
    eventId: event.eventId,
    type: event.type,
    uid: event.uid,
    signalSignature: primaryResult.signature,
    generatedAt: primaryResult.signalPacket.generatedAt,
    windowDays: recomputeResults.map((result) => result.signalPacket.window.requestedDays),
  };
}
