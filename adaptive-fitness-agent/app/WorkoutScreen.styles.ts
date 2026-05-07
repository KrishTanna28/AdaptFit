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
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  heroTextWrap: {
    flex: 1,
    gap: appTheme.spacing.xs,
  },
  heroActionButton: {
    width: appTheme.sizes.iconButtonLg,
    height: appTheme.sizes.iconButtonLg,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.primaryLight,
  },
  title: {
    ...appTheme.typography.headingLarge,
    color: appTheme.colors.textPrimary,
  },
  subtitle: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textSecondary,
  },
  datePickerBlock: {
    gap: appTheme.spacing.xs,
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
  sectionTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  totalsGrid: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  totalItem: {
    flex: 1,
    gap: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.sm,
  },
  totalItemDivider: {
    borderLeftWidth: 1,
    borderLeftColor: appTheme.colors.border,
  },
  totalValue: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  totalLabel: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  emptyText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  mealHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  addMealButton: {
    width: appTheme.sizes.iconButtonLg,
    height: appTheme.sizes.iconButtonLg,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addMealText: {
    display: "none",
  },
  entriesList: {
    gap: 0,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
  },
  entryLeft: {
    flex: 1,
    gap: appTheme.spacing.xs,
  },
  entryName: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
  },
  entryMeta: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  entryRight: {
    alignItems: "flex-end",
    gap: appTheme.spacing.xs,
  },
  entryCalories: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  formCheckOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
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
    maxHeight: "88%",
  },
  modalCard: {
    borderRadius: appTheme.radii.xl,
    backgroundColor: appTheme.colors.card,
    overflow: "hidden",
    ...appTheme.shadows.modal,
  },
  modalContent: {
    padding: appTheme.spacing.xl,
    gap: appTheme.spacing.lg,
  },
  modalTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  modalIconButton: {
    width: appTheme.sizes.iconButtonMd,
    height: appTheme.sizes.iconButtonMd,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.background,
  },
  fieldLabel: {
    ...appTheme.typography.label,
    color: appTheme.colors.textSecondary,
  },
  block: {
    gap: appTheme.spacing.md,
  },
  searchButtonWrap: {
    marginTop: appTheme.spacing.xs,
  },
  searchResultsWrap: {
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.xs,
  },
  resultRow: {
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.card,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  resultRowActive: {
    backgroundColor: appTheme.colors.primaryLight,
    borderWidth: 1.5,
    borderColor: appTheme.colors.primary,
  },
  resultLeft: {
    flex: 1,
    minWidth: 0,
    gap: appTheme.spacing.xs,
  },
  resultTitle: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
    fontWeight: "600",
  },
  resultMeta: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  manualRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
  },
  manualCell: {
    flex: 1,
  },
  modeRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
    flexWrap: "wrap",
  },
  modeButton: {
    flex: 1,
    minWidth: 88,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.subtlePressed,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.sm,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: appTheme.colors.primaryLight,
    borderWidth: 1.5,
    borderColor: appTheme.colors.primary,
  },
  modeButtonText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    fontWeight: "500",
  },
  modeButtonTextActive: {
    color: appTheme.colors.primary,
    fontWeight: "600",
  },
  modalActions: {
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.sm,
    marginBottom: appTheme.spacing.xs,
  },
  formCameraPreview: {
    height: appTheme.sizes.cameraPreviewHeight,
    borderRadius: appTheme.radii.lg,
    backgroundColor: appTheme.colors.cameraBackground,
    overflow: "hidden",
    position: "relative",
  },
  formCameraPlaceholder: {
    height: appTheme.sizes.cameraPreviewHeight,
    borderRadius: appTheme.radii.lg,
    backgroundColor: appTheme.colors.cameraBackground,
    alignItems: "center",
    justifyContent: "center",
    padding: appTheme.spacing.lg,
  },
  formCameraNotice: {
    position: "absolute",
    left: appTheme.spacing.sm,
    right: appTheme.spacing.sm,
    bottom: appTheme.spacing.sm,
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.whiteOverlay,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
  },
  formCameraNoticeText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textPrimary,
    fontWeight: "600",
    textAlign: "center",
  },
  formStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  formErrorText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.danger,
    fontWeight: "600",
  },
  formSummaryBlock: {
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.background,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.xs,
  },
  formInsightsScroll: {
    flexShrink: 1,
  },
  formInsightsContent: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  formInsightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: appTheme.spacing.sm,
  },
  formInsightIndex: {
    width: appTheme.sizes.iconButtonXs,
    height: appTheme.sizes.iconButtonXs,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primary,
    color: appTheme.colors.card,
    textAlign: "center",
    lineHeight: appTheme.sizes.iconButtonXs,
    fontWeight: "700",
  },
  formInsightText: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
    flex: 1,
  },
  detailLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
    paddingVertical: appTheme.spacing.sm,
    gap: appTheme.spacing.md,
  },
  detailLineLabel: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textSecondary,
  },
  detailLineValue: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
    textAlign: "right",
    flex: 1,
  },
});
