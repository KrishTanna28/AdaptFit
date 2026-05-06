import { StyleSheet } from "react-native";
import { appTheme } from "../theme/designSystem";

export const styles = StyleSheet.create({
  container: {
    gap: appTheme.spacing.lg,
  },
  stepsCard: {
    gap: appTheme.spacing.sm,
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  stepsInfo: {
    gap: appTheme.spacing.xs,
  },
  stepsSkeletonWrap: {
    gap: appTheme.spacing.xs,
  },
  stepsProgressWrap: {
    flex: 1,
    maxWidth: 170,
    alignItems: "flex-end",
  },
  stepsProgressIndicatorWrap: {
    width: "100%",
    height: 30,
    justifyContent: "center",
  },
  metricsCard: {
    gap: appTheme.spacing.md,
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
    gap: 6,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 4,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.cardAlt,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  streakText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.text,
    fontWeight: "700",
  },
  metricsTitle: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: appTheme.spacing.md,
    columnGap: appTheme.spacing.md,
  },
  metricItem: {
    width: "47%",
    gap: appTheme.spacing.xs,
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
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  stepsValue: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
    fontSize: 30,
    fontWeight: "600",
  },
  metricLabel: {
    ...appTheme.typography.label,
    color: appTheme.colors.mutedText,
  },
  goalSection: {
    gap: appTheme.spacing.xs,
  },
  progressTrack: {
    width: "100%",
    height: 10,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primary,
  },
  progressThumb: {
    position: "absolute",
    top: 3,
    width: 48,
    height: 24,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.cardAlt,
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  progressThumbText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.text,
    fontSize: 11,
    lineHeight: 12,
    fontWeight: "700",
  },
  progressCaption: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
    textAlign: "right",
  },
  progressValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: appTheme.spacing.xs,
  },
  suggestionCard: {
    gap: appTheme.spacing.xs,
  },
  suggestionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  suggestionLabel: {
    ...appTheme.typography.label,
    color: appTheme.colors.mutedText,
  },
  suggestionText: {
    ...appTheme.typography.body,
    color: appTheme.colors.text,
  },
  lifestyleRow: {
    flexDirection: "row",
    gap: appTheme.spacing.md,
  },
  lifestylePressable: {
    flex: 1,
  },
  lifestyleCard: {
    gap: appTheme.spacing.xs,
  },
  lifestyleHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  lifestyleTitle: {
    ...appTheme.typography.label,
    color: appTheme.colors.mutedText,
  },
  lifestyleValue: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  lifestyleMeta: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  trendCard: {
    gap: appTheme.spacing.md,
  },
  trendHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  trendTitle: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  trendMeta: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  trendChartWrap: {
    minHeight: 90,
    width: "100%",
    alignItems: "stretch",
    justifyContent: "center",
  },
  trendLabelsRow: {
    flexDirection: "row",
    paddingTop: appTheme.spacing.xs,
  },
  trendLabel: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
    textAlign: "center",
  },
  emptyText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  heroCard: {
    gap: appTheme.spacing.sm,
  },
  eyebrow: {
    ...appTheme.typography.label,
    color: appTheme.colors.text,
  },
  title: {
    ...appTheme.typography.heading,
  },
  subtitle: {
    ...appTheme.typography.body,
    color: appTheme.colors.mutedText,
  },
  profileCard: {
    gap: appTheme.spacing.sm,
  },
  sectionLabel: {
    ...appTheme.typography.label,
  },
  email: {
    ...appTheme.typography.subheading,
  },
  pillRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.sm,
  },
  pill: {
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.xs,
    borderRadius: appTheme.radii.pill,
  },
  workoutPill: {
    backgroundColor: appTheme.colors.strength,
  },
  calmPill: {
    backgroundColor: appTheme.colors.yoga,
  },
  pillText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.text,
    fontWeight: "700",
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
    ...appTheme.typography.subheading,
  },
  statLabel: {
    ...appTheme.typography.label,
  },
  passwordCard: {
    gap: appTheme.spacing.md,
  },
  passwordTitle: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  passwordSubtitle: {
    ...appTheme.typography.body,
    color: appTheme.colors.mutedText,
  },
  scrollContent: {
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.xl,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(21, 17, 19, 0.45)",
    paddingHorizontal: appTheme.spacing.lg,
  },
  modalDismissLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  sheetCard: {
    width: "100%",
    borderRadius: appTheme.radii.lg,
    backgroundColor: appTheme.colors.card,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.md,
  },
  sheetHeaderRow: {
    gap: 4,
  },
  sheetTitle: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  sheetSubtitle: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
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
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  sheetMetricLabel: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  quickButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.sm,
  },
  quickButton: {
    borderRadius: appTheme.radii.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.xs,
  },
  quickButtonText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.text,
    fontWeight: "700",
  },
  helperText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.sm,
  },
  chip: {
    minWidth: 42,
    borderRadius: appTheme.radii.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.xs,
    alignItems: "center",
  },
  chipActive: {
    backgroundColor: appTheme.colors.card,
    borderColor: appTheme.colors.secondary,
  },
  chipText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
    fontWeight: "700",
  },
  chipTextActive: {
    color: appTheme.colors.text,
  },
  goalModalCard: {
    width: "100%",
    borderRadius: appTheme.radii.lg,
    backgroundColor: appTheme.colors.card,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.md,
  },
  goalModalTitle: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  goalModalSubtitle: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  goalListContainer: {
    maxHeight: 320,
    borderRadius: appTheme.radii.md,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.background,
  },
  goalListContent: {
    paddingVertical: appTheme.spacing.xs,
  },
  goalListItem: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appTheme.colors.border,
  },
  goalListItemSelected: {
    backgroundColor: appTheme.colors.cardAlt,
  },
  goalListItemText: {
    ...appTheme.typography.body,
    color: appTheme.colors.text,
    fontWeight: "600",
  },
  goalListItemTextSelected: {
    color: appTheme.colors.text,
    fontWeight: "800",
  },
  goalModalActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  goalModalCloseButton: {
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.xs,
  },
  goalModalCloseText: {
    ...appTheme.typography.label,
    color: appTheme.colors.mutedText,
  },
  goalModalSaveButton: {
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.xs,
  },
  goalModalSaveButtonDisabled: {
    opacity: 0.45,
  },
  goalModalSaveText: {
    ...appTheme.typography.label,
    color: appTheme.colors.background,
    fontWeight: "800",
  },
});
