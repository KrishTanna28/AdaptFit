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
    "Plan output:",
  ];

  if (isBoth) {
    jsonRules.push(
      "The user requested BOTH a workout plan and a meal plan. Return ONLY ONE JSON object matching this exact schema (no markdown, no extra text):",
      '{"type": "both", "reply": "Here is your plan.", "workoutPlan": {"title": "Full Body", "exercises": [{"name": "Squats", "sets": 3, "reps": 10}]}, "mealPlan": {"title": "High Protein", "meals": [{"mealType": "lunch", "name": "Chicken Salad", "items": ["150g chicken", "greens"], "calories": 400, "protein": 40, "carbs": 10, "fat": 15, "fiber": 5, "sodiumMg": 300, "potassiumMg": 400, "calciumMg": 50, "ironMg": 2, "vitaminCMg": 10}]}}',
      "The 'type' field MUST be 'both'.",
      "Both workoutPlan and mealPlan MUST NOT be null.",
      "The 'reply' field is required and must be one short sentence."
    );
  } else if (isWorkout) {
    jsonRules.push(
      "The user requested a workout plan. Return ONLY ONE JSON object matching this exact schema (no markdown, no extra text):",
      '{"type": "workout", "reply": "Here is your workout plan.", "workoutPlan": {"title": "Full Body", "exercises": [{"name": "Squats", "sets": 3, "reps": 10}]}, "mealPlan": null}',
      "The 'type' field MUST be 'workout'.",
      "workoutPlan MUST NOT be null. mealPlan MUST be null.",
      "The 'reply' field is required and must be one short sentence."
    );
  } else if (isMeal) {
    jsonRules.push(
      "The user requested a meal plan. Return ONLY ONE JSON object matching this exact schema (no markdown, no extra text):",
      '{"type": "meal", "reply": "Here is your meal plan.", "workoutPlan": null, "mealPlan": {"title": "High Protein", "meals": [{"mealType": "lunch", "name": "Chicken Salad", "items": ["150g chicken", "greens"], "calories": 400, "protein": 40, "carbs": 10, "fat": 15, "fiber": 5, "sodiumMg": 300, "potassiumMg": 400, "calciumMg": 50, "ironMg": 2, "vitaminCMg": 10}]}}',
      "The 'type' field MUST be 'meal'.",
      "mealPlan MUST NOT be null. workoutPlan MUST be null.",
      "The 'reply' field is required and must be one short sentence."
    );
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
    "Answer using only the packet and attachments. Treat currentDateKey as today.",
  ]
    .filter(Boolean)
    .join("\n\n");
}