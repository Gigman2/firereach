import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import {
  MegaphoneIcon,
  MapTrifoldIcon,
  FirstAidKitIcon,
  ArrowRightIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";

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
 */
const steps = [
  {
    Icon: MegaphoneIcon,
    title: "We find your nearest station",
    body: "FireReach works out which fire station is closest to you and puts its number on one big button.",
  },
  {
    Icon: MapTrifoldIcon,
    title: "You make the call",
    body: "Tap the button to dial. Tell them where you are — they cannot see your location, so describe it in your own words.",
  },
  {
    Icon: FirstAidKitIcon,
    title: "It works without internet",
    body: "Every station in Ghana is stored inside the app. If the line does not answer, 192 is always there and is free on any network.",
  },
];

export const HowItWorksScreen = ({ navigation }: Props) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.skipRow}>
        <TouchableOpacity onPress={() => navigation.replace("MainTabs")}>
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
                <step.Icon size={24} color={colors.brandPrimary} weight="fill" />
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

      <View style={styles.spacer} />

      <View style={styles.footer}>
        <View style={styles.dots}>
          <View style={styles.dotInactive} />
          <View style={styles.dotActive} />
          <View style={styles.dotInactive} />
          <View style={styles.dotInactive} />
        </View>

        <Button
          title="Next"
          onPress={() => navigation.navigate("LocationRequest")}
          rightIcon={<ArrowRightIcon size={20} color="#FFFFFF" />}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 8,
  },
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
  spacer: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 32,
    paddingBottom: 48,
    gap: 32,
    alignItems: "center",
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dotActive: {
    height: 8,
    width: 32,
    borderRadius: 4,
    backgroundColor: colors.brandPrimary,
  },
  dotInactive: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: `${colors.brandPrimary}33`,
  },
});
