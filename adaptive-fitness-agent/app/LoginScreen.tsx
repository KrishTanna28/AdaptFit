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
import {
  getUserFriendlyErrorMessage,
  useAppAlert,
} from "../components/ui/AppAlert";
import { styles } from "./LoginScreen.styles";
import { configureGoogleSignIn } from "../services/googleSignin";
import {
  requestSignupOtp,
  verifySignupOtp,
} from "../services/signupVerification";

// ─── Types ────────────────────────────────────────────────────────────────────

type Capability = {
  Icon: React.ComponentType<{
    color?: string;
    size?: number;
    strokeWidth?: number;
  }>;
  title: string;
  copy: string;
};

// ─── Capability data ──────────────────────────────────────────────────────────

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

// ─── Hero logo ────────────────────────────────────────────────────────────────

function HeroSystem() {
  return (
    <View style={styles.heroVisual} pointerEvents="none">
      <Image
        source={require("../assets/logo svg.png")}
        resizeMode="contain"
        style={{ width: 220, height: 220 }}
      />
    </View>
  );
}

// ─── Capability grid — featured first row + 2-col pairs ───────────────────────

function CapabilityGrid() {
  const [featured, ...rest] = capabilities;

  // Pair remaining items into rows of two
  const pairs: Capability[][] = [];
  for (let i = 0; i < rest.length; i += 2) {
    pairs.push(rest.slice(i, i + 2));
  }

  return (
    <View style={styles.capabilityGrid}>
      {/* Featured card — full width, horizontal layout */}
      <View style={styles.capabilityCardFeatured}>
        <View style={styles.capabilityIcon}>
          <featured.Icon
            color={appTheme.colors.onPrimary}
            size={18}
            strokeWidth={2.2}
          />
        </View>
        <View style={styles.capabilityCardFeaturedBody}>
          <Text style={styles.capabilityTitle}>{featured.title}</Text>
          <Text style={styles.capabilityCopy}>{featured.copy}</Text>
        </View>
      </View>

      {/* Paired 2-col cards */}
      {pairs.map((pair, rowIdx) => (
        <View key={rowIdx} style={styles.capabilityRow}>
          {pair.map(({ Icon, title, copy }) => (
            <View key={title} style={styles.capabilityCard}>
              <View style={styles.capabilityIcon}>
                <Icon
                  color={appTheme.colors.onPrimary}
                  size={17}
                  strokeWidth={2.2}
                />
              </View>
              <Text style={styles.capabilityTitle}>{title}</Text>
              <Text style={styles.capabilityCopy}>{copy}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Aether panel ─────────────────────────────────────────────────────────────

function AetherPanel() {
  const contextTags = [
    "Steps",
    "Meals",
    "Sleep",
    "Hydration",
    "Workouts",
    "Recovery",
  ];

  return (
    <View style={styles.coachPanel}>
      {/* Header row — name + online status */}
      <View style={styles.coachPanelHeader}>
        <View style={styles.coachOrb}>
          <BrainCircuit
            color={appTheme.colors.primary}
            size={20}
            strokeWidth={2.2}
          />
        </View>
        <View style={styles.coachOrbMeta}>
          <Text style={styles.coachOrbName}>Aether</Text>
          <View style={styles.coachOrbStatus}>
            <View style={styles.coachOrbStatusDot} />
            <Text style={styles.coachOrbStatusText}>Your AI coach · Always on</Text>
          </View>
        </View>
      </View>

      {/* Body */}
      <View style={styles.coachPanelBody}>
        <Text style={styles.coachTitle}>
          Keeps the plan human, not just optimal.
        </Text>
        <Text style={styles.coachCopy}>
          Aether reads your recent logs before every check-in — so advice
          fits your actual week, not a template.
        </Text>

        {/* Context tags */}
        <View style={styles.coachTagRow}>
          {contextTags.map((tag) => (
            <View key={tag} style={styles.coachTag}>
              <Text style={styles.coachTagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [signupVerificationId, setSignupVerificationId] = useState<string>("");
  const [signupOtpSentTo, setSignupOtpSentTo] = useState<string>("");
  const [isSignup, setIsSignup] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);
  const { showAlert, hideAlert } = useAppAlert();
  const scrollRef = useRef<ScrollView>(null);
  const entrance = useRef(new Animated.Value(0)).current;

  // ─── Entrance animation ──────────────────────────────────────────────────

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const fadeSlideUp = (delay = 0) => ({
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [28, 0],
        }),
      },
    ],
  });

  // ─── Auth helpers (unchanged logic) ──────────────────────────────────────

  const resetSignupVerification = () => {
    setSignupVerificationId("");
    setSignupOtpSentTo("");
  };

  const handleChangeEmail = (value: string) => {
    setEmail(value);
    resetSignupVerification();
  };

  const handleVerifySignupOtp = async (
    otp: string,
    verificationId: string,
  ) => {
    const cleanedOtp = otp.trim();
    if (!/^\d{6}$/.test(cleanedOtp)) {
      throw new Error(
        "Please enter the 6-digit verification code from your email.",
      );
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

  const showSignupVerificationAlert = (
    targetEmail: string,
    verificationId: string,
  ) => {
    showAlert({
      title: "Verification required",
      dismissible: false,
      actions: [],
      content: (
        <OtpVerificationContent
          email={targetEmail}
          loading={authLoading}
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

    setAuthLoading(true);
    try {
      if (isSignup) {
        if (!signupVerificationId) {
          await sendSignupOtp();
          return;
        }
        showSignupVerificationAlert(
          signupOtpSentTo || email.trim(),
          signupVerificationId,
        );
      } else {
        const credential = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
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
      setAuthLoading(false);
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
    setAuthLoading(true);
    try {
      await sendSignupOtp();
    } catch (error) {
      const message = getUserFriendlyErrorMessage(
        error,
        "We couldn't send a new verification code right now.",
      );
      throw new Error(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (authLoading || googleLoading) {
      return;
    }

    try {
      setGoogleLoading(true);
      configureGoogleSignIn();
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signOut();
      const userInfo = await GoogleSignin.signIn();
      if (!userInfo.data?.idToken) return;
      const credential = GoogleAuthProvider.credential(userInfo.data.idToken);
      await signInWithCredential(auth, credential);
    } catch (error) {
      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
        if (error.code === statusCodes.IN_PROGRESS) {
          showAlert({
            title: "Google sign-in already running",
            message:
              "Please wait for the current sign-in request to finish.",
          });
          return;
        }
        if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          showAlert({
            title: "Google Play Services unavailable",
            message:
              "Google Play Services is not available on this device right now.",
          });
          return;
        }
      }
      const message = getUserFriendlyErrorMessage(
        error,
        "Google sign-in didn't complete. Please try again.",
      );
      showAlert({ title: "Google sign-in failed", message });
    } finally {
      setGoogleLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Hero ── */}
        <Animated.View style={[styles.heroSection, fadeSlideUp()]}>
          {/* Eyebrow */}
          <View style={styles.brandPill}>
            <View style={styles.brandPillDot} />
            <Text style={styles.brandPillText}>AdaptFit</Text>
            <View style={styles.brandPillDot} />
          </View>

          {/* Logo */}
          <HeroSystem />

          {/* Headline */}
          <Text style={styles.title}>
            Your day, built around{"\n"}what you actually did.
          </Text>
          <Text style={styles.subtitle}>
            Workouts, meals, sleep, steps, and an AI coach that reads all of it
            before it speaks.
          </Text>
        </Animated.View>

        {/* ── Capabilities ── */}
        <Animated.View style={[styles.storySection, fadeSlideUp()]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>What's inside</Text>
            <Text style={styles.sectionTitle}>
              Every part of your routine, in one place.
            </Text>
          </View>
          <CapabilityGrid />
        </Animated.View>

        {/* ── Aether panel ── */}
        <Animated.View style={{ opacity: entrance }}>
          <AetherPanel />
        </Animated.View>

        {/* ── Auth ── */}
        <Animated.View style={[styles.authSection, fadeSlideUp()]}>
          <Text style={styles.authEyebrow}>Get started</Text>
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
            googleDisabled={authLoading || googleLoading}
            authLoading={authLoading}
            googleLoading={googleLoading}
            signupOtpSentTo={signupOtpSentTo}
          />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}