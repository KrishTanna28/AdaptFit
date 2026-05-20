import { getCoachFirestore } from "../coach/firebaseAdmin.js";
import { recomputeUserSignalState } from "../intelligence/signalEngine.js";
import { QueueEventSchema } from "../schemas/events.js";
import { validateOrThrow } from "../schemas/validators.js";

const DEFAULT_EVENT_WINDOW_DAYS = Number(process.env.INTELLIGENCE_EVENT_WINDOW_DAYS ?? 30);

export async function handleIntelligenceEvent(rawEvent, options = {}) {
  const event = validateOrThrow(QueueEventSchema, rawEvent, "intelligence event");
  const db = options.db ?? getCoachFirestore();

  const recomputeResult = await recomputeUserSignalState(db, event.uid, {
    windowDays: DEFAULT_EVENT_WINDOW_DAYS,
    includeAllHistory: true,
    reason: event.type,
    event,
  });

  return {
    eventId: event.eventId,
    type: event.type,
    uid: event.uid,
    signalSignature: recomputeResult.signature,
    generatedAt: recomputeResult.signalPacket.generatedAt,
  };
}

