import { auth } from "./firebase";

export type IntelligenceEventType =
  | "workout_logged"
  | "meal_logged"
  | "hydration_updated"
  | "sleep_updated"
  | "profile_updated"
  | "ai_chat_requested";

const NUTRITION_API_BASE_URL = String(process.env.EXPO_PUBLIC_NUTRITION_API_BASE_URL ?? "")
  .trim()
  .replace(/\/$/, "");

const COACH_API_BASE_URL = String(process.env.EXPO_PUBLIC_COACH_API_BASE_URL ?? "")
  .trim()
  .replace(/\/$/, "");

const API_BASE_URL = COACH_API_BASE_URL || NUTRITION_API_BASE_URL;

export async function publishIntelligenceEvent(input: {
  type: IntelligenceEventType;
  payload?: Record<string, unknown>;
}) {
  if (!API_BASE_URL || !auth.currentUser) {
    return;
  }

  const idToken = await auth.currentUser.getIdToken();
  await fetch(`${API_BASE_URL}/api/events/intelligence`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      type: input.type,
      payload: input.payload ?? {},
    }),
  }).catch(() => {
    // Event publishing must not break the primary logging UX.
  });
}

