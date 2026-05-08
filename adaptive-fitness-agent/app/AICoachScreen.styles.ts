import { StyleSheet } from "react-native";
import { appTheme } from "../theme/designSystem";

export const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingHorizontal: appTheme.spacing.lg,
    paddingTop: appTheme.spacing.lg,
    paddingBottom: appTheme.spacing.sm,
    gap: appTheme.spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: appTheme.colors.card,
    borderRadius: appTheme.radii.lg,
    padding: appTheme.spacing.xl,
    gap: appTheme.spacing.sm,
    ...appTheme.shadows.card,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    ...appTheme.typography.headingMedium,
    color: appTheme.colors.textPrimary,
  },
  subtitle: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  voiceToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.background,
  },
  voiceToggleText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textPrimary,
    fontWeight: "600",
  },
  signalsCard: {
    backgroundColor: appTheme.colors.cardTinted,
    borderRadius: appTheme.radii.lg,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.sm,
    ...appTheme.shadows.card,
  },
  signalText: {
    alignSelf: "flex-start",
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.primaryLight,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.xs,
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.primary,
    fontWeight: "500",
  },
  quickPromptRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.sm,
  },
  quickPromptChip: {
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.subtlePressed,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.sm,
  },
  quickPromptChipDisabled: {
    opacity: 0.45,
  },
  quickPromptText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.primary,
    fontWeight: "600",
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    paddingVertical: appTheme.spacing.md,
    gap: appTheme.spacing.lg,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    gap: appTheme.spacing.xl,
    paddingBottom: appTheme.spacing.xxl,
  },
  emptyHeroText: {
    alignItems: "center",
    gap: appTheme.spacing.sm,
    paddingHorizontal: appTheme.spacing.md,
  },
  emptyTitle: {
    ...appTheme.typography.headingLarge,
    color: appTheme.colors.textPrimary,
    fontWeight: "800",
    textAlign: "center",
  },
  emptySubtitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
    textAlign: "center",
  },
  emptyHelper: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textSecondary,
    textAlign: "center",
  },
  messageRow: {
    width: "100%",
  },
  assistantRow: {
    alignItems: "flex-start",
  },
  userRow: {
    alignItems: "flex-end",
  },
  messageBubble: {
    borderRadius: appTheme.radii.lg,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  assistantBubble: {
    maxWidth: "85%",
    backgroundColor: appTheme.colors.card,
    ...appTheme.shadows.card,
  },
  userBubble: {
    maxWidth: "75%",
    backgroundColor: appTheme.colors.primary,
  },
  messageText: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
  },
  userMessageText: {
    color: appTheme.colors.card,
  },
  workoutCard: {
    maxWidth: "85%",
    borderRadius: appTheme.radii.lg,
    backgroundColor: appTheme.colors.card,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.md,
    ...appTheme.shadows.card,
  },
  workoutCardHeader: {
    gap: appTheme.spacing.xs,
  },
  workoutCardEyebrow: {
    ...appTheme.typography.label,
    color: appTheme.colors.primary,
  },
  workoutCardTitle: {
    ...appTheme.typography.headingSmall,
    color: appTheme.colors.textPrimary,
  },
  workoutCardSubtitle: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  workoutExerciseList: {
    gap: appTheme.spacing.sm,
    backgroundColor: appTheme.colors.cardTinted,
    borderRadius: appTheme.radii.md,
    padding: appTheme.spacing.md,
  },
  workoutExerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
  },
  workoutExerciseName: {
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
    flex: 1,
  },
  workoutExerciseMeta: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    fontWeight: "600",
  },
  workoutCardFooter: {
    marginTop: appTheme.spacing.xs,
  },
  speakMessageButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.background,
  },
  speakMessageButtonText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    fontWeight: "500",
  },
  thinkingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  thinkingText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
  },
  composerWrap: {
    backgroundColor: appTheme.colors.card,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.border,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
    marginHorizontal: -appTheme.spacing.lg,
    marginBottom: 0,
    paddingBottom: appTheme.spacing.sm,
  },  
  composerWrapCentered: {
    borderTopWidth: 0,
    borderRadius: appTheme.radii.lg,
    marginHorizontal: 0,
    padding: appTheme.spacing.md,
    ...appTheme.shadows.card,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: appTheme.spacing.sm,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.background,
  },
  iconButtonActive: {
    backgroundColor: appTheme.colors.danger,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    borderRadius: appTheme.radii.pill,
    backgroundColor: appTheme.colors.background,
    paddingHorizontal: appTheme.spacing.lg,
    paddingVertical: appTheme.spacing.sm,
    ...appTheme.typography.bodyLarge,
    color: appTheme.colors.textPrimary,
    textAlignVertical: "top",
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: appTheme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.primary,
  },
  sendButtonDisabled: {
    backgroundColor: appTheme.colors.subtlePressed,
  },
  statusText: {
    ...appTheme.typography.bodySmall,
    color: appTheme.colors.textSecondary,
    paddingHorizontal: appTheme.spacing.xs,
  },
});
