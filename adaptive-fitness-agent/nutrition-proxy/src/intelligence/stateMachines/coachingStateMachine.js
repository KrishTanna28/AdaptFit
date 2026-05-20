import { createMachine } from "xstate";

export const CoachingState = Object.freeze({
  READY: "READY",
  FATIGUED: "FATIGUED",
  RECOVERING: "RECOVERING",
  OVERTRAINING_RISK: "OVERTRAINING_RISK",
  HIGH_MOMENTUM: "HIGH_MOMENTUM",
  LOW_ADHERENCE: "LOW_ADHERENCE",
  PLATEAUING: "PLATEAUING",
});

export const coachingStateMachine = createMachine({
  id: "adaptive-coach",
  initial: CoachingState.READY,
  states: {
    [CoachingState.READY]: {
      on: {
        FATIGUE: CoachingState.FATIGUED,
        RECOVERY_LOW: CoachingState.RECOVERING,
        MOMENTUM_HIGH: CoachingState.HIGH_MOMENTUM,
        ADHERENCE_LOW: CoachingState.LOW_ADHERENCE,
        PLATEAU: CoachingState.PLATEAUING,
      },
    },
    [CoachingState.FATIGUED]: {
      on: {
        OVERTRAINING: CoachingState.OVERTRAINING_RISK,
        RECOVERY_LOW: CoachingState.RECOVERING,
        STABLE: CoachingState.READY,
      },
    },
    [CoachingState.RECOVERING]: {
      on: {
        OVERTRAINING: CoachingState.OVERTRAINING_RISK,
        STABLE: CoachingState.READY,
      },
    },
    [CoachingState.OVERTRAINING_RISK]: {
      on: {
        RECOVERY_LOW: CoachingState.RECOVERING,
        STABLE: CoachingState.READY,
      },
    },
    [CoachingState.HIGH_MOMENTUM]: {
      on: {
        FATIGUE: CoachingState.FATIGUED,
        PLATEAU: CoachingState.PLATEAUING,
        STABLE: CoachingState.READY,
      },
    },
    [CoachingState.LOW_ADHERENCE]: {
      on: {
        MOMENTUM_HIGH: CoachingState.HIGH_MOMENTUM,
        STABLE: CoachingState.READY,
      },
    },
    [CoachingState.PLATEAUING]: {
      on: {
        FATIGUE: CoachingState.FATIGUED,
        MOMENTUM_HIGH: CoachingState.HIGH_MOMENTUM,
        STABLE: CoachingState.READY,
      },
    },
  },
});

export function resolveCoachingState(signalPacket) {
  const scores = signalPacket?.scores ?? {};
  const states = Array.isArray(signalPacket?.states?.active) ? signalPacket.states.active : [];
  const trends = signalPacket?.trends ?? {};

  if (states.includes("overtrainingRisk")) {
    return CoachingState.OVERTRAINING_RISK;
  }

  if ((scores.fatigue?.score ?? 0) >= 70 && (scores.recovery?.score ?? 100) <= 50) {
    return CoachingState.FATIGUED;
  }

  if (states.includes("recoveryNeeded") || (scores.recovery?.score ?? 100) < 45) {
    return CoachingState.RECOVERING;
  }

  if (states.includes("plateauDetected") || (scores.progress?.score ?? 100) < 45) {
    return CoachingState.PLATEAUING;
  }

  if (states.includes("decliningActivity") || (scores.adherence?.score ?? 100) < 45) {
    return CoachingState.LOW_ADHERENCE;
  }

  if (
    states.includes("highConsistency") ||
    ((scores.consistency?.score ?? 0) >= 75 && trends.activity?.direction === "up")
  ) {
    return CoachingState.HIGH_MOMENTUM;
  }

  return CoachingState.READY;
}

