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
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import {
  FireIcon,
  PaletteIcon,
  MapPinIcon,
  PhoneIcon,
  TrashIcon,
} from "phosphor-react-native";
import { Text } from "../components/ui/Text";
import { colors } from "../theme/colors";
import { useTheme, type ThemeMode } from "../theme/ThemeContext";
import appConfig from "../../app.json";

type LocationPermissionStatus = "granted" | "denied" | "undetermined";

const THEME_OPTIONS: ThemeMode[] = ["System", "Light", "Dark"];

export const SettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const { theme, themeMode, setThemeMode } = useTheme();
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
            await AsyncStorage.clear();
            Alert.alert("Done", "Cached data has been cleared.");
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

        {/* Emergency Reference */}
        <SectionHeader title="Emergency Reference" />
        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL("tel:192")}
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
                  National Emergency Dispatch
                </Text>
              </View>
            </View>
            <Text variant="heading2" color={colors.brandPrimary}>
              192
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
