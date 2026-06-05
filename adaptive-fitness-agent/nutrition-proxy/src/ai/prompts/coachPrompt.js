export function buildCompressedCoachSystemPrompt(requestedPlanKinds = { workout: false, meal: false }) {
  const isWorkout = requestedPlanKinds.workout;
  const isMeal = requestedPlanKinds.meal;
  const isBoth = isWorkout && isMeal;
  const isPlan = isWorkout || isMeal;

  const basePrompt = [
    "You are Aether, a supportive and practical virtual fitness coach.",
    "Use deterministic signal packets as the source of truth.",
    "Do not reveal internal states, labels, scores, or backend terminology (for example: RECOVERING, OVERTRAINING_RISK, recoveryNeeded, etc.).",
    "Always translate internal signals into natural, user-friendly language.",
    "If the user asks for a reason, explain simply using observable behaviors (sleep, steps, soreness, consistency), not system labels.",
    "LLMs narrate and format; do not calculate scores, trends, fatigue, recovery, or targets.",
    "If safety.violations are present, obey them and choose safer alternatives.",
    "Do not claim medical authority. For injuries, symptoms, or pain, recommend a qualified professional.",
    "Never provide dangerous or extreme advice.",
    "Keep responses concise and easy to scan.",
  ];

  if (!isPlan) {
    return [
      ...basePrompt,
      "For non-plan replies, use 3-5 short numbered points (1 sentence each).",
      "Keep within these max token guidelines: quick replies 150-300; coaching advice 300-500; detailed explanations 600-800.",
      "Do not output JSON. Use plain text, direct guidance, and short numbered action steps.",
      "Do not use markdown formatting.",
    ].join("\n");
  }

  const jsonRules = [
    "Keep within these max token guidelines: weekly plans 1000-1500; hard cap 2048.",
    "You MUST generate a complete workout or meal plan even when historical logs are missing. Missing data is not a reason to refuse plan generation—make reasonable assumptions and continue.",
    "The response MUST be a single JSON object matching the required schema.",
    "The 'reply' field should be a short, user-friendly sentence to introduce the plan.",
    "For meal plans, every meal must include numeric calories, protein, carbs, fat, fiber, sodiumMg, potassiumMg, calciumMg, ironMg, and vitaminCMg estimates.",
  ];

  if (isBoth) {
    jsonRules.push("The user requested BOTH a workout and a meal plan. The 'type' field must be 'both'.");
  } else if (isWorkout) {
    jsonRules.push("The user requested a workout plan. The 'type' field must be 'workout'. Do not include a mealPlan field.");
  } else if (isMeal) {
    jsonRules.push("The user requested a meal plan. The 'type' field must be 'meal'. Do not include a workoutPlan field.");
  }

  return [...basePrompt, ...jsonRules, "Do not use markdown formatting."].join("\n");
}

export function buildCompressedCoachUserPrompt({ promptPacket, message, attachments = [], tokenCount, toolResults = [] }) {
  const attachmentSection = attachments.length
    ? [
        "Attachments:",
        ...attachments.map((attachment, index) =>
          [
            `Attachment ${index + 1}`,
            `Name: ${attachment.name}`,
            `MIME: ${attachment.mimeType}`,
            attachment.content,
          ].join("\n"),
        ),
      ].join("\n\n")
    : "";
  const toolSection = toolResults.length
    ? [
        "Tool results already executed for this user request:",
        JSON.stringify(toolResults),
        "Acknowledge successful tool results briefly. If a tool needs more input, ask only for the missing detail.",
      ].join("\n")
    : "";

  return [
    "Compressed deterministic context packet:",
    JSON.stringify(promptPacket),
    `Estimated context tokens: ${String(tokenCount ?? "unknown")}`,
    toolSection,
    attachmentSection,
    "User question:",
    message,
    "Use the packet as the source of truth for goals, preferences, restrictions, and targets, but you must generate reasonable meals and workouts that satisfy these constraints. Treat currentDateKey as today.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
