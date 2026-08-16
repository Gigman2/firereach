import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  TextInput,
  Linking,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MagnifyingGlassIcon,
  MapPinIcon,
  PhoneIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import { typography } from "../../theme/typography";
import { useNearestStation } from "../../hooks/useNearestStation";
import { nearestStations } from "../../lib/geo";
import { NATIONAL_EMERGENCY_PHONE } from "../../lib/stationTypes";
import { formatDistance } from "../../lib/format";
import type { CachedStation } from "../../lib/stationTypes";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { StationsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<StationsStackParamList, "StationsList">;

/**
 * `distanceMeters` is null when there is no position to measure from. It is
 * deliberately not 0: rendering "0.0 km" for every station in the country
 * would be a fabricated number in the one screen that tells someone how far
 * away help is.
 */
type ListStation = CachedStation & { distanceMeters: number | null };

type Section = { title: string; data: ListStation[] };

export const StationsListScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const { table, positionSource, stationOrigin, rankFrom, isResolving, refresh } =
    useNearestStation();

  // Whatever the home screen ranked its answer from — a live fix, the one
  // saved place, or the remembered ranking position — and null when it could
  // rank from nothing at all.
  //
  // This used to be `positionSource === "implausible" ? null : position`,
  // which independently re-derived a rule the provider was already applying,
  // and could only ever say "usable" or "nothing". A fix that puts the caller
  // nowhere near Ghana still produces distances that are arithmetically true
  // and practically useless ("~11746.0 km" on every row) — the provider now
  // rejects it centrally, and offers a fallback in its place, so this screen
  // reads one value instead of reconstructing the decision and drifting from
  // it.
  const usablePosition = rankFrom;

  const sections = useMemo<Section[]>(() => {
    const stations = table.stations;

    // `nearestStations` treats a non-positive limit as "return nothing", so an
    // empty table must never reach it — an empty list would then look like a
    // ranking result rather than the absence of data. `readStationTable` never
    // returns an empty table today, and this guard keeps that a precondition
    // rather than a silent dependency.
    const ranked: ListStation[] =
      usablePosition && stations.length > 0
        ? nearestStations(
            stations,
            usablePosition.lat,
            usablePosition.lng,
            stations.length
          )
        : [...stations]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => ({ ...s, distanceMeters: null }));

    const byRegion = new Map<string, ListStation[]>();
    for (const station of ranked) {
      const list = byRegion.get(station.region);
      if (list) list.push(station);
      else byRegion.set(station.region, [station]);
    }

    // Rows inside a region keep `ranked`'s order — nearest first when a
    // position exists, alphabetical when one does not. Regions themselves are
    // ordered by their closest station, so the caller's own region is at the
    // top; with no position there is no meaningful proximity, so fall back to
    // alphabetical.
    return [...byRegion.entries()]
      .map(([title, data]) => ({ title, data }))
      .sort((a, b) =>
        usablePosition
          ? (a.data[0].distanceMeters ?? 0) - (b.data[0].distanceMeters ?? 0)
          : a.title.localeCompare(b.title)
      );
  }, [table, usablePosition]);

  const query = search.trim().toLowerCase();

  const filteredData = useMemo<Section[]>(() => {
    if (!query) return sections;
    return sections
      .map((section) => ({
        ...section,
        data: section.data.filter(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            s.district.toLowerCase().includes(query) ||
            s.region.toLowerCase().includes(query)
        ),
      }))
      .filter((section) => section.data.length > 0);
  }, [sections, query]);

  const dial = (_station: CachedStation) => {
    // Deliberately 192, not dialTargets()[0].
    //
    // Everywhere else the chain now leads with the chargeable regional line,
    // and every one of those surfaces renders the number beside a "may cost
    // airtime" tag. This control cannot: it is a bare phone icon in a dense
    // row with no space for a label and no number on screen. An unlabelled
    // one-tap dial has to be the number that always connects, or a caller with
    // no airtime taps it during a fire and nothing happens.
    //
    // Nothing is lost by not offering the regional line here — the row itself
    // opens the detail screen, which lists the full chain with cost tags.
    Linking.openURL(`tel:${NATIONAL_EMERGENCY_PHONE}`).catch((err) =>
      console.warn("[StationsList] dial failed", err)
    );
  };

  const renderStation = ({ item }: { item: ListStation }) => {
    const distanceLabel =
      item.distanceMeters !== null
        ? formatDistance(item.distanceMeters, { suffix: false })
        : null;

    return (
      <TouchableOpacity
        style={[styles.stationRow, { borderBottomColor: theme.divider }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate("StationDetail", { stationId: item.id })}
      >
        <View style={styles.stationIcon}>
          <MapPinIcon size={22} color={colors.brandPrimary} weight="fill" />
        </View>
        <View style={styles.stationInfo}>
          <Text variant="bodyMedium" weight="bold" numberOfLines={1}>
            {item.name}
          </Text>
          <Text
            variant="caption"
            color={theme.textSecondary}
            numberOfLines={1}
          >
            {`${item.district}, ${item.region}`}
          </Text>
        </View>
        <View style={styles.stationActions}>
          {distanceLabel && (
            <View style={[styles.distanceChip, { backgroundColor: theme.surface }]}>
              <Text variant="label" color={theme.textSecondary}>
                {distanceLabel}
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.callChip} onPress={() => dial(item)}>
            <PhoneIcon size={18} color="#FFFFFF" weight="fill" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({
    section,
  }: {
    section: { title: string };
  }) => (
    <View
      style={[
        styles.sectionHeader,
        { backgroundColor: theme.background, borderColor: theme.border },
      ]}
    >
      <Text variant="label" color={theme.textTertiary}>
        {section.title.toUpperCase()}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            borderBottomColor: theme.border,
            backgroundColor: theme.background,
          },
        ]}
      >
        <Text variant="heading2">Fire Stations</Text>
      </View>

      {/* Search */}
      <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
        <MagnifyingGlassIcon
          size={20}
          color={theme.textTertiary}
          style={styles.searchIcon}
        />
        <TextInput
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder="Search by name, district or region..."
          placeholderTextColor={theme.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* List */}
      <SectionList
        sections={filteredData}
        keyExtractor={(item) => item.id}
        renderItem={renderStation}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isResolving}
            onRefresh={refresh}
            tintColor={colors.brandPrimary}
          />
        }
        ListHeaderComponent={
          /*
           * A caveat for every ordering not built on a fix taken just now.
           * Each of these positions is usable — the rows keep their distance
           * chips and their ordering — but none of them is a present-tense
           * measurement, and a list reads as a survey of facts, so an
           * uncaveated one is more misleading here than on the home screen.
           */
          stationOrigin === "snapshot" ||
          positionSource === "lastKnownStale" ? (
            <Text
              variant="caption"
              color={theme.warningText}
              style={styles.noticeText}
            >
              Based on where your phone last had a location fix. If you have
              travelled, this ordering and these distances may be out of date.
            </Text>
          ) : usablePosition ? null : (
            <Text
              variant="caption"
              color={theme.textTertiary}
              style={styles.noticeText}
            >
              {positionSource === "implausible"
                ? "Your location does not appear to be in Ghana, so distances are not shown. Every station below is still listed and callable."
                : "Distances are unavailable without your location. Every station below is still listed and callable."}
            </Text>
          )
        }
        ListEmptyComponent={
          <Text
            variant="caption"
            color={theme.textTertiary}
            style={styles.noticeText}
          >
            {query
              ? `No station matches "${search.trim()}".`
              : "No stations available."}
          </Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    height: 48,
  },
  searchIcon: {
    marginLeft: 16,
  },
  searchInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 12,
    fontSize: 16,
    // TextInput does not go through the styled Text component.
    fontFamily: typography.fonts.regular,
  },
  listContent: {
    paddingBottom: 100,
  },
  noticeText: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  stationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stationIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: `${colors.brandPrimary}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  stationInfo: {
    flex: 1,
    gap: 2,
  },
  stationActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  distanceChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  callChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});
