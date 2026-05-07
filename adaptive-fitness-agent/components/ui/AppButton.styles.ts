import { StyleSheet } from "react-native";
import { appTheme } from "../../theme/designSystem";

export const styles = StyleSheet.create({
  animatedWrap: {
    borderRadius: appTheme.radii.pill,
  },
  base: {
    minHeight: appTheme.sizes.buttonMinHeight,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.xl,
    paddingVertical: appTheme.spacing.lg,
  },
  primary: {
    backgroundColor: appTheme.colors.primary,
    borderWidth: 0,
  },
  secondary: {
    backgroundColor: appTheme.colors.transparent,
    borderWidth: 1.5,
    borderColor: appTheme.colors.primary,
  },
  secondaryDanger: {
    borderColor: appTheme.colors.danger,
  },
  disabled: {
    opacity: 0.45,
  },
  text: {
    fontSize: 15,
    fontWeight: "600",
  },
  primaryText: {
    color: appTheme.colors.card,
  },
  secondaryText: {
    color: appTheme.colors.primary,
  },
  secondaryDangerText: {
    color: appTheme.colors.danger,
  },
});
