import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { User } from "firebase/auth/react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const NUTRITION_API_BASE_URL = String(process.env.EXPO_PUBLIC_NUTRITION_API_BASE_URL ?? "")
  .trim()
  .replace(/\/$/, "");

const COACH_API_BASE_URL = String(process.env.EXPO_PUBLIC_COACH_API_BASE_URL ?? "")
  .trim()
  .replace(/\/$/, "");

const API_BASE_URL = COACH_API_BASE_URL || NUTRITION_API_BASE_URL;

let lastRegisteredKey: string | null = null;
let registrationInFlight: Promise<boolean> | null = null;

function getProjectId() {
  const expoConfigProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  const easConfigProjectId = Constants.easConfig?.projectId;
  return typeof expoConfigProjectId === "string" && expoConfigProjectId
    ? expoConfigProjectId
    : typeof easConfigProjectId === "string" && easConfigProjectId
      ? easConfigProjectId
      : undefined;
}

function getTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getDevicePayload() {
  const nativeConstants = Constants as unknown as {
    nativeAppVersion?: string | null;
    nativeBuildVersion?: string | null;
  };

  return {
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? nativeConstants.nativeAppVersion ?? null,
    nativeBuildVersion: nativeConstants.nativeBuildVersion ?? null,
  };
}

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync("daily-progress", {
    name: "Daily progress",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2FD6A3",
  });
}

async function getPermissionStatus() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return current.status;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return requested.status;
}

async function parseRegistrationError(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) {
    return new Error(`Push token registration failed (${String(response.status)}).`);
  }

  try {
    const payload = JSON.parse(raw) as { message?: unknown; detail?: unknown };
    const message = String(payload.detail || payload.message || "").trim();
    return new Error(message || `Push token registration failed (${String(response.status)}).`);
  } catch {
    return new Error(raw.trim() || `Push token registration failed (${String(response.status)}).`);
  }
}

export async function registerExpoPushToken(user: User): Promise<boolean> {
  if (!API_BASE_URL) {
    return false;
  }

  if (registrationInFlight) {
    return registrationInFlight;
  }

  registrationInFlight = (async () => {
    try {
      await ensureAndroidNotificationChannel();

      const permissionStatus = await getPermissionStatus();
      if (permissionStatus !== "granted") {
        lastRegisteredKey = null;
        return false;
      }

      const projectId = getProjectId();
      const expoPushTokenResult = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      const expoPushToken = expoPushTokenResult.data;
      const timeZone = getTimeZone();
      const registrationKey = `${user.uid}:${expoPushToken}:${timeZone}:${permissionStatus}`;
      if (lastRegisteredKey === registrationKey) {
        return true;
      }

      const idToken = await user.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/notifications/register-token`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expoPushToken,
          timeZone,
          device: getDevicePayload(),
          permissionStatus,
        }),
      });

      if (!response.ok) {
        throw await parseRegistrationError(response);
      }

      lastRegisteredKey = registrationKey;
      return true;
    } catch (error) {
      console.warn(
        "Push notification registration failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      lastRegisteredKey = null;
      return false;
    } finally {
      registrationInFlight = null;
    }
  })();

  return registrationInFlight;
}
