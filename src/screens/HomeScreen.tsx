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
  ShieldCheckIcon,
  ListBulletsIcon,
  WifiSlashIcon,
} from "phosphor-react-native";
import { Text } from "../components/ui/Text";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { useConnectivity } from "../hooks/useConnectivity";
import { useNearestStation } from "../hooks/useNearestStation";
import { dialTargets, NATIONAL_EMERGENCY_PHONE } from "../lib/stationTypes";
import { formatDistance } from "../lib/format";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { MainTabParamList } from "../navigation/types";

type Props = BottomTabScreenProps<MainTabParamList, "Home">;

export const HomeScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { isOnline } = useConnectivity();
  const { nearest, table, positionSource, refresh, isResolving } =
    useNearestStation();

  const targets = nearest
    ? dialTargets(nearest)
    : [{ phone: NATIONAL_EMERGENCY_PHONE, tollFree: true }];
  const primary = targets[0];
  const alternates = targets.slice(1);

  // Derived from the tollFree flag rather than the array position, so this
  // stays correct even if dialTargets' shape ever changes — the detail
  // screen already derives its cost labels the same way. Since the station's
  // own hotline now leads, the toll-free branch is what a caller sees only
  // when no station resolved and 192 is all there is.
  const primaryCostCaption = primary.tollFree
    ? "Free on any network — no credit needed"
    : "Your nearest station — may cost airtime";

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
    ? "Can't place your location in Ghana"
    : "Turn on location to find your station";

  /**
   * A second line for the no-station states, shown under the heading. The
   * heading says what happened; this says what to do about it. Empty when a
   * station is showing, since the district/region line takes that slot.
   */
  const noStationHelp = isFinding
    ? ""
    : positionSource === "implausible"
    ? "Your phone reports a position outside the country. Call 192 and tell them where you are."
    : positionSource === "denied"
    ? "Without location we cannot pick a station, but 192 is free to dial on any network."
    : "";

  /**
   * A `lastKnownStale` fix is an unbounded-age last-known position, so the
   * distance computed from it is exact arithmetic on a possibly-old input.
   * It is qualified rather than hidden: the number is still the best estimate
   * available and is worth having, but it must not read as a live measurement.
   * Once a resolution has finished with no fix at all, this stops saying
   * "Locating…" — that badge contradicted a pill already reporting failure.
   */
  const rawDistance = nearest ? formatDistance(nearest.distanceMeters) : null;
  const distanceLabel =
    rawDistance && positionSource === "lastKnownStale"
      ? `${rawDistance} (from your last known location)`
      : rawDistance;

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
        <TouchableOpacity
          onPress={() => navigation.navigate("Settings")}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
        >
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
          <View style={styles.stationInfo}>
            <Text variant="heading2">{nearest?.name ?? noStationHeading}</Text>

            {nearest ? (
              <Text
                variant="caption"
                weight="medium"
                color={theme.textSecondary}
                style={styles.stationRegion}
              >
                {`${nearest.district}, ${nearest.region}`}
              </Text>
            ) : noStationHelp ? (
              <Text
                variant="caption"
                weight="medium"
                color={theme.textSecondary}
                style={styles.stationRegion}
              >
                {noStationHelp}
              </Text>
            ) : null}

            {distanceLabel && (
              <Text
                variant="caption"
                color={theme.textSecondary}
                style={styles.stationRegion}
              >
                {distanceLabel}
              </Text>
            )}
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
          onPress={() => dial(primary.phone)}
        >
          <PhoneIcon size={28} color="#FFFFFF" weight="fill" />
          <View style={styles.callButtonTextGroup}>
            <Text variant="bodyLarge" weight="bold" color="#FFFFFF">
              Call {primary.phone}
            </Text>
            <Text variant="caption" color="#FFFFFF">
              {primaryCostCaption}
            </Text>
          </View>
        </TouchableOpacity>

        {alternates.length > 0 && (
          <View style={styles.alternatesRow}>
            {/*
              Not "If no answer:" — that implied the chain is ordered by which
              number is most likely to be picked up. It is not: the ordering
              comes from the publication order of a 2022 web page, with one
              region deliberately inverted. These are simply the other numbers
              on record.

              The cost tag is per-number rather than a group label. Now that
              the station's hotline leads, this list mixes a chargeable second
              hotline with toll-free 192, so no single heading is true of all
              of it.
            */}
            <Text variant="caption" color={theme.textTertiary}>
              Other numbers:
            </Text>
            {alternates.map((target) => (
              <TouchableOpacity
                key={target.phone}
                activeOpacity={0.6}
                onPress={() => dial(target.phone)}
              >
                <Text
                  variant="caption"
                  weight="semiBold"
                  color={colors.brandPrimary}
                >
                  {target.phone}
                  <Text variant="caption" color={theme.textTertiary}>
                    {target.tollFree
                      ? "  ·  free on any network"
                      : "  ·  may cost airtime"}
                  </Text>
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

        {/*
          Absorbs the slack when the card is short — which is exactly the
          states with the least to say, such as a rejected position. Without
          it the quick actions float mid-screen above a large void. When the
          content is tall enough to fill the viewport this collapses to zero
          and everything scrolls normally.
        */}
        <View style={styles.spacer} />

        {/* Quick Actions Grid */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[
              styles.actionCard,
              { backgroundColor: theme.background, borderColor: theme.border },
            ]}
            onPress={() => navigation.navigate("Guides")}
            accessibilityRole="button"
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
            onPress={() => navigation.navigate("Stations")}
            accessibilityRole="button"
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
    // flexGrow lets the content stretch to the viewport so `spacer` has room
    // to push the quick actions down; it still scrolls once content exceeds it.
    // paddingBottom was 100 to clear a floating action button that no longer
    // exists — the tab bar reserves its own space, so this only needs breathing
    // room.
    flexGrow: 1,
    paddingBottom: 24,
  },
  spacer: {
    flex: 1,
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
    minHeight: 72,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.brandPrimary,
    borderRadius: 16,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  callButtonTextGroup: {
    alignItems: "center",
    flexShrink: 1,
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
});
