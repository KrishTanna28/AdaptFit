import { StyleSheet } from "react-native";
import { appTheme } from "../theme/designSystem";

export const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: appTheme.colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    padding: 24,
  },
  form: {
    gap: 16,
  },
  fieldGroup: {
    gap: appTheme.spacing.sm,
  },
  label: {
    color: appTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  input: {
    minHeight: appTheme.sizes.inputMinHeight,
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.background,
    borderWidth: 1.5,
    borderColor: appTheme.colors.transparent,
    paddingHorizontal: appTheme.spacing.lg,
    color: appTheme.colors.textPrimary,
    ...appTheme.typography.bodyLarge,
  },

  // Primary action
  primaryButton: {
    minHeight: appTheme.sizes.buttonMinHeight,
    backgroundColor: appTheme.colors.primary,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: appTheme.colors.onPrimary,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.1,
  },

  // Secondary action (resend code etc.)
  secondaryButton: {
    minHeight: 44,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: appTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },

  // OTP notice box
  verificationNotice: {
    gap: 6,
    padding: 16,
    borderRadius: 16,
    backgroundColor: appTheme.colors.cardTinted,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  verificationTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  verificationCopy: {
    color: appTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  verificationError: {
    color: appTheme.colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -4,
  },

  // Mode toggle row
  switchButton: {
    alignItems: "center",
    paddingVertical: appTheme.spacing.xs,
  },
  switchContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  switchText: {
    color: appTheme.colors.textSecondary,
    fontSize: 13,
  },
  switchButtonText: {
    color: appTheme.colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: appTheme.colors.border,
  },
  dividerText: {
    color: appTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },

  // Google sign-in
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTheme.sizes.buttonMinHeight,
    backgroundColor: appTheme.colors.background,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    gap: 10,
  },
  googleButtonDisabled: {
    opacity: 0.4,
  },
  googleButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
});