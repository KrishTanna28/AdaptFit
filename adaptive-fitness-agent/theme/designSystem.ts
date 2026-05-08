import { TextStyle, ViewStyle } from "react-native";

export const colors = {
  background: "#050505",
  card: "#111111",
  cardTinted: "#171717",
  primary: "#22C55E",
  primaryLight: "#1C1C1C",

  accent: "#06B6D4",
  accentBlue: "#38BDF8",
  accentPurple: "#8B5CF6",

  onPrimary: "#000000",

  textPrimary: "#FAFAFA",
  textSecondary: "#A1A1AA",
  textMuted: "#71717A",

  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",

  border: "#27272A",

  tabBar: "#090909",
  tabActive: "#22C55E",
  tabInactive: "#71717A",

  shadow: "rgba(0,0,0,0.45)",
  overlay: "rgba(0,0,0,0.78)",

  transparent: "transparent",

  skeletonBase: "#18181B",
  skeletonHighlight: "#27272A",

  macroProtein: "#38BDF8",
  macroCarbs: "#8B5CF6",
  macroFat: "#EF4444",

  cameraBackground: "#000000",
  cameraSurface: "#111111",
  cameraControl: "#FFFFFF",

  whiteOverlay: "rgba(255,255,255,0.9)",

  subtlePressed: "#1F1F1F",

  googleBlue: "#4285F4",
  googleGreen: "#34A853",
  googleYellow: "#FBBC05",
  googleRed: "#EA4335",

  // Backward-compatible semantic aliases used by existing components.
  cardAlt: "#18181B",
  secondary: "#06B6D4",
  text: "#FAFAFA",
  mutedText: "#A1A1AA",
  inputBackground: "#0D0D0D",

  strength: "#1A1A1A",
  yoga: "#141414",
};

export const darkColors = {
  background: colors.background,
  card: colors.card,
  primary: colors.primary,
  textPrimary: colors.textPrimary,
  textSecondary: colors.textSecondary,
};

export const radii = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const sizes = {
  iconButtonXs: 24,
  iconButtonSm: 34,
  iconButtonMd: 36,
  iconButtonLg: 40,
  tabIcon: 22,
  tabBarHeight: 60,
  inputMinHeight: 48,
  buttonMinHeight: 50,
  avatar: 80,
  progressThin: 4,
  progressMedium: 8,
  progressLarge: 10,
  chartNavOffset: -18,
  chartNavButton: 36,
  modalMaxWidth: 430,
  cameraPreviewHeight: 360,
  quantityButton: 36,
};

export const typography = {
  headingLarge: {
    fontSize: 26,
    fontWeight: "700" as TextStyle["fontWeight"],
    letterSpacing: -0.5,
  },
  headingMedium: {
    fontSize: 20,
    fontWeight: "700" as TextStyle["fontWeight"],
    letterSpacing: -0.3,
  },
  headingSmall: {
    fontSize: 16,
    fontWeight: "600" as TextStyle["fontWeight"],
  },
  bodyLarge: {
    fontSize: 15,
    fontWeight: "400" as TextStyle["fontWeight"],
    lineHeight: 22,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: "400" as TextStyle["fontWeight"],
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: "500" as TextStyle["fontWeight"],
    letterSpacing: 0.3,
    textTransform: "uppercase" as TextStyle["textTransform"],
  },
  metric: {
    fontSize: 36,
    fontWeight: "700" as TextStyle["fontWeight"],
    letterSpacing: -1,
  },
  metricUnit: {
    fontSize: 14,
    fontWeight: "500" as TextStyle["fontWeight"],
    color: colors.textSecondary,
  },

  // Backward-compatible typography aliases.
  heading: {
    fontSize: 26,
    fontWeight: "700" as TextStyle["fontWeight"],
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 20,
    fontWeight: "700" as TextStyle["fontWeight"],
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 15,
    fontWeight: "400" as TextStyle["fontWeight"],
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    fontWeight: "400" as TextStyle["fontWeight"],
    lineHeight: 18,
  },
};

export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 4,
  } as ViewStyle,
  modal: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 24,
    elevation: 12,
  } as ViewStyle,
};

export const appTheme = {
  colors,
  darkColors,
  radii,
  spacing,
  sizes,
  typography,
  shadows: {
    ...shadows,
    soft: shadows.card,
    medium: shadows.modal,
  },
};
