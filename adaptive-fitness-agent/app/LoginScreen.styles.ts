import { StyleSheet } from "react-native";
import { appTheme } from "../theme/designSystem";

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: appTheme.colors.background,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.lg,
    paddingTop: appTheme.spacing.lg,
    paddingBottom: appTheme.spacing.xxl,
    gap: appTheme.spacing.lg,
  },
  heroCard: {
    backgroundColor: appTheme.colors.card,
    borderRadius: appTheme.radii.lg,
    padding: appTheme.spacing.xl,
    gap: appTheme.spacing.md,
    alignItems: "center",
    ...appTheme.shadows.card,
  },
  eyebrow: {
    ...appTheme.typography.label,
    color: appTheme.colors.primary,
    textAlign: "center",
  },
  title: {
    ...appTheme.typography.headingLarge,
    color: appTheme.colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textSecondary,
    textAlign: "center",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.sm,
  },
  tag: {
    backgroundColor: appTheme.colors.primaryLight,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.sm,
    borderRadius: appTheme.radii.pill,
  },
  primaryTag: {
    backgroundColor: appTheme.colors.primaryLight,
  },
  tagText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.primary,
    fontWeight: "500",
  },
  primaryTagText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.primary,
    fontWeight: "600",
  },
  authLoadingSkeletonRow: {
    gap: appTheme.spacing.sm,
    alignItems: "center",
    marginTop: appTheme.spacing.xs,
  },
});
