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
    gap: appTheme.spacing.sm,
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
  dateText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  addFab: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionCard: {
    gap: appTheme.spacing.md,
  },
  sectionTitle: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  emptyText: {
    ...appTheme.typography.label,
    color: appTheme.colors.mutedText,
  },

  macroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: appTheme.spacing.md,
    columnGap: appTheme.spacing.md,
  },
  macroItem: {
    width: "47%",
    gap: appTheme.spacing.xs,
  },
  macroValue: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  macroLabel: {
    ...appTheme.typography.label,
    color: appTheme.colors.mutedText,
  },

  mealHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  mealActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    flex: 1,
    gap: appTheme.spacing.sm,
  },
  addMealButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: appTheme.radii.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addMealText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.text,
    fontWeight: "700",
  },
  platePreviewImage: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.inputBackground,
  },
  scannerPermissionBlock: {
    gap: appTheme.spacing.md,
  },
  scannerFrame: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: appTheme.radii.md,
    overflow: "hidden",
    backgroundColor: appTheme.colors.text,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
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
    gap: appTheme.spacing.sm,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
    paddingBottom: appTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
  },
  entryLeft: {
    flex: 1,
    gap: 2,
  },
  entryName: {
    ...appTheme.typography.body,
    color: appTheme.colors.text,
    fontWeight: "700",
  },
  entryMeta: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  entryRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  entryCalories: {
    ...appTheme.typography.body,
    color: appTheme.colors.text,
    fontWeight: "700",
  },
  entryMacros: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(32, 32, 34, 0.34)",
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    maxHeight: "88%",
    borderRadius: appTheme.radii.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.cardAlt,
    overflow: "hidden",
  },
  modalContent: {
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.md,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  modalTitleWrap: {
    flex: 1,
    gap: 2,
  },
  modalTitle: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },
  modalIconButton: {
    width: 36,
    height: 36,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.card,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },

  fieldLabel: {
    ...appTheme.typography.label,
    color: appTheme.colors.mutedText,
  },

  mealChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mealChip: {
    borderRadius: appTheme.radii.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: appTheme.colors.inputBackground,
  },
  mealChipActive: {
    backgroundColor: appTheme.colors.card,
    borderColor: appTheme.colors.secondary,
  },
  mealChipText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  mealChipTextActive: {
    color: appTheme.colors.text,
    fontWeight: "700",
  },

  modeRow: {
    flexDirection: "row",
    gap: 10,
  },
  modeButton: {
    flex: 1,
    borderRadius: appTheme.radii.md,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    paddingVertical: 10,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: appTheme.colors.card,
    borderColor: appTheme.colors.secondary,
  },
  modeButtonText: {
    ...appTheme.typography.body,
    color: appTheme.colors.mutedText,
    fontWeight: "600",
  },
  modeButtonTextActive: {
    color: appTheme.colors.text,
    fontWeight: "700",
  },

  block: {
    gap: appTheme.spacing.sm,
  },
  searchButtonWrap: {
    marginTop: 2,
  },
  hintText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },

  searchResultsWrap: {
    gap: appTheme.spacing.sm,
    marginTop: 4,
  },
  resultRow: {
    borderRadius: appTheme.radii.md,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  resultRowActive: {
    borderColor: appTheme.colors.secondary,
    backgroundColor: appTheme.colors.card,
  },
  resultLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  resultTitle: {
    ...appTheme.typography.body,
    color: appTheme.colors.text,
    fontWeight: "700",
  },
  resultMeta: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  resultRight: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    gap: 2,
  },
  resultCalories: {
    ...appTheme.typography.body,
    color: appTheme.colors.text,
    fontWeight: "700",
  },
  resultMacros: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
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
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityValue: {
    minWidth: 56,
    textAlign: "center",
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
  },

  modalActions: {
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.sm,
    marginBottom: 4,
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
  datePickerBlock: {
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.xs,
  },
  datePickerLabel: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
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
  datePickerHelpText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  datePickerModalCard: {
    width: "100%",
    maxWidth: 430,
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
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.xs,
    backgroundColor: appTheme.colors.card,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  calendarHeaderButtonText: {
    ...appTheme.typography.body,
    color: appTheme.colors.text,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  datePickerActionsRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
    paddingHorizontal: appTheme.spacing.lg,
    paddingTop: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.cardAlt,
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
    backgroundColor: "rgba(32, 32, 34, 0.32)",
  },
  monthYearEditorCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: appTheme.radii.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.cardAlt,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
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
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  dateOptionRow: {
    borderRadius: appTheme.radii.md,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  dateOptionRowActive: {
    borderColor: appTheme.colors.secondary,
    backgroundColor: appTheme.colors.card,
  },
  dateOptionTitle: {
    ...appTheme.typography.body,
    color: appTheme.colors.text,
    fontWeight: "700",
  },
  dateOptionMeta: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
});


export const detailModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(32, 32, 34, 0.34)",
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    borderRadius: appTheme.radii.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.cardAlt,
    overflow: "hidden",
  },
  content: {
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.md,
  },
  title: {
    ...appTheme.typography.subheading,
    color: appTheme.colors.text,
    flex: 1,
  },
  meta: {
    ...appTheme.typography.caption,
    color: appTheme.colors.mutedText,
  },
  line: {
    ...appTheme.typography.body,
    color: appTheme.colors.text,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.inputBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  menu: {
    backgroundColor: appTheme.colors.inputBackground,
    gap: 6,
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuText: {
    ...appTheme.typography.body,
    color: appTheme.colors.text,
    fontWeight: "600",
  },
  modalCloseText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.text,
    fontWeight: "700",
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.card,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
});
