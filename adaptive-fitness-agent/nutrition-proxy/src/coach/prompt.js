function normalizePromptAttachments(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((attachment) => {
      const name = typeof attachment?.name === "string" ? attachment.name.trim() : "";
      const mimeType =
        typeof attachment?.mimeType === "string" ? attachment.mimeType.trim() : "application/octet-stream";
      const content = typeof attachment?.content === "string" ? attachment.content.trim() : "";

      if (!name || !content) {
        return null;
      }

      return {
        name,
        mimeType,
        content,
      };
    })
    .filter((item) => item !== null);
}

function buildAttachmentsSection(attachments) {
  if (!attachments.length) {
    return "";
  }

  const blocks = attachments.map((attachment, index) => {
    return [
      `Attachment ${String(index + 1)}:`,
      `Name: ${attachment.name}`,
      `MIME: ${attachment.mimeType}`,
      "Content:",
      attachment.content,
    ].join("\n");
  });

  return ["User attached files for analysis:", ...blocks].join("\n\n");
}

export function buildCoachSystemPrompt() {
  return [
    "You are Adaptive Fitness Coach, a supportive and practical virtual fitness coach.",
    "You must personalize guidance from the complete user context and full logs provided.",
    "Do not ignore detailed entries. Use both summaries and full entry-level records.",
    "The context includes currentDateKey. Treat that as today.",
    "Every log entry has a dateKey in YYYY-MM-DD format. Never describe a log as today's activity unless its dateKey equals currentDateKey.",
    "If the latest workout or meal is older than currentDateKey, clearly say it was last logged on that date and do not imply it happened today.",
    "Use recency.hasWorkoutLoggedToday, recency.lastWorkoutDateKey, and recency.daysSinceLastWorkout when planning today's workout.",
    "When data is missing, explicitly say what is missing and suggest what to log next.",
    "Do not claim medical authority. For injuries, conditions, pain, or symptoms, advise consulting a qualified professional.",
    "Never provide dangerous or extreme advice (starvation, overtraining, unsafe supplements).",
    "Response style rules:",
    "1) Start with a direct answer.",
    "2) Provide as many actionable items as are useful using plain numbered lines (1., 2., 3.).",
    "3) Keep answer practical and complete.",
    "4) Do not use markdown formatting or special markers like *, **, #, or backticks.",
    "5) Ensure the response does not end mid-sentence.",
  ].join("\n");
}

export function buildCoachUserPrompt(input) {
  const contextJson = JSON.stringify(input.context, null, 2);
  const attachments = normalizePromptAttachments(input.attachments);
  const attachmentsSection = buildAttachmentsSection(attachments);
  const attachmentsInstruction = attachments.length
    ? "You must use both context and file content in your answer."
    : "";

  return [
    "Use this complete context JSON as the single source of truth for personalization:",
    contextJson,
    attachmentsSection,
    "User question:",
    input.message,
    attachmentsInstruction,
    "Date interpretation reminder: currentDateKey is today. A workout, meal, or log belongs to the day shown in its dateKey, not the day this chat is happening unless those dates match.",
    "Now answer with practical coaching guidance tailored to this user and context.",
  ]
    .filter((section) => String(section ?? "").trim())
    .join("\n\n");
}
