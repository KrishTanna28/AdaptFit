import { StyleSheet } from "react-native";
import { appTheme } from "../../theme/designSystem";

export const styles = StyleSheet.create({
  base: {
    borderRadius: appTheme.radii.lg,
    padding: appTheme.spacing.xl,
    ...appTheme.shadows.card,
  },
  defaultCard: {
    backgroundColor: appTheme.colors.card,
  },
  tintedCard: {
    backgroundColor: appTheme.colors.cardTinted,
  },
});
