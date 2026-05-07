import { TextStyle, ViewStyle } from "react-native";

export const colors = {
  background: "#F4F6F8",
  card: "#FFFFFF",
  cardTinted: "#EAF4FF",
  primary: "#1259C3",
  primaryLight: "#E8F0FE",
  accent: "#00B4D8",
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  border: "#E5E7EB",
  tabBar: "#FFFFFF",
  tabActive: "#1259C3",
  tabInactive: "#9CA3AF",
  shadow: "rgba(0,0,0,0.06)",
  overlay: "rgba(0,0,0,0.45)",
  transparent: "transparent",
  skeletonBase: "#E8EAED",
  skeletonHighlight: "#F5F6F8",
  macroProtein: "#3B82F6",
  macroCarbs: "#F59E0B",
  macroFat: "#EF4444",
  cameraBackground: "#0F1117",
  cameraSurface: "#1C1F26",
  cameraControl: "#FFFFFF",
  whiteOverlay: "rgba(255,255,255,0.86)",
  subtlePressed: "#F0F2F5",
  googleBlue: "#4285F4",
  googleGreen: "#34A853",
  googleYellow: "#FBBC05",
  googleRed: "#EA4335",

  // Backward-compatible semantic aliases used by existing components.
  cardAlt: "#FFFFFF",
  secondary: "#9CA3AF",
  text: "#1A1A2E",
  mutedText: "#6B7280",
  inputBackground: "#F4F6F8",
  strength: "#E8F0FE",
  yoga: "#EAF4FF",
};

export const darkColors = {
  background: "#0F1117",
  card: "#1C1F26",
  primary: "#4D8EFF",
  textPrimary: "#F0F2F5",
  textSecondary: "#9CA3AF",
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  } as ViewStyle,
  modal: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
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
