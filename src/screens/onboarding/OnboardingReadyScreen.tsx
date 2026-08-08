import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { ShieldCheckIcon, XIcon } from "phosphor-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";

const ONBOARDING_COMPLETE_KEY = "@firereach_onboarding_complete";

type Props = NativeStackScreenProps<RootStackParamList, "OnboardingReady">;

export const OnboardingReadyScreen = ({ navigation }: Props) => {
  const { theme, isDark } = useTheme();

  const handleGoToApp = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    navigation.replace("MainTabs");
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoToApp}>
          <XIcon size={24} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: isDark ? "#0D2818" : "#D1FAE5" }]}>
          <ShieldCheckIcon size={48} color={colors.success} weight="fill" />
        </View>

        <Text variant="displayBold" align="center" style={styles.heading}>
          You're ready.
        </Text>

        <Text
          variant="bodyMedium"
          color={theme.textSecondary}
          align="center"
          style={styles.description}
        >
          {/*
            Was: "Your account is set up... Follow the tips below." There is no
            account — the product scope requires that none is ever needed — and
            there were no tips below.
          */}
          FireReach is ready to use. There is no account and no sign-up. Open
          the app in an emergency and the nearest station's number is already
          on screen.
        </Text>
      </View>

      <View style={styles.spacer} />

      <View style={styles.footer}>
        <View style={styles.dots}>
          <View style={styles.dotInactive} />
          <View style={styles.dotInactive} />
          <View style={styles.dotInactive} />
          <View style={styles.dotActive} />
        </View>

        <Button title="Go to App" onPress={handleGoToApp} />

        <TouchableOpacity style={styles.tutorialsButton}>
          <Text
            variant="caption"
            weight="medium"
            color={theme.textSecondary}
            align="center"
          >
            View Tutorials
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 8,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  heading: {
    marginBottom: 16,
  },
  description: {
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  spacer: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 24,
    alignItems: "center",
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dotActive: {
    height: 8,
    width: 24,
    borderRadius: 4,
    backgroundColor: colors.brandPrimary,
  },
  dotInactive: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: `${colors.brandPrimary}33`,
  },
  tutorialsButton: {
    paddingVertical: 8,
  },
});
