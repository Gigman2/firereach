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
import { dialOrder, NATIONAL_EMERGENCY_PHONE } from "../lib/stationTypes";

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
  const { nearest, table, positionSource, refresh, isResolving } =
    useNearestStation();

  const numbers = nearest ? dialOrder(nearest) : [NATIONAL_EMERGENCY_PHONE];
  const primaryNumber = numbers[0];
  const alternates = numbers.slice(1);

  const dial = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch((err) =>
      console.warn("[HomeScreen] dial failed", err)
    );
  };

  /**
   * A resolution is in flight and there is nothing to show yet. This is a
   * distinct state from every failure below, and it has to be said out loud:
   * the first resolution can take up to 15 seconds, and telling a user whose
   * location is already switched on to "turn on location" for that whole
   * time — as this screen used to, because a not-yet-resolved position was
   * indistinguishable from a refused one — is both wrong and unactionable.
   */
  const isFinding = isResolving && !nearest;

  const statusLabel = isFinding
    ? "FINDING YOUR LOCATION"
    : positionSource === "denied"
    ? "LOCATION OFF"
    : positionSource === "unavailable"
    ? "NO LOCATION FIX"
    : positionSource === "implausible"
    ? "LOCATION OUTSIDE GHANA"
    : positionSource === "lastKnownStale"
    ? "USING LAST KNOWN LOCATION"
    : isOnline !== false
    ? "ONLINE · GPS ACTIVE"
    : "OFFLINE · SAVED LIST";

  const statusColor = isFinding
    ? theme.textTertiary
    : positionSource === "denied" ||
      positionSource === "unavailable" ||
      positionSource === "implausible" ||
      positionSource === "lastKnownStale"
    ? colors.warning
    : isOnline !== false
    ? colors.success
    : colors.warning;

  /**
   * Only reached when there is no station to name. Ordered so the honest
   * answer to "why is there no station?" comes first: still looking, then
   * refused, then permitted-but-no-fix, then a fix that is nowhere near
   * Ghana. The last branch is unreachable while the station table is
   * non-empty (a cache invariant), and is kept as a safe default.
   */
  const noStationHeading = isFinding
    ? "Finding nearest station…"
    : positionSource === "denied"
    ? "Turn on location to find your station"
    : positionSource === "unavailable"
    ? "Can't get a location fix — showing the national number"
    : positionSource === "implausible"
    ? "No station near your location"
    : "Turn on location to find your station";

  /**
   * A `lastKnownStale` fix is an unbounded-age last-known position, so the
   * distance computed from it is exact arithmetic on a possibly-old input.
   * It is qualified rather than hidden: the number is still the best estimate
   * available and is worth having, but it must not read as a live measurement.
   * Once a resolution has finished with no fix at all, this stops saying
   * "Locating…" — that badge contradicted a pill already reporting failure.
   */
  const distanceLabel = nearest
    ? positionSource === "lastKnownStale"
      ? `${formatDistance(nearest.distanceMeters)} (from your last known location)`
      : formatDistance(nearest.distanceMeters)
    : isFinding
    ? "Locating…"
    : "Distance unavailable";

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
            style={[styles.onlineDot, { backgroundColor: statusColor }]}
          />
          <Text variant="label" color={theme.textSecondary}>
            {statusLabel}
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
              No internet — using the saved station list
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
                {distanceLabel}
              </Text>
            </View>
          </View>
          <View style={styles.stationInfo}>
            <Text variant="heading2">{nearest?.name ?? noStationHeading}</Text>
            <Text
              variant="caption"
              weight="medium"
              color={theme.textSecondary}
              style={styles.stationRegion}
            >
              {nearest ? `${nearest.district}, ${nearest.region}` : ""}
            </Text>
          </View>
        </View>

        {positionSource === "lastKnownStale" && (
          <Text
            variant="caption"
            color={theme.textTertiary}
            style={styles.freshness}
          >
            Based on where your phone last had a location fix — if you have
            travelled, check the station name and distance before calling.
          </Text>
        )}

        {/* Primary Emergency CTA */}
        <TouchableOpacity
          style={styles.callButton}
          activeOpacity={0.85}
          onPress={() => dial(primaryNumber)}
        >
          <PhoneIcon size={28} color="#FFFFFF" weight="fill" />
          <Text variant="bodyLarge" weight="bold" color="#FFFFFF">
            {nearest ? `Call ${shortName(nearest.name)}` : "Call Emergency"}
          </Text>
        </TouchableOpacity>

        {alternates.length > 0 && (
          <View style={styles.alternatesRow}>
            {/*
              Not "If no answer:" — that implied the chain is ordered by which
              number is most likely to be picked up. It is not: the ordering
              comes from the publication order of a 2022 web page, with one
              region deliberately inverted. These are simply the other numbers
              on record for this station.
            */}
            <Text variant="caption" color={theme.textTertiary}>
              Other numbers:
            </Text>
            {alternates.map((phone) => (
              <TouchableOpacity
                key={phone}
                activeOpacity={0.6}
                onPress={() => dial(phone)}
              >
                <Text
                  variant="caption"
                  weight="semiBold"
                  color={colors.brandPrimary}
                >
                  {phone === NATIONAL_EMERGENCY_PHONE ? "192 (national)" : phone}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text
          variant="caption"
          color={theme.textTertiary}
          style={styles.freshness}
        >
          {table.source === "bundled"
            ? "Using the station list built into the app"
            : `Station list updated ${new Date(
                table.refreshedAt as string
              ).toLocaleDateString()}`}
        </Text>

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
    // Bounded so the qualified stale-position label wraps inside the badge
    // instead of stretching across the card.
    maxWidth: "70%",
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
  alternatesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 12,
    marginTop: -8,
  },
  freshness: {
    textAlign: "center",
    marginTop: -8,
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
