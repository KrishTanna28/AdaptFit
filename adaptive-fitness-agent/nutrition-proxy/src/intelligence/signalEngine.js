import { createHash } from "node:crypto";

import { loadCoachContext } from "../coach/context.js";
import {
  buildDeterministicContext,
  buildDeterministicSignature,
} from "../deterministic/contextBuilder.js";
import { validateSafetyForSignalPacket } from "./validators/safety.js";
import { saveSignalState } from "./signalStore.js";
import { observeCache } from "../observability/metrics.js";

function hashSignalPacket(signalPacket) {
  return createHash("sha256")
    .update(JSON.stringify(signalPacket))
    .digest("hex")
    .slice(0, 32);
}

export async function buildSignalPacketFromContext(context) {
  const deterministic = buildDeterministicContext(context);
  const safety = validateSafetyForSignalPacket(deterministic.compact);
  const signalPacket = {
    ...deterministic.compact,
    safety,
  };

  return {
    deterministic,
    signalPacket,
    signature: hashSignalPacket(signalPacket),
    contextSignature: buildDeterministicSignature(context),
  };
}

export async function recomputeUserSignalState(db, uid, options = {}) {
  const windowDays = options.windowDays ?? 30;
  const context = await loadCoachContext(db, uid, {
    windowDays,
    includeAllHistory: options.includeAllHistory !== false,
  });

  const result = await buildSignalPacketFromContext(context);
  await saveSignalState(
    db,
    uid,
    {
      signalPacket: result.signalPacket,
      signature: result.signature,
      reason: options.reason ?? "recompute",
    },
    { windowDays },
  );

  observeCache({ layer: "signal-engine", outcome: "recompute", namespace: "intelligence" });
  return {
    ...result,
    context,
  };
}

