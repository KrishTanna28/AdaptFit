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
  headerCard: {
    gap: appTheme.spacing.sm,
    alignItems: "center",
    position: "relative",
    overflow: "visible",
  },
  photoPressable: {
    width: appTheme.sizes.avatar,
    height: appTheme.sizes.avatar,
    borderRadius: appTheme.radii.pill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.background,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: appTheme.spacing.xs,
    backgroundColor: appTheme.colors.primaryLight,
  },
  avatarFallbackText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  title: {
    ...appTheme.typography.headingMedium,
    color: appTheme.colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    textAlign: "center",
  },
  completionCard: {
    gap: appTheme.spacing.md,
  },
  completionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  completionTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  completionPercent: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.primary,
  },
  progressTrack: {
    width: "100%",
    height: appTheme.sizes.progressMedium,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primary,
  },
  progressCaption: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  detailsCard: {
    gap: 0,
  },
  detailsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: appTheme.spacing.sm,
  },
  editButton: {
    width: appTheme.sizes.iconButtonMd,
    height: appTheme.sizes.iconButtonMd,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.primaryLight,
  },
  row: {
    gap: appTheme.spacing.xs,
  },
  label: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  value: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
  },
  sectionTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
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
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
  },
  previewLabel: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    flex: 1,
  },
  previewValue: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  bottomSpace: {
    paddingBottom: appTheme.spacing.xl,
  },
  bottomHint: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    textAlign: "center",
  },
  photoMenuContainer: {
    position: "relative",
    alignItems: "center",
    zIndex: 60,
    elevation: 60,
  },
  photoDropdown: {
    position: "absolute",
    top: appTheme.sizes.avatar + appTheme.spacing.sm,
    width: 180,
    borderRadius: appTheme.radii.md,
    backgroundColor: appTheme.colors.card,
    overflow: "hidden",
    zIndex: 70,
    elevation: 70,
    ...appTheme.shadows.card,
  },
  photoDropdownAction: {
    paddingVertical: appTheme.spacing.md,
    paddingHorizontal: appTheme.spacing.lg,
    backgroundColor: appTheme.colors.card,
  },
  photoDropdownActionWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
  },
  photoDropdownActionText: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
    fontWeight: "500",
    textAlign: "center",
  },
});
