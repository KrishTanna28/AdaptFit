import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  Text,
  View,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Pizza,
  Dumbbell,
  Mic,
  Moon,
  BrainCircuit,
  Footprints,
} from "lucide-react-native";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth/react-native";
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { appTheme } from "../theme/designSystem";
import { auth } from "../services/firebase";
import { AuthForm, OtpVerificationContent } from "../components/AuthForm";
import { getUserFriendlyErrorMessage, useAppAlert } from "../components/ui/AppAlert";
import { styles } from "./LoginScreen.styles";
import { configureGoogleSignIn } from "../services/googleSignin";
import { requestSignupOtp, verifySignupOtp } from "../services/signupVerification";

type Capability = {
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  title: string;
  copy: string;
};

const capabilities: Capability[] = [
  {
    Icon: Dumbbell,
    title: "Workout planning",
    copy: "Ask Aether for a workout and load the plan into today's log.",
  },
  {
    Icon: Pizza,
    title: "Nutrition logging",
    copy: "Search foods, scan barcodes, capture plates, or add meals manually.",
  },
  {
    Icon: Moon,
    title: "Water and sleep",
    copy: "Log hydration, sleep, weather, and recovery context in one place.",
  },
  {
    Icon: Mic,
    title: "Voice notes",
    copy: "Dictate a message to Aether and listen back to coach replies.",
  },
  {
    Icon: Footprints,
    title: "Steps trend",
    copy: "Track daily steps, step goals, calories burned, and history.",
  },
  {
    Icon: BrainCircuit,
    title: "Aether insight",
    copy: "Get coach check-ins from your latest logs and activity context.",
  },
];

const identitySignals = ["Steps", "Workouts", "Nutrition", "Recovery"];

function HeroSystem() {
  return (
    <View
      style={[
        styles.heroVisual,
        {
          justifyContent: "center",
          alignItems: "center",
        },
      ]}
      pointerEvents="none"
    >
      <Image
        source={require("../assets/logo svg.png")}
        resizeMode="contain"
        style={{
          width: 260,
          height: 260,
        }}
      />
    </View>
  );
}

export default function LoginScreen() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [signupVerificationId, setSignupVerificationId] = useState<string>("");
  const [signupOtpSentTo, setSignupOtpSentTo] = useState<string>("");
  const [isSignup, setIsSignup] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const { showAlert, hideAlert } = useAppAlert();
  const scrollRef = useRef<ScrollView>(null);
  const entrance = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const breathingLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    breathingLoop.start();

    return () => breathingLoop.stop();
  }, [breath, entrance]);

  const heroReveal = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
    ],
  };

  const capabilityReveal = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [36, 0],
        }),
      },
    ],
  };

  const resetSignupVerification = () => {
    setSignupVerificationId("");
    setSignupOtpSentTo("");
  };

  const handleChangeEmail = (value: string) => {
    setEmail(value);
    resetSignupVerification();
  };

  const handleVerifySignupOtp = async (otp: string, verificationId: string) => {
    const cleanedOtp = otp.trim();

    if (!/^\d{6}$/.test(cleanedOtp)) {
      throw new Error("Please enter the 6-digit verification code from your email.");
    }

    await verifySignupOtp({
      email: email.trim(),
      password,
      otp: cleanedOtp,
      verificationId,
    });
    await signInWithEmailAndPassword(auth, email.trim(), password);
    resetSignupVerification();
    hideAlert();
  };

  const showSignupVerificationAlert = (targetEmail: string, verificationId: string) => {
    showAlert({
      title: "Verification required",
      dismissible: false,
      actions: [],
      content: (
        <OtpVerificationContent
          email={targetEmail}
          loading={loading}
          onResend={handleResendSignupOtp}
          onVerify={(otp) => handleVerifySignupOtp(otp, verificationId)}
        />
      ),
    });
  };

  const sendSignupOtp = async () => {
    const trimmedEmail = email.trim();
    const response = await requestSignupOtp(trimmedEmail);
    setSignupVerificationId(response.verificationId);
    setSignupOtpSentTo(response.email);
    showSignupVerificationAlert(response.email, response.verificationId);
  };

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
        if (!signupVerificationId) {
          await sendSignupOtp();
          return;
        }

        showSignupVerificationAlert(signupOtpSentTo || email.trim(), signupVerificationId);
      } else {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (!credential.user.emailVerified) {
          await signOut(auth);
          showAlert({
            title: "Email not verified",
            message:
              "Please create your account through the verification code flow before signing in.",
          });
        }
      }
    } catch (error: any) {
      const message =
        typeof error === "string"
          ? error
          : error?.message ||
          JSON.stringify(error) ||
          getUserFriendlyErrorMessage(
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

  const handleResendSignupOtp = async () => {
    if (!email.trim()) {
      showAlert({
        title: "Email missing",
        message: "Enter your email before requesting a new code.",
      });
      return;
    }

    setLoading(true);
    try {
      await sendSignupOtp();
    } catch (error) {
      const message = getUserFriendlyErrorMessage(
        error,
        "We couldn't send a new verification code right now.",
      );

      throw new Error(message);
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
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Animated.View style={[styles.heroSection, heroReveal]}>
          <View style={styles.brandPill}>
            <Text style={styles.brandPillText}>AdaptFit</Text>
          </View>

          <Text style={styles.title}>Start with Aether, then build the day around your logs.</Text>
          <Text style={styles.subtitle}>
            Your AI fitness companion brings workouts, steps, meals, hydration,
            sleep, weather, and form checks into one calm routine.
          </Text>

          <HeroSystem />
        </Animated.View>

        <Animated.View style={[styles.storySection, capabilityReveal]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>Personal ecosystem</Text>
            <Text style={styles.sectionTitle}>
              Everything here points back to what the app already tracks.
            </Text>
          </View>

          <View style={styles.capabilityGrid}>
            {capabilities.map(({ Icon, title, copy }) => (
              <View key={title} style={styles.capabilityCard}>
                <View style={styles.capabilityIcon}>
                  <Icon color={appTheme.colors.onPrimary} size={18} strokeWidth={2.2} />
                </View>
                <Text style={styles.capabilityTitle}>{title}</Text>
                <Text style={styles.capabilityCopy}>{copy}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <View style={styles.coachPanel}>
          <View style={styles.coachOrb}>
            <BrainCircuit color={appTheme.colors.primary} size={22} strokeWidth={2.4} />
          </View>
          <Text style={styles.coachTitle}>Aether keeps the plan human.</Text>
          <Text style={styles.coachCopy}>
            Aether can use your recent steps, meals, workouts, hydration, and
            recovery logs to offer a focused check-in when you need direction.
          </Text>
        </View>

        <View style={styles.authSection}>
          <Text style={styles.authEyebrow}>Enter your wellness space</Text>
          <AuthForm
            email={email}
            password={password}
            confirmPassword={confirmPassword}
            isSignup={isSignup}
            onChangeEmail={handleChangeEmail}
            onChangePassword={setPassword}
            onChangeConfirmPassword={setConfirmPassword}
            onSubmit={handleAuth}
            onToggleMode={() => {
              setIsSignup((prev) => !prev);
              setPassword("");
              setConfirmPassword("");
              resetSignupVerification();
            }}
            onGoogleSignIn={handleGoogleSignIn}
            googleDisabled={loading}
            loading={loading}
            signupOtpSentTo={signupOtpSentTo}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
