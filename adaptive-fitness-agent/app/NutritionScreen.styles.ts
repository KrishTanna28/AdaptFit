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
  title: {
    ...appTheme.typography.headingLarge,
    color: appTheme.colors.textPrimary,
  },
  subtitle: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textSecondary,
  },
  dateText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  addFab: {
    width: appTheme.sizes.iconButtonLg,
    height: appTheme.sizes.iconButtonLg,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCard: {
    gap: appTheme.spacing.lg,
  },
  sectionTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  emptyText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  macroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: appTheme.spacing.md,
    columnGap: appTheme.spacing.sm,
  },
  macroItem: {
    width: "47%",
    gap: appTheme.spacing.xs,
  },
  macroValue: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  macroLabel: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  macroProgressTrack: {
    height: appTheme.sizes.progressThin,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primaryLight,
    overflow: "hidden",
  },
  macroProgressFill: {
    height: "100%",
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primary,
  },
  macroProgressProtein: {
    backgroundColor: appTheme.colors.macroProtein,
  },
  macroProgressCarbs: {
    backgroundColor: appTheme.colors.macroCarbs,
  },
  macroProgressFat: {
    backgroundColor: appTheme.colors.macroFat,
  },
  mealHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  mealTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  mealActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flex: 1,
    gap: appTheme.spacing.sm,
  },
  addMealButton: {
    width: appTheme.sizes.iconButtonMd,
    height: appTheme.sizes.iconButtonMd,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  addMealText: {
    display: "none",
  },
  platePreviewImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.background,
  },
  scannerPermissionBlock: {
    gap: appTheme.spacing.md,
  },
  scannerFrame: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: appTheme.radii.md,
    overflow: "hidden",
    backgroundColor: appTheme.colors.cameraBackground,
  },
  scannerCamera: {
    ...StyleSheet.absoluteFillObject,
  },
  scannerGuide: {
    position: "absolute",
    left: "12%",
    right: "12%",
    top: "38%",
    height: 88,
    borderRadius: appTheme.radii.md,
    borderWidth: 2,
    borderColor: appTheme.colors.primary,
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
  entryMacros: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    textAlign: "right",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.lg,
  },
  scannerModalOverlay: {
    flex: 1,
    backgroundColor: appTheme.colors.cameraBackground,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    maxHeight: "88%",
    borderRadius: appTheme.radii.xl,
    backgroundColor: appTheme.colors.card,
    overflow: "hidden",
    ...appTheme.shadows.modal,
  },
  cameraModalCard: {
    backgroundColor: appTheme.colors.cameraSurface,
  },
  modalContent: {
    padding: appTheme.spacing.xl,
    gap: appTheme.spacing.lg,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  modalTitleWrap: {
    flex: 1,
    gap: appTheme.spacing.xs,
  },
  modalTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  modalTitleOnDark: {
    color: appTheme.colors.card,
  },
  modalIconButton: {
    width: appTheme.sizes.iconButtonMd,
    height: appTheme.sizes.iconButtonMd,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.background,
  },
  modalIconButtonOnDark: {
    backgroundColor: appTheme.colors.primary,
  },
  fieldLabel: {
    ...appTheme.typography.label,
    color: appTheme.colors.textSecondary,
  },
  mealChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.sm,
  },
  mealChip: {
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.subtlePressed,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.sm,
  },
  mealChipActive: {
    backgroundColor: appTheme.colors.primaryLight,
    borderWidth: 1.5,
    borderColor: appTheme.colors.primary,
  },
  mealChipText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  mealChipTextActive: {
    color: appTheme.colors.primary,
    fontWeight: "600",
  },
  modeRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.background,
    padding: appTheme.spacing.xs,
  },
  modeButton: {
    flex: 1,
    borderRadius: appTheme.radii.pill,
    paddingVertical: appTheme.spacing.sm,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: appTheme.colors.card,
    ...appTheme.shadows.card,
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
  block: {
    gap: appTheme.spacing.md,
  },
  searchButtonWrap: {
    marginTop: appTheme.spacing.xs,
  },
  hintText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  hintTextOnDark: {
    color: appTheme.colors.textMuted,
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
  resultRight: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    gap: appTheme.spacing.xs,
  },
  resultCalories: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  resultMacros: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    textAlign: "right",
  },
  manualRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
  },
  manualCell: {
    flex: 1,
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: appTheme.spacing.md,
  },
  quantityButton: {
    width: appTheme.sizes.quantityButton,
    height: appTheme.sizes.quantityButton,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityValue: {
    minWidth: 56,
    textAlign: "center",
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  modalActions: {
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.sm,
    marginBottom: appTheme.spacing.xs,
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
  datePickerBlock: {
    gap: appTheme.spacing.xs,
  },
  datePickerLabel: {
    ...appTheme.typography.label,
    color: appTheme.colors.textSecondary,
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
  datePickerHelpText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  datePickerModalCard: {
    width: "100%",
    maxWidth: appTheme.sizes.modalMaxWidth,
    maxHeight: "92%",
    alignSelf: "center",
  },
  datePickerScroll: {
    flexGrow: 0,
  },
  datePickerModalContent: {
    paddingBottom: appTheme.spacing.sm,
  },
  calendarHeaderButton: {
    alignSelf: "center",
    borderRadius: appTheme.radii.pill,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.sm,
    backgroundColor: appTheme.colors.background,
  },
  calendarHeaderButtonText: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
    textTransform: "capitalize",
  },
  datePickerActionsRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
    paddingHorizontal: appTheme.spacing.xl,
    paddingTop: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.xl,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.card,
  },
  datePickerActionButton: {
    flex: 1,
    minWidth: 0,
  },
  monthYearEditorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    padding: appTheme.spacing.lg,
    zIndex: 10,
  },
  monthYearEditorBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: appTheme.colors.overlay,
  },
  monthYearEditorCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: appTheme.radii.xl,
    backgroundColor: appTheme.colors.card,
    padding: appTheme.spacing.xl,
    gap: appTheme.spacing.lg,
    ...appTheme.shadows.modal,
  },
  monthYearEditorRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
  },
  monthYearEditorField: {
    flex: 1,
  },
  monthYearEditorActions: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.xs,
  },
  datePickerHint: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  dateOptionRow: {
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.background,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.md,
    gap: appTheme.spacing.xs,
  },
  dateOptionRowActive: {
    backgroundColor: appTheme.colors.primaryLight,
    borderWidth: 1.5,
    borderColor: appTheme.colors.primary,
  },
  dateOptionTitle: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
    fontWeight: "600",
  },
  dateOptionMeta: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
});

export const detailModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    borderRadius: appTheme.radii.xl,
    backgroundColor: appTheme.colors.card,
    overflow: "hidden",
    ...appTheme.shadows.modal,
  },
  content: {
    padding: appTheme.spacing.xl,
    gap: appTheme.spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  title: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
    flex: 1,
  },
  meta: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
    paddingVertical: appTheme.spacing.sm,
  },
  lineLabel: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textSecondary,
  },
  lineValue: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  iconButton: {
    width: appTheme.sizes.iconButtonSm,
    height: appTheme.sizes.iconButtonSm,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  menu: {
    gap: appTheme.spacing.sm,
  },
  menuItem: {
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuText: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
    fontWeight: "600",
  },
  modalCloseText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    fontWeight: "600",
  },
  modalCloseButton: {
    width: appTheme.sizes.iconButtonMd,
    height: appTheme.sizes.iconButtonMd,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.background,
  },
});
