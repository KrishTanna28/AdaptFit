import { StyleSheet } from "react-native";
import { appTheme } from "../theme/designSystem";

export const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: appTheme.spacing.lg,
    paddingTop: appTheme.spacing.lg,
    paddingBottom: appTheme.spacing.xxl,
  },
  container: {
    gap: appTheme.spacing.lg,
  },
  heroCard: {
    gap: appTheme.spacing.sm,
  },
  eyebrow: {
    ...appTheme.typography.label,
    color: appTheme.colors.primary,
  },
  title: {
    ...appTheme.typography.headingLarge,
    color: appTheme.colors.textPrimary,
  },
  subtitle: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textSecondary,
  },
  formCard: {
    gap: appTheme.spacing.lg,
  },
  sectionLabel: {
    ...appTheme.typography.label,
    color: appTheme.colors.textSecondary,
  },
  email: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    marginBottom: appTheme.spacing.xs,
  },
});
