import { StyleSheet } from "react-native";
import { appTheme } from "../theme/designSystem";

export const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCardWrap: {
    maxHeight: "85%",
  },
  modalCard: {
    backgroundColor: appTheme.colors.card,
    borderRadius: appTheme.radii.xl,
    ...appTheme.shadows.modal,
  },
  modalContent: {
    padding: appTheme.spacing.xl,
    gap: appTheme.spacing.lg,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  modalCloseText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    fontWeight: "600",
  },
  loadingText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  dropdownGroup: {
    gap: appTheme.spacing.sm,
    zIndex: 2,
  },
  dropdownLabel: {
    ...appTheme.typography.label,
    color: appTheme.colors.textSecondary,
  },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: appTheme.sizes.inputMinHeight,
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.background,
    borderWidth: 1.5,
    borderColor: appTheme.colors.transparent,
    paddingHorizontal: appTheme.spacing.lg,
  },
  dropdownValue: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
    flex: 1,
    paddingRight: appTheme.spacing.sm,
  },
  dropdownCaret: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    fontWeight: "600",
  },
  dropdownMenu: {
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.background,
    overflow: "hidden",
  },
  dropdownItem: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.md,
  },
  dropdownItemSelected: {
    backgroundColor: appTheme.colors.primaryLight,
  },
  dropdownItemText: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
  },
  dropdownItemTextSelected: {
    fontWeight: "600",
    color: appTheme.colors.primary,
  },
  modalActionsRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.xs,
  },
  modalActionButton: {
    flex: 1,
  },
});
