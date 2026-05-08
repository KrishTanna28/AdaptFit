import React from "react";
import { View, TouchableOpacity, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import AppTextField from "./ui/AppTextField";
import { styles } from "./AuthForm.styles";
import { appTheme } from "../theme/designSystem";

type AuthFormProps = {
  email: string;
  password: string;
  confirmPassword: string;
  isSignup: boolean;
  onChangeEmail: (value: string) => void;
  onChangePassword: (value: string) => void;
  onChangeConfirmPassword: (value: string) => void;
  onSubmit: () => void;
  onToggleMode: () => void;
  onGoogleSignIn: () => void;
  googleDisabled: boolean;
};

export default function AuthForm({
  email,
  password,
  confirmPassword,
  isSignup,
  onChangeEmail,
  onChangePassword,
  onChangeConfirmPassword,
  onSubmit,
  onToggleMode,
  onGoogleSignIn,
  googleDisabled,
}: AuthFormProps) {
  return (
    <View style={styles.card}>
      <View style={styles.form}>
        <AppTextField
          label="Email"
          placeholder="Enter your email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={onChangeEmail}
        />

        <AppTextField
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={onChangePassword}
          isPasswordField
        />

        {isSignup ? (
          <AppTextField
            label="Confirm password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChangeText={onChangeConfirmPassword}
            isPasswordField
          />
        ) : null}

        <TouchableOpacity onPress={onSubmit} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>
            {isSignup ? "Create account" : "Sign in"}
          </Text>
        </TouchableOpacity>

        <View style={styles.switchContainer}>
  <Text style={styles.switchText}>
    {isSignup ? "Already have an account? " : "Don't have an account? "}
  </Text>

  <TouchableOpacity onPress={onToggleMode}>
    <Text style={styles.switchButtonText}>
      {isSignup ? "Sign in" : "Create account"}
    </Text>
  </TouchableOpacity>
</View>

        <TouchableOpacity
          onPress={onGoogleSignIn}
          disabled={googleDisabled}
          style={[
            styles.googleButton,
            googleDisabled && styles.googleButtonDisabled,
          ]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              fill={appTheme.colors.googleBlue}
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <Path
              fill={appTheme.colors.googleGreen}
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <Path
              fill={appTheme.colors.googleYellow}
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <Path
              fill={appTheme.colors.googleRed}
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </Svg>

          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
