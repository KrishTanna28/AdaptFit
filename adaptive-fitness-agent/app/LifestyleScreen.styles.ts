import { StyleSheet } from "react-native";
import { appTheme } from "../theme/designSystem";

export const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.xl,
  },
  container: {
    gap: appTheme.spacing.lg,
  },
  heroCard: {
    gap: appTheme.spacing.md,
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
    ...appTheme.typography.heading,
    color: appTheme.colors.text,
  },
  subtitle: {
    ...appTheme.typography.body,
    color: appTheme.colors.mutedText,
  },
  datePickerTrigger: {
    minHeight: 48,
    borderRadius: appTheme.radii.md,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    paddingHorizontal: appTheme.spacing.md,
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
    ...appTheme.typography.body,
    color: appTheme.colors.text,
    fontWeight: "700",
  },
  sectionCard: {
    gap: appTheme.spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  sectionTitleWrap: {
    flex: 1,
    gap: 2,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  sectionTitle: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  sectionMeta: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.sm,
  },
  metricItem: {
    width: "47%",
    borderRadius: appTheme.radii.md,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.xs,
  },
  metricValue: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  metricLabel: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  progressTrack: {
    height: 12,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.inputBackground,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
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
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  quickButtonText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.text,
    fontWeight: "700",
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
    minWidth: 42,
    borderRadius: appTheme.radii.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm,
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
  helperText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  disabledText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  actionsRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
  },
  actionButton: {
    flex: 1,
    minWidth: 0,
  },
});
