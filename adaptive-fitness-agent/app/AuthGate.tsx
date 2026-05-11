import React, { useEffect } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { signOut } from "firebase/auth/react-native";

import HomeTabs from "./HomeTabs";
import LoginScreen from "./LoginScreen";
import PasswordSetupScreen from "./PasswordSetupScreen";
import LogoSplash from "../components/ui/LogoSplash";
import { useAuthUser } from "../hooks/useAuthUser";
import { needsEmailVerification, needsPasswordSetup } from "../utils/authRouting";
import { auth } from "../services/firebase";

export type RootStackParamList = {
  Login: undefined;
  PasswordSetup: undefined;
  Home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AuthGate() {
  const { user, loading } = useAuthUser();
  const emailVerificationRequired = needsEmailVerification(user);

  useEffect(() => {
    if (emailVerificationRequired) {
      signOut(auth).catch(() => {});
    }
  }, [emailVerificationRequired]);

  if (loading) {
    return <LogoSplash />;
  }

  const routeState = !user || emailVerificationRequired
    ? "guest"
    : needsPasswordSetup(user)
      ? "password-setup"
      : "authenticated";

  return (
    <Stack.Navigator
      key={routeState}
      initialRouteName={!user || emailVerificationRequired ? "Login" : needsPasswordSetup(user) ? "PasswordSetup" : "Home"}
      screenOptions={{ headerShown: false }}
    >
      {!user || emailVerificationRequired ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="PasswordSetup">
            {() => <PasswordSetupScreen user={user} />}
          </Stack.Screen>
          <Stack.Screen name="Home">
            {() => <HomeTabs user={user} />}
          </Stack.Screen>
        </>
      )}
    </Stack.Navigator>
  );
}
