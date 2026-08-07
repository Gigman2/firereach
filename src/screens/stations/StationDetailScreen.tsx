import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeftIcon,
  BuildingsIcon,
  CompassIcon,
  PhoneIcon,
  MapPinIcon,
  MapTrifoldIcon,
  ArrowRightIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import { readStationTable } from "../../lib/stationCache";
import { dialOrder, NATIONAL_EMERGENCY_PHONE } from "../../lib/stationTypes";
import type { CachedStation } from "../../lib/stationTypes";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { StationsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<StationsStackParamList, "StationDetail">;

function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

export const StationDetailScreen = ({ navigation, route }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { stationId } = route.params;

  const [station, setStation] = useState<CachedStation | null>(null);
  /** True only once the lookup has finished and found nothing. */
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Reads whatever table is on the device — network-refreshed or the one
      // bundled with the binary — so this screen is fully offline.
      const table = await readStationTable();
      if (cancelled) return;
      const found = table.stations.find((s) => s.id === stationId) ?? null;
      setStation(found);
      setMissing(!found);
    })();
    return () => {
      cancelled = true;
    };
  }, [stationId]);

  // Every number on this screen comes from the dial chain, never from a
  // literal. While the lookup is in flight there is no station and therefore
  // no chain, but the call button must never be dead — 192 always answers.
  const phones = station ? dialOrder(station) : [];
  const primaryPhone = phones[0] ?? NATIONAL_EMERGENCY_PHONE;

  const dial = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch((err) =>
      console.warn("[StationDetail] dial failed", err)
    );
  };

  const handleOpenMaps = () => {
    if (!station) return;
    Linking.openURL(
      `https://maps.google.com/?q=${station.lat},${station.lng}`
    ).catch((err) => console.warn("[StationDetail] open maps failed", err));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <ArrowLeftIcon size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text
            variant="heading2"
            color="#FFFFFF"
            style={styles.headerTitle}
            numberOfLines={1}
          >
            {station?.name ?? (missing ? "Station not found" : "")}
          </Text>
        </View>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text variant="label" color="#FFFFFF">
              {station?.region ?? ""}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {missing && (
          <View
            style={[
              styles.notice,
              {
                backgroundColor: theme.warningBg,
                borderColor: theme.warningBorder,
              },
            ]}
          >
            <Text variant="caption" weight="medium" color={theme.warningText}>
              This station is no longer in the list saved on your phone. You can
              still reach the fire service on {NATIONAL_EMERGENCY_PHONE}.
            </Text>
          </View>
        )}

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <View style={styles.infoRow}>
            <View style={styles.infoLabel}>
              <BuildingsIcon size={20} color={colors.brandPrimary} />
              <Text variant="caption" color={theme.textSecondary}>
                District
              </Text>
            </View>
            <Text variant="bodyMedium" weight="semiBold">
              {station?.district ?? ""}
            </Text>
          </View>

          <View style={[styles.infoDivider, { backgroundColor: theme.divider }]} />

          <View style={styles.infoRow}>
            <View style={styles.infoLabel}>
              <CompassIcon size={20} color={colors.brandPrimary} />
              <Text variant="caption" color={theme.textSecondary}>
                Region
              </Text>
            </View>
            <Text variant="bodyMedium" weight="semiBold">
              {station?.region ?? ""}
            </Text>
          </View>

          <View style={[styles.infoDivider, { backgroundColor: theme.divider }]} />

          <View style={styles.phoneSection}>
            <View style={styles.infoLabel}>
              <PhoneIcon size={20} color={colors.brandPrimary} />
              <Text
                variant="label"
                color={theme.textSecondary}
                style={{ letterSpacing: 1 }}
              >
                PHONE NUMBERS
              </Text>
            </View>
            {phones.map((phone) => (
              <TouchableOpacity key={phone} onPress={() => dial(phone)}>
                <Text
                  variant="bodyMedium"
                  weight="semiBold"
                  color={colors.brandPrimary}
                  style={styles.phoneNumber}
                >
                  {phone === NATIONAL_EMERGENCY_PHONE
                    ? `${phone} (national)`
                    : phone}
                </Text>
              </TouchableOpacity>
            ))}
            {/*
              The heading used to read "TRY IN THIS ORDER", which claimed the
              list predicts which number will answer. It does not. The
              ordering reproduces the publication order of a 2022 source page
              — one region's is deliberately inverted because that source's
              first number is disputed — and nothing in it is a measurement of
              whether a line is answered. The ordering is unchanged; only the
              claim made about it is.
            */}
            {phones.length > 0 && (
              <Text
                variant="caption"
                color={theme.textTertiary}
                style={styles.phoneCaption}
              >
                Regional command lines, recorded 2022. If one does not answer,
                try the next.
              </Text>
            )}
          </View>
        </View>

        {/* Map Preview */}
        <TouchableOpacity
          style={styles.mapSection}
          activeOpacity={0.8}
          onPress={handleOpenMaps}
          disabled={!station}
        >
          <View style={[styles.mapPreview, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MapPinIcon
              size={40}
              color={colors.brandPrimary}
              weight="fill"
            />
            {station && (
              <View style={styles.coordsBadge}>
                <Text
                  variant="label"
                  color="#FFFFFF"
                  style={{ fontFamily: "monospace" }}
                >
                  {formatCoords(station.lat, station.lng)}
                </Text>
              </View>
            )}
          </View>
          {station && (
            <View style={styles.mapLink}>
              <MapTrifoldIcon size={18} color={colors.brandPrimary} />
              <Text variant="caption" weight="semiBold" color={colors.brandPrimary}>
                Tap to open in Maps
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Call CTA */}
        <View style={styles.ctaSection}>
          <Button
            title={
              missing
                ? `Call ${NATIONAL_EMERGENCY_PHONE}`
                : "Call Station"
            }
            size="large"
            onPress={() => dial(primaryPhone)}
            leftIcon={<PhoneIcon size={24} color="#FFFFFF" weight="fill" />}
          />
        </View>

        {/* Report Link */}
        <TouchableOpacity
          style={styles.reportLink}
          disabled={!station}
          onPress={() => {
            if (!station) return;
            navigation.navigate("ReportStation", {
              stationId: station.id,
              stationName: station.name,
            });
          }}
        >
          <Text variant="caption" color={theme.textTertiary}>
            Something wrong with this info? Report it
          </Text>
          <ArrowRightIcon size={14} color={theme.textTertiary} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    paddingLeft: 40,
  },
  badge: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  notice: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  phoneSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  phoneNumber: {
    paddingLeft: 32,
  },
  phoneCaption: {
    paddingLeft: 32,
    paddingTop: 4,
  },
  mapSection: {
    gap: 8,
  },
  mapPreview: {
    height: 192,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coordsBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  mapLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaSection: {
    paddingVertical: 8,
  },
  reportLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 16,
  },
});
