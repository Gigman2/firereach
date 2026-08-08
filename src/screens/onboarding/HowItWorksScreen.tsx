import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import {
  MegaphoneIcon,
  MapTrifoldIcon,
  FirstAidKitIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { OnboardingDots } from "../../components/ui/OnboardingDots";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { completeOnboarding } from "../../lib/onboarding";
import * as onboarding from "./onboardingStyles";

type Props = NativeStackScreenProps<RootStackParamList, "HowItWorks">;

/**
 * Every line here describes something the app actually does. The previous
 * version promised three things it does not: that tapping alerts the fire
 * service with "no phone calls", that FireReach "sends them your exact
 * location", and that you can "track responders on their way to you". There
 * is no dispatch integration and no tracking — the app dials a phone number.
 *
 * Two of those were dangerous rather than merely wrong. A user who believes
 * no call is needed taps and waits for help nobody summoned. A user who
 * believes their location was already sent will not say it on the call, and
 * saying it is the single most useful thing they can do.
 *
 * The numbers are regional command lines, not per-station direct lines — 18
 * distinct numbers across 57 stations, none unique to one station. Nothing
 * here may call them "the station's number". See stations.bundled.NOTICE.md.
 */
const steps = [
  {
    Icon: MegaphoneIcon,
    title: "We find your nearest station",
    body: "FireReach works out which fire station is closest to you, and gives you the command line for its region.",
  },
  {
    Icon: MapTrifoldIcon,
    title: "You make the call",
    body: "Tap the button to dial, then say where you are. The operator covers the whole region and cannot see your location.",
  },
  {
    Icon: FirstAidKitIcon,
    title: "It works without internet",
    body: "Every station we know of is stored inside the app. If a line does not answer, 192 is always there and is free on any network.",
  },
];

export const HowItWorksScreen = ({ navigation }: Props) => {
  const { theme } = useTheme();

  return (
    <View style={[onboarding.screen, { backgroundColor: theme.background }]}>
      <View style={onboarding.fill}>
        <View style={onboarding.headerSplit}>
          {/*
          Back was reachable only by the Android hardware key before — there
          was no on-screen way to reread the intro.
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
            onPress={async () => {
              await completeOnboarding();
              // reset, not replace — see OnboardingIntroScreen.
              navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text
              variant="caption"
              weight="semiBold"
              color={theme.textSecondary}
            >
              Skip
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text variant="displayBold" align="center">
            How it works
          </Text>
          <Text
            variant="bodyMedium"
            color={theme.textSecondary}
            align="center"
            style={styles.subtitle}
          >
            Three simple steps between you and help.
          </Text>

          <View style={styles.steps}>
            {steps.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <View style={styles.stepIconContainer}>
                  <step.Icon
                    size={24}
                    color={colors.brandPrimary}
                    weight="fill"
                  />
                </View>
                <View style={styles.stepText}>
                  <Text variant="bodyMedium" weight="bold">
                    {step.title}
                  </Text>
                  <Text
                    variant="caption"
                    color={theme.textSecondary}
                    style={styles.stepBody}
                  >
                    {step.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={onboarding.actions}>
          <Button
            title="Next"
            onPress={() => navigation.navigate("LocationRequest")}
            rightIcon={<ArrowRightIcon size={20} color="#FFFFFF" />}
          />
        </View>
      </View>

      <View style={[onboarding.dotsRow, styles.dotsRow]}>
        <OnboardingDots total={5} step={2} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 40,
  },
  steps: {
    gap: 28,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  stepIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.brandPrimary}12`,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    flex: 1,
    paddingTop: 2,
  },
  stepBody: {
    marginTop: 4,
    lineHeight: 20,
  },
  dotsRow: {
    marginBottom: 32,
  },
});
