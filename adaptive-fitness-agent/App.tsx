import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";

import AuthGate from "./app/AuthGate";
import { AppAlertProvider } from "./components/ui/AppAlert";
import { appTheme } from "./theme/designSystem";

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: appTheme.colors.background,
    card: appTheme.colors.background,
    text: appTheme.colors.textPrimary,
    border: appTheme.colors.background,
    primary: appTheme.colors.primary,
  },
};

export default function App() {
  return (
    <AppAlertProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={navigationTheme}>
        <AuthGate />
      </NavigationContainer>
    </AppAlertProvider>
  );
}
