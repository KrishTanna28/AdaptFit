import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import {
  Activity,
  Apple,
  BrainCircuit,
  Dumbbell,
  Mic,
  Moon,
  Lightbulb,
  TrendingUp,
} from "lucide-react-native";
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

import { appTheme } from "../theme/designSystem";
import { auth } from "../services/firebase";
import AuthForm from "../components/AuthForm";
import { getUserFriendlyErrorMessage, useAppAlert } from "../components/ui/AppAlert";
import { styles } from "./LoginScreen.styles";
import { configureGoogleSignIn } from "../services/googleSignin";

type Capability = {
  Icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  title: string;
  copy: string;
};

const capabilities: Capability[] = [
  {
    Icon: Dumbbell,
    title: "Workout planning",
    copy: "Ask Sarathi for a workout and load the plan into today's log.",
  },
  {
    Icon: Apple,
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
    copy: "Dictate a message to Sarathi and listen back to coach replies.",
  },
  {
    Icon: TrendingUp,
    title: "Steps trend",
    copy: "Track daily steps, step goals, calories burned, and history.",
  },
  {
    Icon: BrainCircuit,
    title: "Sarathi insight",
    copy: "Get coach check-ins from your latest logs and activity context.",
  },
];

const identitySignals = ["Steps", "Workouts", "Nutrition", "Recovery"];

function HeroSystem({
  breath,
}: {
  breath: Animated.Value;
}) {
  const pulseScale = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.055],
  });
  const floatY = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [8, -8],
  });
  const counterFloatY = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [-7, 7],
  });
  const rotate = breath.interpolate({
    inputRange: [0, 1],
    outputRange: ["-2deg", "2deg"],
  });

  return (
    <View style={styles.heroVisual} pointerEvents="none">
      <Animated.View
        style={[
          styles.heroHalo,
          {
            transform: [{ scale: pulseScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.visualCore,
          {
            transform: [{ translateY: floatY }, { rotate }],
          },
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 320 320">
          <Defs>
            <LinearGradient id="ring" x1="34" y1="26" x2="288" y2="292">
              <Stop offset="0" stopColor={appTheme.colors.accent} stopOpacity="0.9" />
              <Stop offset="0.46" stopColor={appTheme.colors.primary} stopOpacity="0.5" />
              <Stop offset="1" stopColor={appTheme.colors.success} stopOpacity="0.75" />
            </LinearGradient>
            <LinearGradient id="body" x1="96" y1="72" x2="230" y2="278">
              <Stop offset="0" stopColor={appTheme.colors.textPrimary} stopOpacity="0.95" />
              <Stop offset="1" stopColor={appTheme.colors.accentBlue} stopOpacity="0.78" />
            </LinearGradient>
          </Defs>
          <Circle
            cx="160"
            cy="160"
            r="122"
            stroke="url(#ring)"
            strokeWidth="2"
            fill="rgba(255,255,255,0.045)"
          />
          <Circle
            cx="160"
            cy="160"
            r="88"
            stroke={appTheme.colors.accentBlue}
            strokeOpacity="0.32"
            strokeWidth="1.5"
            fill="rgba(31,41,55,0.58)"
          />
          <Circle cx="160" cy="94" r="20" fill="url(#body)" />
          <Path
            d="M160 120 C143 145 129 178 111 219"
            stroke="url(#body)"
            strokeWidth="13"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M160 122 C183 148 204 173 231 190"
            stroke={appTheme.colors.accentBlue}
            strokeOpacity="0.86"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M144 172 C168 185 188 207 207 244"
            stroke={appTheme.colors.textPrimary}
            strokeOpacity="0.82"
            strokeWidth="11"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M132 154 C104 165 83 182 65 207"
            stroke={appTheme.colors.success}
            strokeOpacity="0.78"
            strokeWidth="9"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M71 246 C103 227 133 219 166 222 C195 225 221 217 249 195"
            stroke={appTheme.colors.accent}
            strokeOpacity="0.34"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M65 84 C98 67 136 59 174 65 C213 71 245 91 269 119"
            stroke={appTheme.colors.textPrimary}
            strokeOpacity="0.22"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[
          styles.orbitCard,
          styles.orbitCardLeft,
          { transform: [{ translateY: counterFloatY }] },
        ]}
      >
        <Activity color={appTheme.colors.accent} size={18} strokeWidth={2.2} />
        <Text style={styles.orbitLabel}>Steps</Text>
        <Text style={styles.orbitValue}>Trend</Text>
      </Animated.View>
      <Animated.View
        style={[
          styles.orbitCard,
          styles.orbitCardRight,
          { transform: [{ translateY: floatY }] },
        ]}
      >
        <Lightbulb color={appTheme.colors.primary} size={18} strokeWidth={2.2} />
        <Text style={styles.orbitLabel}>Sarathi</Text>
        <Text style={styles.orbitValue}>Coach</Text>
      </Animated.View>
    </View>
  );
}

export default function LoginScreen() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [isSignup, setIsSignup] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const { showAlert } = useAppAlert();
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

  const scrollToAuth = (signup: boolean) => {
    setIsSignup(signup);
    scrollRef.current?.scrollToEnd({ animated: true });
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
      <StatusBar style="light" />
      <View style={styles.backgroundLayer}>
        <View style={[styles.glow, styles.glowMint]} />
        <View style={[styles.glow, styles.glowBlue]} />
        <View style={[styles.glow, styles.glowViolet]} />
        <View style={styles.horizonLight} />
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Animated.View style={[styles.heroSection, heroReveal]}>
          <View style={styles.brandPill}>
            <BrainCircuit color={appTheme.colors.primary} size={16} strokeWidth={2.4} />
            <Text style={styles.brandPillText}>Aarogyam</Text>
          </View>

          <Text style={styles.title}>Start with Sarathi, then build the day around your logs.</Text>
          <Text style={styles.subtitle}>
            Your AI fitness companion brings workouts, steps, meals, hydration,
            sleep, weather, and form checks into one calm routine.
          </Text>

          <HeroSystem breath={breath} />

          <View style={styles.identityRow}>
            {identitySignals.map((signal) => (
              <View key={signal} style={styles.identityChip}>
                <Text style={styles.identityText}>{signal}</Text>
              </View>
            ))}
          </View>

          <View style={styles.ctaRow}>
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => scrollToAuth(true)}
              style={styles.primaryCta}
            >
              <Text style={styles.primaryCtaText}>Create your space</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.76}
              onPress={() => scrollToAuth(false)}
              style={styles.secondaryCta}
            >
              <Text style={styles.secondaryCtaText}>Sign in</Text>
            </TouchableOpacity>
          </View>
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
            <Lightbulb color={appTheme.colors.primary} size={22} strokeWidth={2.4} />
          </View>
          <Text style={styles.coachTitle}>Sarathi keeps the plan human.</Text>
          <Text style={styles.coachCopy}>
            Sarathi can use your recent steps, meals, workouts, hydration, and
            recovery logs to offer a focused check-in when you need direction.
          </Text>
        </View>

        <View style={styles.authSection}>
          <Text style={styles.authEyebrow}>Enter your wellness space</Text>
          <Text style={styles.authTitle}>
            {isSignup ? "Create your account and start logging." : "Return to your dashboard and coach."}
          </Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}
