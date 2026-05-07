import React, { ReactNode, createContext, useContext, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { appTheme } from "../../theme/designSystem";
import AppButton from "./AppButton";

type AlertActionStyle = "primary" | "secondary";

export type AppAlertAction = {
  label: string;
  onPress?: () => void;
  style?: AlertActionStyle;
};

export type AppAlertOptions = {
  title: string;
  message?: string;
  actions?: AppAlertAction[];
  dismissible?: boolean;
};

type AppAlertContextValue = {
  showAlert: (options: AppAlertOptions) => void;
  hideAlert: () => void;
};

type AppAlertProviderProps = {
  children: ReactNode;
};

type StoredAlert = {
  title: string;
  message?: string;
  actions: AppAlertAction[];
  dismissible: boolean;
};

const AppAlertContext = createContext<AppAlertContextValue | null>(null);

const friendlyErrorMap: Array<{
  match: RegExp;
  message: string;
}> = [
  {
    match: /invalid-credential|wrong-password|user-not-found|invalid-login-credentials/i,
    message: "That email or password doesn't look right. Please try again.",
  },
  {
    match: /email-already-in-use/i,
    message: "That email is already being used. Try logging in instead.",
  },
  {
    match: /invalid-email/i,
    message: "Please enter a valid email address.",
  },
  {
    match: /weak-password/i,
    message: "Please choose a stronger password with at least 6 characters.",
  },
  {
    match: /network-request-failed|network error|timeout/i,
    message: "We couldn't connect right now. Please check your internet and try again.",
  },
  {
    match: /too-many-requests/i,
    message: "Too many attempts were made. Please wait a moment and try again.",
  },
  {
    match:
      /denied access|permission[_\s-]?denied|contact support|forbidden|status:\s*403|api has not been used|disabled/i,
    message:
      "This AI provider project is blocked. Verify Vertex IAM permissions and billing for the configured service account.",
  },
  {
    match:
      /unable to authenticate your request|vertex-sdk-api-key-not-supported|no credentials|could not refresh access token/i,
    message:
      "AI provider authentication failed. In nutrition-proxy/.env, set VERTEX_PROJECT_ID, VERTEX_CLIENT_EMAIL, and VERTEX_PRIVATE_KEY (or FIREBASE_* as fallback), or configure GOOGLE_APPLICATION_CREDENTIALS.",
  },
  {
    match: /play services/i,
    message: "Google Play Services is not available on this device right now.",
  },
  {
    match: /sign_in_cancelled|cancelled|canceled/i,
    message: "The sign-in was cancelled before it finished.",
  },
  {
    match: /provider-already-linked/i,
    message: "This account already has email and password sign-in enabled.",
  },
  {
    match: /credential-already-in-use/i,
    message: "That sign-in method is already connected to another account.",
  },
  {
    match: /requires-recent-login/i,
    message: "For security, please confirm your Google account again and retry.",
  },
  {
    match: /operation-not-allowed|admin-restricted-operation/i,
    message:
      "Email and password sign-in is not enabled for this project yet. Please enable it in Firebase Authentication.",
  },
];

export function getUserFriendlyErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  const rawText =
    typeof error === "object" && error !== null
      ? `${String((error as { code?: string }).code ?? "")} ${String(
          (error as { message?: string }).message ?? "",
        )}`.trim()
      : typeof error === "string"
        ? error
        : "";

  const matchedError = friendlyErrorMap.find(({ match }) => match.test(rawText));
  return matchedError?.message ?? fallback;
}

export function AppAlertProvider({ children }: AppAlertProviderProps) {
  const [alert, setAlert] = useState<StoredAlert | null>(null);

  const hideAlert = () => {
    setAlert(null);
  };

  const showAlert = (options: AppAlertOptions) => {
    setAlert({
      title: options.title,
      message: options.message,
      actions:
        options.actions && options.actions.length > 0
          ? options.actions.slice(0, 2)
          : [{ label: "Okay", style: "primary" }],
      dismissible: options.dismissible ?? true,
    });
  };

  const handleActionPress = (action: AppAlertAction) => {
    hideAlert();
    action.onPress?.();
  };

  return (
    <AppAlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(alert)}
        onRequestClose={() => {
          if (alert?.dismissible) {
            hideAlert();
          }
        }}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (alert?.dismissible) {
                hideAlert();
              }
            }}
          />

          {alert ? (
            <View style={styles.card}>
              <View style={styles.content}>

                <Text style={styles.title}>{alert.title}</Text>

                {alert.message ? (
                  <Text style={styles.message}>{alert.message}</Text>
                ) : null}

                <View style={styles.actionsRow}>
                  {alert.actions.map((action) => {
                    const isPrimary = (action.style ?? "primary") === "primary";

                    return (
                      <AppButton
                        key={action.label}
                        title={action.label}
                        onPress={() => handleActionPress(action)}
                        variant={isPrimary ? "primary" : "secondary"}
                      />
                    );
                  })}
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </AppAlertContext.Provider>
  );
}

export function useAppAlert() {
  const context = useContext(AppAlertContext);

  if (!context) {
    throw new Error("useAppAlert must be used inside AppAlertProvider.");
  }

  return context;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.lg,
  },
  card: {
    backgroundColor: appTheme.colors.card,
    borderRadius: appTheme.radii.xl,
    padding: appTheme.spacing.xxl,
    ...appTheme.shadows.modal,
  },
  content: {
    gap: appTheme.spacing.lg,
  },
  title: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  message: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textSecondary,
  },
  actionsRow: {
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.xs,
  },
});
