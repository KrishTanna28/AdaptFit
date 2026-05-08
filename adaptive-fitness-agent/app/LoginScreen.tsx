import React, { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
} from "firebase/auth/react-native";
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";

import { auth } from "../services/firebase";
import AuthForm from "../components/AuthForm";
import { getUserFriendlyErrorMessage, useAppAlert } from "../components/ui/AppAlert";
import AppSkeleton from "../components/ui/AppSkeleton";
import { styles } from "./LoginScreen.styles";
import { configureGoogleSignIn } from "../services/googleSignin";

export default function LoginScreen() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [isSignup, setIsSignup] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const { showAlert } = useAppAlert();

    const handleAuth = async () => {
    if (!email || !password || (isSignup && !confirmPassword)) {
      showAlert({
        title: "Missing fields",
        message: isSignup
          ? "Please enter your email, password, and confirm password."
          : "Please enter your email and password before continuing.",
      });
      return;
    }

    if (isSignup && password !== confirmPassword) {
      showAlert({
        title: "Passwords don't match",
        message: "Please make sure both password fields are the same.",
      });
      return;
    }

    setLoading(true);
    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error) {
      const message = getUserFriendlyErrorMessage(
        error,
        isSignup
          ? "We couldn't create your account right now. Please try again."
          : "We couldn't sign you in right now. Please try again.",
      );

      showAlert({
        title: isSignup ? "Couldn't create account" : "Couldn't sign in",
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      configureGoogleSignIn();

      await GoogleSignin.hasPlayServices();

      await GoogleSignin.signOut();

      const userInfo = await GoogleSignin.signIn();

      if (!userInfo.data?.idToken) {
        return;
      }

      const credential = GoogleAuthProvider.credential(userInfo.data.idToken);
      await signInWithCredential(auth, credential);
    } catch (error) {
      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) {
          return;
        }
        if (error.code === statusCodes.IN_PROGRESS) {
          showAlert({
            title: "Google sign-in already running",
            message: "Please wait for the current sign-in request to finish.",
          });
          return;
        }
        if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          showAlert({
            title: "Google Play Services unavailable",
            message: "Google Play Services is not available on this device right now.",
          });
          return;
        }
      }

            const message = getUserFriendlyErrorMessage(
        error,
        "Google sign-in didn't complete. Please try again.",
      );

      showAlert({
        title: "Google sign-in failed",
        message,
      });

    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Adaptive Fitness</Text>
          <Text style={styles.title}>
            {isSignup ? "Create your fitness space" : "Welcome back to your wellness space"}
          </Text>
          <Text style={styles.subtitle}>
            Track workouts, stay consistent, and keep your routine feeling calm and clean.
          </Text>

          <View style={styles.tagRow}>
            <View style={[styles.tag, styles.primaryTag]}>
              <Text style={styles.primaryTagText}>Drona coaching</Text>
            </View>
            <View style={styles.tag}>
              <Text style={styles.tagText}>Gentle progress</Text>
            </View>
          </View>
        </View>

          <AuthForm
          email={email}
          password={password}
          confirmPassword={confirmPassword}
          isSignup={isSignup}
          onChangeEmail={setEmail}
          onChangePassword={setPassword}
          onChangeConfirmPassword={setConfirmPassword}
          onSubmit={handleAuth}
          onToggleMode={() => {
            setIsSignup((prev) => !prev);
            setPassword("");
            setConfirmPassword("");
          }}
          onGoogleSignIn={handleGoogleSignIn}
          googleDisabled={loading}
        />
      </View>
    </SafeAreaView>
  );
}
