import React, { useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleProp,
  Text,
  ViewStyle,
} from "react-native";
import { appTheme } from "../../theme/designSystem";
import { styles } from "./AppButton.styles";

type AppButtonProps = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  tone?: "default" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function AppButton({
  title,
  onPress,
  variant = "primary",
  tone = "default",
  disabled = false,
  loading = false,
  style,
}: AppButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const isPrimary = variant === "primary";
  const isDanger = tone === "danger";
  const isDisabled = disabled || loading;

  const animateScale = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      damping: 18,
      stiffness: 240,
      mass: 0.6,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.animatedWrap, { transform: [{ scale }] }, style]}>
      <Pressable
        disabled={isDisabled}
        onPress={onPress}
        onPressIn={() => animateScale(0.97)}
        onPressOut={() => animateScale(1)}
        style={[
          styles.base,
          isPrimary ? styles.primary : styles.secondary,
          !isPrimary && isDanger ? styles.secondaryDanger : null,
          isDisabled && styles.disabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            color={isPrimary ? appTheme.colors.card : appTheme.colors.primary}
          />
        ) : (
          <Text
            style={[
              styles.text,
              isPrimary ? styles.primaryText : styles.secondaryText,
              !isPrimary && isDanger ? styles.secondaryDangerText : null,
            ]}
          >
            {title}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
