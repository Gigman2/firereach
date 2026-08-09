import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  AppState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import {
  FireIcon,
  PaletteIcon,
  MapPinIcon,
  PhoneIcon,
  TrashIcon,
  CaretRightIcon,
  ArrowCounterClockwiseIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { colors } from "../../theme/colors";
import { useTheme, type ThemeMode } from "../../theme/ThemeContext";
import { clearStationCache } from "../../lib/stationCache";
import { resetAllAppData } from "../../lib/devReset";
import { NATIONAL_EMERGENCY_PHONE } from "../../lib/stationTypes";
import { useSavedPlaces } from "../../hooks/useSavedPlaces";
import appConfig from "../../../app.json";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SettingsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<SettingsStackParamList, "SettingsHome">;

type LocationPermissionStatus = "granted" | "denied" | "undetermined";

const THEME_OPTIONS: ThemeMode[] = ["System", "Light", "Dark"];

export const SettingsHomeScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme, themeMode, setThemeMode } = useTheme();
  const { places } = useSavedPlaces();
  const [locationStatus, setLocationStatus] =
    useState<LocationPermissionStatus>("undetermined");

  const refreshLocationStatus = useCallback(async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    setLocationStatus(status as LocationPermissionStatus);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshLocationStatus();
    }, [refreshLocationStatus])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshLocationStatus();
    });
    return () => sub.remove();
  }, [refreshLocationStatus]);

  const handleLocationPress = async () => {
    if (locationStatus === "undetermined") {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationStatus(status as LocationPermissionStatus);
      return;
    }
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(
        "Can't open Settings",
        "Open your device Settings manually and change FireReach's Location permission."
      );
    }
  };

  const locationBadge =
    locationStatus === "granted"
      ? {
          label: "ACTIVE",
          bg: theme.successBadgeBg,
          color: theme.successBadgeText,
        }
      : locationStatus === "denied"
      ? { label: "DENIED", bg: theme.emergencyBg, color: theme.emergencyText }
      : { label: "NOT SET", bg: theme.warningBg, color: theme.warningText };

  const handleClearCache = () => {
    Alert.alert(
      "Clear Cached Data",
      "This will remove all locally cached station data and guides. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearStationCache();
            Alert.alert(
              "Done",
              "Cached station data cleared. The app will use its built-in station list until it can refresh."
            );
          },
        },
      ]
    );
  };

  const handleResetAllData = () => {
    Alert.alert(
      "Reset all app data",
      "Deletes your saved places, theme and cached stations, then starts the app again at onboarding. Development builds only.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              // No success alert: this remounts the app, so the confirmation
              // is landing back on the first onboarding screen. An alert
              // would be queued against a screen that no longer exists.
              await resetAllAppData();
            } catch (err) {
              console.warn("[Settings] reset failed", err);
              Alert.alert(
                "Reset failed",
                "Storage could not be cleared. Reinstall the app to start over."
              );
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 16,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Text variant="displayBold">Settings</Text>
        <View style={[styles.headerIcon, { backgroundColor: `${colors.brandPrimary}15` }]}>
          <FireIcon size={24} color={colors.brandPrimary} weight="fill" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Appearance */}
        <SectionHeader title="Appearance" />
        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <PaletteIcon size={22} color={theme.textTertiary} />
              <Text variant="bodyMedium" weight="medium">
                Theme
              </Text>
            </View>
            <View style={[styles.segmentedControl, { backgroundColor: theme.surface }]}>
              {THEME_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.segment,
                    themeMode === opt && [
                      styles.segmentActive,
                      { backgroundColor: theme.background },
                    ],
                  ]}
                  onPress={() => setThemeMode(opt)}
                >
                  <Text
                    variant="label"
                    weight={themeMode === opt ? "bold" : "medium"}
                    color={
                      themeMode === opt
                        ? theme.textPrimary
                        : theme.textTertiary
                    }
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Permissions */}
        <SectionHeader title="Permissions" />
        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <TouchableOpacity style={styles.row} onPress={handleLocationPress}>
            <View style={styles.rowLeft}>
              <MapPinIcon size={22} color={theme.textTertiary} />
              <Text variant="bodyMedium" weight="medium">
                Location Access
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: locationBadge.bg }]}>
              <Text variant="label" color={locationBadge.color}>
                {locationBadge.label}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* What to say */}
        <SectionHeader title="What to say" />
        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate("SavedPlaces")}
          >
            <View style={styles.rowLeft}>
              <MapPinIcon size={22} color={theme.textTertiary} />
              <Text variant="bodyMedium" weight="medium">
                Your places
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Text variant="caption" color={theme.textTertiary}>
                {places.length}
              </Text>
              <CaretRightIcon size={18} color={theme.textTertiary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Emergency Reference */}
        <SectionHeader title="Emergency Reference" />
        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() =>
              Linking.openURL(`tel:${NATIONAL_EMERGENCY_PHONE}`).catch((err) =>
                console.warn("[Settings] dial failed", err)
              )
            }
          >
            <View style={styles.rowLeft}>
              <PhoneIcon
                size={22}
                color={colors.brandPrimary}
                weight="fill"
              />
              <View>
                <Text variant="bodyMedium" weight="medium">
                  Ghana Fire Service
                </Text>
                <Text variant="label" color={theme.textTertiary}>
                  Ghana National Fire Service
                </Text>
              </View>
            </View>
            <Text variant="heading2" color={colors.brandPrimary}>
              {NATIONAL_EMERGENCY_PHONE}
            </Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <SectionHeader title="About" />
        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <View style={styles.row}>
            <Text variant="bodyMedium" weight="medium">
              Version
            </Text>
            <Text variant="caption" color={theme.textTertiary}>
              {appConfig.expo.version}
            </Text>
          </View>
        </View>

        {/* Data */}
        <SectionHeader title="Data" />
        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <TouchableOpacity style={styles.row} onPress={handleClearCache}>
            <View style={styles.rowLeft}>
              <TrashIcon size={22} color={colors.brandPrimary} />
              <Text
                variant="bodyMedium"
                weight="medium"
                color={colors.brandPrimary}
              >
                Clear cached data
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/*
          Development only — stripped from release builds, where the nearest
          equivalent is Android's "Clear storage" or deleting the app on iOS.
        */}
        {__DEV__ && (
          <>
            <SectionHeader title="Developer" />
            <View
              style={[
                styles.card,
                { backgroundColor: theme.background, borderColor: theme.border },
              ]}
            >
              <TouchableOpacity style={styles.row} onPress={handleResetAllData}>
                <View style={styles.rowLeft}>
                  <ArrowCounterClockwiseIcon
                    size={22}
                    color={colors.brandPrimary}
                  />
                  <View style={styles.rowLabel}>
                    <Text
                      variant="bodyMedium"
                      weight="medium"
                      color={colors.brandPrimary}
                    >
                      Reset all app data
                    </Text>
                    <Text variant="label" color={theme.textTertiary}>
                      Wipes storage and restarts onboarding
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const SectionHeader = ({ title }: { title: string }) => (
  <Text
    variant="label"
    color={colors.brandPrimary}
    style={sectionStyles.sectionTitle}
  >
    {title.toUpperCase()}
  </Text>
);

const sectionStyles = StyleSheet.create({
  sectionTitle: {
    paddingHorizontal: 16,
    marginTop: 28,
    marginBottom: 8,
    letterSpacing: 1,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    minHeight: 56,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  /** Lets a two-line label wrap inside the row instead of overflowing it. */
  rowLabel: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  segmentedControl: {
    flexDirection: "row",
    borderRadius: 8,
    padding: 3,
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  segmentActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
});
