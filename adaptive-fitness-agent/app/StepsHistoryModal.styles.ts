import { StyleSheet } from "react-native";
import { appTheme } from "../theme/designSystem";

export const styles = StyleSheet.create({
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
  modalCard: {
    width: "100%",
    borderRadius: appTheme.radii.xl,
    backgroundColor: appTheme.colors.card,
    padding: appTheme.spacing.xl,
    gap: appTheme.spacing.lg,
    ...appTheme.shadows.modal,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  modalTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  modalCloseButton: {
    width: appTheme.sizes.iconButtonMd,
    height: appTheme.sizes.iconButtonMd,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.background,
  },
  rangeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.sm,
  },
  rangeChip: {
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.subtlePressed,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.sm,
  },
  rangeChipActive: {
    backgroundColor: appTheme.colors.primaryLight,
    borderWidth: 1.5,
    borderColor: appTheme.colors.primary,
  },
  rangeChipText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    fontWeight: "500",
  },
  rangeChipTextActive: {
    color: appTheme.colors.primary,
    fontWeight: "600",
  },
  modalMeta: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  chartScroll: {
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.background,
    position: "relative",
    overflow: "hidden",
  },
  chartInner: {
    paddingVertical: appTheme.spacing.lg,
    alignItems: "center",
  },
  chartNavButton: {
    position: "absolute",
    top: "50%",
    marginTop: appTheme.sizes.chartNavOffset,
    width: appTheme.sizes.chartNavButton,
    height: appTheme.sizes.chartNavButton,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.background,
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
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    textAlign: "center",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  loadingText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  emptyText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
});
