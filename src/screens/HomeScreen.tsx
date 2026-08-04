import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GearSixIcon,
  PhoneIcon,
  MapPinIcon,
  ShieldCheckIcon,
  ListBulletsIcon,
  PencilSimpleIcon,
  WifiSlashIcon,
} from "phosphor-react-native";
import { Text } from "../components/ui/Text";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { useConnectivity } from "../hooks/useConnectivity";
import { useNearestStation } from "../hooks/useNearestStation";
import { NATIONAL_EMERGENCY_PHONE } from "../lib/stationTypes";

function formatDistance(meters: number): string {
  if (meters <= 0) return "Distance unavailable";
  const km = meters / 1000;
  return `~${km.toFixed(1)} km away`;
}

function shortName(name: string): string {
  // "Accra Central Fire Station" -> "Accra Central"
  return name.replace(/\s+Fire Station$/i, "").trim();
}

export const HomeScreen = () => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { isOnline } = useConnectivity();
  const { snapshot, refresh, isResolving } = useNearestStation();

  const station = snapshot?.station ?? null;

  const handleCall = () => {
    const phone = station?.phone ?? NATIONAL_EMERGENCY_PHONE;
    Linking.openURL(`tel:${phone}`).catch((err) =>
      console.warn("[HomeScreen] dial failed", err)
    );
  };

  const handleCallNational = () => {
    Linking.openURL(`tel:${NATIONAL_EMERGENCY_PHONE}`).catch((err) =>
      console.warn("[HomeScreen] dial failed", err)
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Status Bar */}
      <View
        style={[
          styles.statusBar,
          {
            paddingTop: insets.top + 12,
            borderBottomColor: theme.border,
            backgroundColor: theme.background,
          },
        ]}
      >
        <View style={styles.statusLeft}>
          <View
            style={[
              styles.onlineDot,
              {
                backgroundColor:
                  isOnline !== false ? colors.success : colors.warning,
              },
            ]}
          />
          <Text variant="label" color={theme.textSecondary}>
            {isOnline !== false ? "ONLINE · GPS ACTIVE" : "OFFLINE · LAST KNOWN"}
          </Text>
        </View>
        <TouchableOpacity>
          <GearSixIcon size={24} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isResolving}
            onRefresh={refresh}
            tintColor={colors.brandPrimary}
          />
        }
      >
        {/* Connectivity Alert */}
        {isOnline === false && (
          <View
            style={[
              styles.alert,
              {
                backgroundColor: theme.warningBg,
                borderColor: theme.warningBorder,
              },
            ]}
          >
            <WifiSlashIcon size={20} color={colors.warning} />
            <Text variant="caption" weight="medium" color={theme.warningText}>
              No internet — showing last known station
            </Text>
          </View>
        )}

        {/* Main Station Card */}
        <View
          style={[
            styles.stationCard,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <View
            style={[styles.mapContainer, { backgroundColor: theme.surface }]}
          >
            <View style={styles.mapPlaceholder}>
              <MapPinIcon size={32} color={colors.brandPrimary} weight="fill" />
            </View>
            <View style={styles.distanceBadge}>
              <Text variant="label" color="#FFFFFF">
                {station ? formatDistance(station.distanceMeters) : "Locating…"}
              </Text>
            </View>
          </View>
          <View style={styles.stationInfo}>
            <Text variant="heading2">
              {station?.name ?? "Finding nearest station…"}
            </Text>
            <Text
              variant="caption"
              weight="medium"
              color={theme.textSecondary}
              style={styles.stationRegion}
            >
              {station?.region ?? ""}
            </Text>
          </View>
        </View>

        {/* Primary Emergency CTA */}
        <TouchableOpacity
          style={styles.callButton}
          activeOpacity={0.85}
          onPress={handleCall}
        >
          <PhoneIcon size={28} color="#FFFFFF" weight="fill" />
          <Text variant="bodyLarge" weight="bold" color="#FFFFFF">
            {station ? `Call ${shortName(station.name)}` : "Call Emergency"}
          </Text>
        </TouchableOpacity>

        {/* Secondary national fallback — only when it isn't a duplicate of
            the primary action above. */}
        {station && station.phone !== NATIONAL_EMERGENCY_PHONE && (
          <TouchableOpacity
            style={styles.secondaryCallButton}
            activeOpacity={0.6}
            onPress={handleCallNational}
          >
            <Text variant="caption" weight="semiBold" color={theme.textSecondary}>
              Call 192 instead
            </Text>
          </TouchableOpacity>
        )}

        {/* Quick Actions Grid */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[
              styles.actionCard,
              { backgroundColor: theme.background, borderColor: theme.border },
            ]}
          >
            <View style={styles.actionIconContainer}>
              <ShieldCheckIcon
                size={24}
                color={colors.brandPrimary}
                weight="fill"
              />
            </View>
            <Text variant="caption" weight="bold">
              Safety Tips
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionCard,
              { backgroundColor: theme.background, borderColor: theme.border },
            ]}
          >
            <View style={styles.actionIconContainer}>
              <ListBulletsIcon size={24} color={colors.brandPrimary} />
            </View>
            <Text variant="caption" weight="bold">
              All Stations
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: 24 }]}
        activeOpacity={0.85}
      >
        <PencilSimpleIcon size={24} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
    paddingBottom: 100,
  },
  alert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stationCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  mapContainer: {
    height: 192,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${colors.brandPrimary}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  distanceBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  stationInfo: {
    padding: 16,
  },
  stationRegion: {
    marginTop: 4,
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    height: 72,
    backgroundColor: colors.brandPrimary,
    borderRadius: 16,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  secondaryCallButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  quickActions: {
    flexDirection: "row",
    gap: 16,
  },
  actionCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.brandPrimary}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
