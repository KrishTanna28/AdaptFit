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
    gap: appTheme.spacing.lg,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  heroTextWrap: {
    flex: 1,
    gap: appTheme.spacing.xs,
  },
  title: {
    ...appTheme.typography.headingLarge,
    color: appTheme.colors.textPrimary,
  },
  subtitle: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textSecondary,
  },
  datePickerTrigger: {
    minHeight: appTheme.sizes.inputMinHeight,
    borderRadius: appTheme.radii.pill,
    borderWidth: 1.5,
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.transparent,
    paddingHorizontal: appTheme.spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  datePickerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
    flexShrink: 1,
  },
  datePickerValue: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.primary,
    fontWeight: "600",
  },
  sectionCard: {
    gap: appTheme.spacing.lg,
  },
  lockedCard: {
    backgroundColor: appTheme.colors.cardTinted,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  sectionTitleWrap: {
    flex: 1,
    gap: appTheme.spacing.xs,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  sectionTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  sectionMeta: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.sm,
  },
  metricItem: {
    width: "47%",
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.background,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.xs,
  },
  metricValue: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  metricLabel: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  progressTrack: {
    height: appTheme.sizes.progressThin,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primaryLight,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primary,
  },
  quickButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.sm,
  },
  quickButton: {
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.subtlePressed,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  quickButtonText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.primary,
    fontWeight: "600",
  },
  inputRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
  },
  inputCell: {
    flex: 1,
    minWidth: 0,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.sm,
  },
  chip: {
    minWidth: appTheme.sizes.iconButtonLg,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.subtlePressed,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.sm,
    alignItems: "center",
  },
  chipActive: {
    backgroundColor: appTheme.colors.primaryLight,
    borderWidth: 1.5,
    borderColor: appTheme.colors.primary,
  },
  chipText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    fontWeight: "500",
  },
  chipTextActive: {
    color: appTheme.colors.primary,
    fontWeight: "600",
  },
  helperText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  disabledText: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textSecondary,
  },
  actionsRow: {
    gap: appTheme.spacing.sm,
  },
  actionButton: {
    width: "100%",
  },
  notesInput: {
    minHeight: 88,
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.background,
    borderWidth: 1.5,
    borderColor: appTheme.colors.transparent,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.md,
    color: appTheme.colors.textPrimary,
    ...appTheme.typography.bodyLarge,
    textAlignVertical: "top",
  },
});
