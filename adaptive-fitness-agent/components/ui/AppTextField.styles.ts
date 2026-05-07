import { StyleSheet } from "react-native";
import { appTheme } from "../../theme/designSystem";

export const styles = StyleSheet.create({
  wrapper: {
    gap: appTheme.spacing.sm,
  },
  label: {
    ...appTheme.typography.label,
    color: appTheme.colors.textSecondary,
  },
  inputRow: {
    minHeight: appTheme.sizes.inputMinHeight,
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.background,
    borderWidth: 1.5,
    borderColor: appTheme.colors.transparent,
    justifyContent: "center",
  },
  inputRowFocused: {
    borderColor: appTheme.colors.primary,
  },
  input: {
    minHeight: appTheme.sizes.inputMinHeight,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.md,
    color: appTheme.colors.textPrimary,
    ...appTheme.typography.bodyLarge,
  },
  inputWithButton: {
    paddingRight: appTheme.spacing.xxl + appTheme.spacing.xl,
  },
  visibilityButton: {
    position: "absolute",
    right: appTheme.spacing.lg,
    width: appTheme.sizes.iconButtonXs,
    height: appTheme.sizes.iconButtonXs,
    alignItems: "center",
    justifyContent: "center",
  },
});
