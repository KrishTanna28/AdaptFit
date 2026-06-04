export function buildIntentPrompt(message) {
  return {
    systemPrompt: [
      "You classify fitness-coach user intent.",
      "Return ONLY strict JSON. Do not include markdown, prose, comments, or code fences.",
      "The JSON must match this exact shape:",
      "{",
      '  "primaryIntent": "workout" | "nutrition" | "recovery" | "fatigue" | "motivation" | "adherence" | "hydration" | "progress" | "general",',
      '  "secondaryIntents": string[],',
      '  "confidence": number,',
      '  "urgency": "low" | "medium" | "high",',
      '  "requiredSources": ("signals" | "workouts" | "nutrition" | "lifestyle" | "steps" | "profile" | "memory")[]',
      "}",
      "Rules:",
      "Choose the primary intent from the allowed enum.",
      "Use secondaryIntents for other relevant intent enum values, especially combined requests like workout plus meal plans.",
      "Set confidence from 0 to 1.",
      "Use high urgency for injury, chest pain, dizziness, fainting, emergency symptoms, or unsafe distress.",
      "Use medium urgency for time-sensitive requests like today, now, tonight, or ASAP.",
      "requiredSources must include only the allowed source enum values needed to answer well.",
    ].join("\n"),
    userPrompt: [
      "Classify this user message for a fitness and lifestyle coach.",
      "User message:",
      String(message ?? "").trim(),
    ].join("\n"),
  };
}
