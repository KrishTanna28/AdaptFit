import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  type User,
} from "firebase/auth/react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

import { auth } from "../services/firebase";
import {
  getUserFriendlyErrorMessage,
  useAppAlert,
} from "../components/ui/AppAlert";
import AppButton from "../components/ui/AppButton";
import AppCard from "../components/ui/AppCard";
import AppTextField from "../components/ui/AppTextField";
import { globalStyles } from "../theme/globalStyles";
import { styles } from "./PasswordSetupScreen.styles";
import { configureGoogleSignIn } from "../services/googleSignin";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "./AuthGate";


type PasswordSetupScreenProps = {
  user: User;
};

export default function PasswordSetupScreen({
  user,
}: PasswordSetupScreenProps) {
  const { showAlert } = useAppAlert();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const linkEmailPassword = async (plainPassword: string) => {
    const currentUser = auth.currentUser;

    if (!currentUser?.email) {
      throw new Error("Email not available.");
    }

    const emailCredential = EmailAuthProvider.credential(
      currentUser.email,
      plainPassword,
    );

    await linkWithCredential(currentUser, emailCredential);
  };

  const reauthenticateGoogleUser = async () => {
    configureGoogleSignIn();
    await GoogleSignin.hasPlayServices();

    let googleResult;

    try {
      googleResult = await GoogleSignin.signInSilently();
    } catch {
      googleResult = await GoogleSignin.signIn();
    }

    const idToken = googleResult.data?.idToken;

    if (!idToken || !auth.currentUser) {
      throw new Error("We couldn't verify your Google account. Please try again.");
    }

    const googleCredential = GoogleAuthProvider.credential(idToken);
    await reauthenticateWithCredential(auth.currentUser, googleCredential);
  };

  const handleSavePassword = async () => {
    if (!user.email) {
      showAlert({
        title: "Email not available",
        message: "We couldn't find an email for this account.",
      });
      return;
    }

    if (!password || !confirmPassword) {
      showAlert({
        title: "Missing fields",
        message: "Please enter and confirm your password.",
      });
      return;
    }

    if (password.length < 6) {
      showAlert({
        title: "Choose a stronger password",
        message: "Your password should be at least 6 characters long.",
      });
      return;
    }

    if (password !== confirmPassword) {
      showAlert({
        title: "Passwords don't match",
        message: "Please make sure both password fields are the same.",
      });
      return;
    }

    try {
      setLoading(true);

      try {
        await linkEmailPassword(password);
      } catch (error) {
        const needsRecentLogin =
          error instanceof Error &&
          /requires-recent-login|recent login/i.test(error.message);

        if (!needsRecentLogin) {
          throw error;
        }

        await reauthenticateGoogleUser();
        await linkEmailPassword(password);
      }

      await auth.currentUser?.reload();
      await auth.currentUser?.getIdToken(true);

      setPassword("");
      setConfirmPassword("");

      showAlert({
        title: "Password added",
        message:
          "Your account is ready. You can now sign in with Google or email and password.",
      });
      navigation.replace("Home")
      
        } catch (error) {
      const message = getUserFriendlyErrorMessage(
        error,
        "We couldn't add your password right now. Please try again in a moment.",
      );

      showAlert({
        title: "Couldn't add password",
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={globalStyles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <AppCard variant="tinted" style={styles.heroCard}>
            <Text style={styles.eyebrow}>One last step</Text>
            <Text style={styles.title}>Add a password to your account</Text>
            <Text style={styles.subtitle}>
              You signed in with Google. Add a password once so you can also log in
              later with your email and password.
            </Text>
          </AppCard>

          <AppCard style={styles.formCard}>
            <Text style={styles.sectionLabel}>Account email</Text>
            <Text style={styles.email}>{user.email}</Text>

            <AppTextField
              label="New password"
              placeholder="Create a password"
              value={password}
              onChangeText={setPassword}
              isPasswordField
            />

            <AppTextField
              label="Confirm password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              isPasswordField
            />

            <AppButton
              title="Save password"
              onPress={handleSavePassword}
              loading={loading}
              disabled={loading}
            />
          </AppCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
