import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { ShieldCheckIcon, XIcon, ArrowLeftIcon } from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { OnboardingDots } from "../../components/ui/OnboardingDots";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { completeOnboarding } from "../../lib/onboarding";
import * as onboarding from "./onboardingStyles";

type Props = NativeStackScreenProps<RootStackParamList, "OnboardingReady">;

export const OnboardingReadyScreen = ({ navigation }: Props) => {
  const { theme, isDark } = useTheme();

  const handleGoToApp = async () => {
    await completeOnboarding();
    // reset, not replace. Now that the steps push instead of replacing, this
    // is the only exit that clears them: replace swaps just the focused route,
    // leaving up to four onboarding screens mounted under MainTabs. An
    // ordinary iOS edge-swipe from Home then re-revealed SavePlace, still
    // armed, and tapping Save again wrote a duplicate place after onboarding
    // had supposedly finished.
    navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
  };

  return (
    <View style={[onboarding.screen, { backgroundColor: theme.background }]}>
      <View style={onboarding.fill}>
        <View style={onboarding.headerSplit}>
          {/*
          Back matters here specifically because the step before it is
          skippable: skip saving a place, land on this screen, change your
          mind, and without this the only route back is Settings after
          onboarding has already finished.
        */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
          >
            <ArrowLeftIcon size={24} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleGoToApp}
            accessibilityRole="button"
            accessibilityLabel="Go to app"
            hitSlop={8}
          >
            <XIcon size={24} color={theme.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View
            style={[
              onboarding.iconCircle(96),
              styles.iconContainer,
              { backgroundColor: `${colors.brandPrimary}15` },
            ]}
          >
            <ShieldCheckIcon
              size={48}
              color={colors.brandPrimary}
              weight="duotone"
            />
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
            the app in an emergency and there is a number on screen ready to
            dial, with or without location and with or without internet.
          </Text>
        </View>

        <View style={onboarding.actions}>
          <Button title="Go to App" onPress={handleGoToApp} />
        </View>
      </View>

      <View style={onboarding.dotsRow}>
        <OnboardingDots total={5} step={5} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  iconContainer: {
    marginBottom: 32,
  },
  heading: {
    marginBottom: 16,
  },
  description: {
    marginBottom: 40,
    paddingHorizontal: 8,
  },
});
