import { StyleSheet } from "react-native";
import { appTheme } from "../theme/designSystem";

export const styles = StyleSheet.create({
  container: {
    gap: appTheme.spacing.lg,
  },
  scrollContent: {
    paddingHorizontal: appTheme.spacing.lg,
    paddingTop: appTheme.spacing.lg,
    paddingBottom: appTheme.spacing.xxl,
  },
  profileCard: {
    gap: appTheme.spacing.xs,
  },
  sectionLabel: {
    ...appTheme.typography.headingMedium,
    color: appTheme.colors.textPrimary,
  },
  stepsCard: {
    alignSelf: "flex-start",
    width: "100%",
    minHeight: 120,
    borderRadius: appTheme.radii.lg,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm,
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  stepsInfo: {
    flex: 1,
    gap: appTheme.spacing.sm,
    justifyContent: "center",
  },
  stepsSkeletonWrap: {
    gap: appTheme.spacing.xs,
  },
  stepsProgressWrap: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  stepsProgressIndicatorWrap: {
    width: "100%",
    gap: appTheme.spacing.sm,
  },
  ringCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ringPercentText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "800",
    color: appTheme.colors.primary,
  },
  stepsMetricRow: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  stepsMetricIcon: {
    width: 20,
    height: 20,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  stepsMetricIconSteps: {
    backgroundColor: appTheme.colors.success,
  },
  stepsMetricIconMinutes: {
    backgroundColor: appTheme.colors.accent,
  },
  stepsMetricIconCalories: {
    backgroundColor: "#FF5CAD",
  },
  stepsMiniMetricText: {
    fontSize: 13,
    lineHeight: 16,
    color: appTheme.colors.textSecondary,
  },
  stepsMiniMetricValue: {
    fontSize: 14,
    lineHeight: 16,
    color: appTheme.colors.textPrimary,
    fontWeight: "700",
  },
  metricsCard: {
    gap: appTheme.spacing.lg,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.xs,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primaryLight,
  },
  streakText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.primary,
    fontWeight: "600",
  },
  metricsTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  metricsGrid: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  metricItem: {
    flex: 1,
    gap: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.sm,
  },
  metricItemDivider: {
    borderLeftWidth: 1,
    borderLeftColor: appTheme.colors.border,
  },
  metricValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  metricLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  metricValue: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  stepsValue: {
    ...appTheme.typography.metric,
    color: appTheme.colors.textPrimary,
  },
  metricLabel: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  goalSection: {
    gap: appTheme.spacing.sm,
  },
  progressTrack: {
    width: "100%",
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
  progressThumb: {
    position: "absolute",
    top: appTheme.spacing.xs,
    width: appTheme.spacing.xxl + appTheme.spacing.xl,
    height: appTheme.spacing.xxl - appTheme.spacing.xs,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.card,
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  progressThumbText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.primary,
    fontWeight: "600",
  },
  progressCaption: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    textAlign: "right",
  },
  progressValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: appTheme.spacing.xs,
  },
  suggestionCard: {
    gap: appTheme.spacing.md,
    borderLeftWidth: appTheme.spacing.xs,
    borderLeftColor: appTheme.colors.primary,
  },
  suggestionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  suggestionLabel: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  suggestionText: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
  },
  lifestyleRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
  },
  lifestylePressable: {
    flex: 1,
  },
  lifestyleCard: {
    flex: 1,
    gap: appTheme.spacing.sm,
  },
  lifestyleHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  lifestyleTitle: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  lifestyleValue: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  lifestyleMeta: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  trendCard: {
    gap: appTheme.spacing.lg,
  },
  trendHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  trendTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  trendMeta: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.primary,
    fontWeight: "600",
  },
  trendChartWrap: {
    minHeight: 90,
    width: "100%",
    alignItems: "stretch",
    justifyContent: "center",
  },
  trendLabelsRow: {
    flexDirection: "row",
    paddingTop: appTheme.spacing.sm,
  },
  trendLabel: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    textAlign: "center",
  },
  emptyText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
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
  email: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  pillRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.sm,
  },
  pill: {
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.sm,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.subtlePressed,
  },
  workoutPill: {
    backgroundColor: appTheme.colors.primaryLight,
  },
  calmPill: {
    backgroundColor: appTheme.colors.cardTinted,
  },
  pillText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.primary,
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    gap: appTheme.spacing.md,
  },
  statCard: {
    flex: 1,
    gap: appTheme.spacing.xs,
  },
  statValue: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  statLabel: {
    ...appTheme.typography.label,
    color: appTheme.colors.textSecondary,
  },
  passwordCard: {
    gap: appTheme.spacing.lg,
    backgroundColor: appTheme.colors.cardTinted,
  },
  passwordTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  passwordSubtitle: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.overlay,
    paddingHorizontal: appTheme.spacing.lg,
  },
  modalDismissLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    width: "100%",
    borderRadius: appTheme.radii.xl,
    backgroundColor: appTheme.colors.card,
    padding: appTheme.spacing.xl,
    gap: appTheme.spacing.lg,
    ...appTheme.shadows.modal,
  },
  sheetHeaderRow: {
    gap: appTheme.spacing.xs,
  },
  sheetTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  sheetSubtitle: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  sheetMetricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: appTheme.spacing.md,
    columnGap: appTheme.spacing.md,
  },
  sheetMetricItem: {
    width: "47%",
    gap: appTheme.spacing.xs,
  },
  sheetMetricValue: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  sheetMetricLabel: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
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
  },
  quickButtonText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.primary,
    fontWeight: "600",
  },
  helperText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
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
  goalModalCard: {
    width: "100%",
    borderRadius: appTheme.radii.xl,
    backgroundColor: appTheme.colors.card,
    padding: appTheme.spacing.xl,
    gap: appTheme.spacing.lg,
    ...appTheme.shadows.modal,
  },
  goalModalTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  goalModalSubtitle: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  goalListContainer: {
    maxHeight: 320,
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.background,
    overflow: "hidden",
  },
  goalListContent: {
    paddingVertical: appTheme.spacing.xs,
  },
  goalListItem: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
  },
  goalListItemSelected: {
    backgroundColor: appTheme.colors.primaryLight,
  },
  goalListItemText: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
    fontWeight: "500",
  },
  goalListItemTextSelected: {
    color: appTheme.colors.primary,
    fontWeight: "700",
  },
  goalModalActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  goalModalCloseButton: {
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.sm,
  },
  goalModalCloseText: {
    ...appTheme.typography.label,
    color: appTheme.colors.textSecondary,
  },
  goalModalSaveButton: {
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primary,
    paddingHorizontal: appTheme.spacing.xl,
    paddingVertical: appTheme.spacing.sm,
  },
  goalModalSaveButtonDisabled: {
    opacity: 0.45,
  },
  goalModalSaveText: {
    ...appTheme.typography.label,
    color: appTheme.colors.card,
    fontWeight: "700",
  },
});
