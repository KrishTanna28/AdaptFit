import React from "react";
import { Image, StyleSheet, View } from "react-native";

import { appTheme } from "../../theme/designSystem";

export default function LogoSplash() {
  return (
    <View style={styles.root}>
      <Image
        source={require("../../assets/logo svg.png")}
        resizeMode="contain"
        style={styles.logo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: appTheme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 220,
    height: 220,
  },
});
