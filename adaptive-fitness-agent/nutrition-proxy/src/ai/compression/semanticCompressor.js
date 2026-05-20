import { countTokens } from "./tokenBudget.js";

const DEFAULT_PROMPT_BUDGET = Number(process.env.COACH_PROMPT_TOKEN_BUDGET ?? 1200);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function trimArrayAtPath(target, path, limit) {
  let cursor = target;
  for (const segment of path.slice(0, -1)) {
    cursor = cursor?.[segment];
  }
  const key = path[path.length - 1];
  if (Array.isArray(cursor?.[key])) {
    cursor[key] = cursor[key].slice(0, limit);
  }
}

export function compressPromptContext(retrieval, options = {}) {
  const maxTokens = options.maxTokens ?? DEFAULT_PROMPT_BUDGET;
  const packet = cloneJson({
    currentDateKey: retrieval.currentDateKey,
    intent: retrieval.intent,
    signals: retrieval.signalPacket?.signals ?? [],
    safety: retrieval.signalPacket?.safety ?? null,
    scores: retrieval.signalPacket?.scores ?? {},
    targets: retrieval.signalPacket?.targets ?? {},
    states: retrieval.signalPacket?.states ?? {},
    decisions: retrieval.signalPacket?.decisions ?? {},
    trends: retrieval.signalPacket?.trends ?? {},
    recency: retrieval.signalPacket?.recency ?? {},
    dataCoverage: retrieval.signalPacket?.dataCoverage ?? {},
    memory: retrieval.signalPacket?.memory ?? {},
    sources: retrieval.sources ?? {},
  });

  const compressionSteps = [
    () => trimArrayAtPath(packet, ["sources", "memory", "conversations"], 2),
    () => trimArrayAtPath(packet, ["sources", "workouts", "recent"], 4),
    () => trimArrayAtPath(packet, ["sources", "nutrition", "recent"], 4),
    () => trimArrayAtPath(packet, ["sources", "lifestyle", "recent"], 4),
    () => trimArrayAtPath(packet, ["sources", "steps", "recent"], 4),
    () => {
      delete packet.sources?.memory?.conversations;
    },
    () => {
      delete packet.trends?.nutritionCalories;
      delete packet.trends?.activeCalories;
    },
  ];

  let serialized = JSON.stringify(packet);
  for (const step of compressionSteps) {
    if (countTokens(serialized) <= maxTokens) {
      break;
    }
    step();
    serialized = JSON.stringify(packet);
  }

  return {
    packet,
    tokenCount: countTokens(serialized),
    maxTokens,
  };
}

