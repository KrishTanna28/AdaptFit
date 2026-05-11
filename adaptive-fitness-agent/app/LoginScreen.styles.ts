import { StyleSheet } from "react-native";
import { appTheme } from "../theme/designSystem";

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: appTheme.colors.background,
  },
  scrollContent: {
    paddingBottom: 60,
  },

  // ─── Hero ─────────────────────────────────────────────────────────────────
  heroSection: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 48,
  },
  heroVisual: {
    width: "100%",
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
  },

  // Small uppercase eyebrow — replaces the giant "AdaptFit" wordmark
  brandPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 22,
  },
  brandPillText: {
    color: appTheme.colors.primary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3.5,
    textTransform: "uppercase",
  },
  brandPillDot: {
    width: 5,
    height: 5,
    borderRadius: 99,
    backgroundColor: appTheme.colors.primary,
  },

  title: {
    color: appTheme.colors.textPrimary,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "800",
    letterSpacing: -0.7,
    textAlign: "center",
    maxWidth: 320,
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "400",
    color: appTheme.colors.textSecondary,
    textAlign: "center",
    maxWidth: 295,
  },
  // ─── Capabilities ─────────────────────────────────────────────────────────
  storySection: {
    paddingHorizontal: 20,
    paddingTop: 48,
    gap: 20,
  },
  sectionHeader: {
    gap: 8,
    paddingHorizontal: 4,
  },
  sectionEyebrow: {
    color: appTheme.colors.primary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.4,
  },

  // Full-width featured card (first item)
  capabilityCardFeatured: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    padding: 20,
    borderRadius: 20,
    backgroundColor: appTheme.colors.card,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  capabilityCardFeaturedBody: {
    flex: 1,
    gap: 6,
  },

  // 2-col rows
  capabilityGrid: {
    gap: 12,
  },
  capabilityRow: {
    flexDirection: "row",
    gap: 12,
  },
  capabilityCard: {
    flex: 1,
    gap: 10,
    padding: 16,
    borderRadius: 20,
    backgroundColor: appTheme.colors.card,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    minHeight: 138,
  },

  capabilityIcon: {
    width: 40,
    height: 40,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.primary,
  },
  capabilityTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  capabilityCopy: {
    color: appTheme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },

  // ─── Aether panel ─────────────────────────────────────────────────────────
  coachPanel: {
    marginHorizontal: 20,
    marginTop: 48,
    borderRadius: 24,
    backgroundColor: appTheme.colors.cardTinted,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    overflow: "hidden",
  },
  coachPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderColor: appTheme.colors.border,
  },
  coachOrb: {
    width: 44,
    height: 44,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.card,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  coachOrbMeta: {
    gap: 2,
  },
  coachOrbName: {
    color: appTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  coachOrbStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  coachOrbStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    backgroundColor: appTheme.colors.primary,
  },
  coachOrbStatusText: {
    color: appTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "500",
  },
  coachPanelBody: {
    padding: 22,
    gap: 12,
  },
  coachTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  coachCopy: {
    color: appTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  coachTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  coachTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  coachTagText: {
    color: appTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },

  // ─── Auth section ─────────────────────────────────────────────────────────
  authSection: {
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 12,
    gap: 16,
  },
  authEyebrow: {
    color: appTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
    textTransform: "uppercase",
    textAlign: "center",
  },
  authTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  authLoadingSkeletonRow: {
    gap: appTheme.spacing.sm,
    alignItems: "center",
    marginTop: appTheme.spacing.xs,
  },

  // ─── Legacy stubs ─────────────────────────────────────────────────────────
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: appTheme.colors.background,
    overflow: "hidden",
  },
  glow: { position: "absolute", borderRadius: 999, opacity: 0.78 },
  glowMint: { width: 260, height: 260, left: -110, top: 84, backgroundColor: "rgba(34,197,94,0.2)" },
  glowBlue: { width: 320, height: 320, right: -150, top: 180, backgroundColor: "rgba(6,182,212,0.18)" },
  glowViolet: { width: 280, height: 280, left: 42, bottom: -140, backgroundColor: "rgba(139,92,246,0.14)" },
  heroHalo: {
    position: "absolute", width: 308, height: 248, borderRadius: appTheme.radii.xl,
    backgroundColor: "rgba(17,17,17,0.88)", borderWidth: 1, borderColor: appTheme.colors.border,
  },
  speedTrail: { position: "absolute", height: 3, borderRadius: appTheme.radii.pill },
  speedTrailTop: { width: 128, left: 34, top: 96, backgroundColor: "rgba(56,189,248,0.38)" },
  speedTrailBottom: { width: 168, right: 22, bottom: 92, backgroundColor: "rgba(34,197,94,0.34)" },
  visualCore: { width: 338, height: 270 },
  orbitCard: {
    position: "absolute", width: 116, minHeight: 84, justifyContent: "center",
    gap: appTheme.spacing.xs, padding: appTheme.spacing.md, borderRadius: appTheme.radii.lg,
    backgroundColor: appTheme.colors.card, borderWidth: 1, borderColor: appTheme.colors.border,
  },
  orbitCardLeft: { left: 4, top: 76 },
  orbitCardRight: { right: 4, bottom: 58 },
  orbitLabel: { ...appTheme.typography.bodySmall, color: appTheme.colors.textSecondary },
  orbitValue: { ...appTheme.typography.headingSmall, color: appTheme.colors.textPrimary },
  identityRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: appTheme.spacing.sm },
  identityChip: {
    paddingHorizontal: appTheme.spacing.lg, paddingVertical: appTheme.spacing.sm,
    borderRadius: appTheme.radii.pill, backgroundColor: appTheme.colors.card,
    borderWidth: 1, borderColor: appTheme.colors.border,
  },
  identityText: { ...appTheme.typography.bodySmall, color: appTheme.colors.primary, fontWeight: "600" },
  ctaRow: { width: "100%", gap: appTheme.spacing.md, marginTop: appTheme.spacing.sm },
  primaryCta: {
    minHeight: appTheme.sizes.buttonMinHeight, alignItems: "center", justifyContent: "center",
    borderRadius: appTheme.radii.pill, backgroundColor: appTheme.colors.primary,
  },
  primaryCtaText: { color: appTheme.colors.onPrimary, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  secondaryCta: {
    minHeight: appTheme.sizes.buttonMinHeight, alignItems: "center", justifyContent: "center",
    borderRadius: appTheme.radii.pill, backgroundColor: appTheme.colors.card,
    borderWidth: 1.5, borderColor: appTheme.colors.border,
  },
  secondaryCtaText: { color: appTheme.colors.primary, fontSize: 15, lineHeight: 20, fontWeight: "700" },
});