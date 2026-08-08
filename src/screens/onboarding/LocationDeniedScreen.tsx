import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
} from "react-native";
import {
  GpsSlashIcon,
  WarningIcon,
  ArrowLeftIcon,
  ArrowSquareOutIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { OnboardingDots } from "../../components/ui/OnboardingDots";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import * as onboarding from "./onboardingStyles";

type Props = NativeStackScreenProps<RootStackParamList, "LocationDenied">;

export const LocationDeniedScreen = ({ navigation }: Props) => {
  const { theme } = useTheme();

  const handleOpenSettings = () => {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:");
    } else {
      Linking.openSettings();
    }
  };

  return (
    <View style={[onboarding.screen, { backgroundColor: theme.background }]}>
      <View style={onboarding.fill}>
        <View style={onboarding.header}>
          {/*
          Now genuinely returns to LocationRequest — it used to land on
          HowItWorks because that screen replaced itself on the way here.
        */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
          >
            <ArrowLeftIcon size={24} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={[onboarding.iconCircle(192), styles.iconContainer]}>
            <GpsSlashIcon size={80} color={colors.warning} weight="regular" />
          </View>

          <Text variant="heading1" align="center" style={styles.heading}>
            Location access denied.
          </Text>

          <View style={styles.warningBanner}>
            <View style={styles.warningHeader}>
              <WarningIcon size={20} color={colors.warning} weight="fill" />
              <Text variant="bodyMedium" weight="bold">
                Enable Location
              </Text>
            </View>
            <Text
              variant="caption"
              color={theme.textSecondary}
              style={styles.warningBody}
            >
              Without location we cannot pick the station nearest you, so the
              app will offer 192 instead. You can still browse every station and
              its numbers from the Stations tab. To get the nearest one
              automatically, enable location in your device settings.
            </Text>
            <TouchableOpacity
              onPress={handleOpenSettings}
              style={styles.settingsLink}
            >
              <Text variant="caption" weight="bold" color={colors.warning}>
                Open Settings
              </Text>
              <ArrowSquareOutIcon
                size={14}
                color={colors.warning}
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={onboarding.actions}>
          <Button
            title="Continue anyway"
            variant="secondary"
            onPress={() => navigation.navigate("OnboardingReady")}
            style={[styles.continueButton, { borderColor: theme.border }]}
          />
        </View>
      </View>

      <View style={onboarding.dotsRow}>
        <OnboardingDots total={5} step={3} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
  },
  iconContainer: {
    backgroundColor: `${colors.warning}15`,
    alignSelf: "center",
    marginVertical: 40,
  },
  heading: {
    marginBottom: 24,
  },
  warningBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${colors.warning}4D`,
    backgroundColor: `${colors.warning}0D`,
    padding: 20,
    gap: 12,
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  warningBody: {
    lineHeight: 20,
  },
  settingsLink: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  continueButton: {
    borderWidth: 2,
  },
});
