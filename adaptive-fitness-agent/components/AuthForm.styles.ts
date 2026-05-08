import { StyleSheet } from "react-native";
import { appTheme } from "../theme/designSystem";

export const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: appTheme.colors.card,
    borderRadius: appTheme.radii.lg,
    padding: appTheme.spacing.xl,
    ...appTheme.shadows.card,
  },
  form: {
    gap: appTheme.spacing.lg,
  },
  fieldGroup: {
    gap: appTheme.spacing.sm,
  },
  label: {
    ...appTheme.typography.label,
    color: appTheme.colors.textSecondary,
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
  primaryButton: {
    minHeight: appTheme.sizes.buttonMinHeight,
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: appTheme.spacing.lg,
  },
  primaryButtonText: {
    color: appTheme.colors.onPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  switchButton: {
    alignItems: "center",
    paddingVertical: appTheme.spacing.xs,
  },
  switchText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    textAlign: "center",
  },
  switchContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  switchButtonText: {
    color: appTheme.colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: appTheme.sizes.buttonMinHeight,
    backgroundColor: appTheme.colors.card,
    borderRadius: appTheme.radii.pill,
    borderWidth: 1.5,
    borderColor: appTheme.colors.border,
    paddingVertical: appTheme.spacing.lg,
    opacity: 1,
  },
  googleButtonDisabled: {
    opacity: 0.45,
  },
  googleButtonText: {
    marginLeft: appTheme.spacing.sm,
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
    fontWeight: "600",
  },
});
