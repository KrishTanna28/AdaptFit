import { StyleSheet } from "react-native";
import { appTheme } from "../theme/designSystem";

export const styles = StyleSheet.create({
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
  modalCard: {
    width: "100%",
    borderRadius: appTheme.radii.lg,
    backgroundColor: appTheme.colors.cardAlt,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  modalTitle: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  modalCloseButton: {
    borderRadius: appTheme.radii.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    padding: appTheme.spacing.xs,
  },
  rangeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.sm,
  },
  rangeChip: {
    borderRadius: appTheme.radii.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.xs,
  },
  rangeChipActive: {
    backgroundColor: appTheme.colors.card,
    borderColor: appTheme.colors.primary,
  },
  rangeChipText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
    fontWeight: "700",
  },
  rangeChipTextActive: {
    color: appTheme.colors.text,
  },
  modalMeta: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  chartScroll: {
    borderRadius: appTheme.radii.md,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    position: "relative",
    overflow: "hidden",
  },
  chartInner: {
    paddingVertical: appTheme.spacing.md,
    alignItems: "center",
  },
  chartNavButton: {
    position: "absolute",
    top: "50%",
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  chartNavButtonLeft: {
    left: appTheme.spacing.sm,
  },
  chartNavButtonRight: {
    right: appTheme.spacing.sm,
  },
  chartNavButtonDisabled: {
    opacity: 0.45,
  },
  chartLabelsRow: {
    flexDirection: "row",
    paddingBottom: appTheme.spacing.sm,
  },
  chartLabel: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
    textAlign: "center",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  loadingText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  emptyText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
});
