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
  ArrowRightIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import { readStationTable } from "../../lib/stationCache";
import { dialTargets, NATIONAL_EMERGENCY_PHONE } from "../../lib/stationTypes";
import type { CachedStation } from "../../lib/stationTypes";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { StationsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<StationsStackParamList, "StationDetail">;

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
  const targets = station ? dialTargets(station) : [];
  const primaryPhone = targets[0]?.phone ?? NATIONAL_EMERGENCY_PHONE;

  const dial = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch((err) =>
      console.warn("[StationDetail] dial failed", err)
    );
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
            {targets.map((target) => (
              <TouchableOpacity
                key={target.phone}
                onPress={() => dial(target.phone)}
              >
                <Text
                  variant="bodyMedium"
                  weight="semiBold"
                  color={colors.brandPrimary}
                  style={styles.phoneNumber}
                >
                  {target.phone}
                  {target.tollFree
                    ? "  ·  free on any network"
                    : "  ·  may cost airtime"}
                </Text>
              </TouchableOpacity>
            ))}
            {/*
              The heading used to read "TRY IN THIS ORDER", which claimed the
              list predicts which number will answer. It does not. The
              ordering reproduces the publication order of a 2022 source page
              — one region's is deliberately inverted because that source's
              first number is disputed — and nothing in it is a measurement of
              whether a line is answered.

              Each number carries its own cost tag above, so this caption says
              only what the tags cannot: where the numbers came from. It no
              longer points at "the numbers below", which was wrong even
              before the regional lines moved ahead of 192.
            */}
            {/*
              Gated on a chargeable line actually being present, not on the
              chain being non-empty: the chain always contains 192, so
              targets.length > 0 would print a sentence about regional command
              lines above a list holding nothing but the free national number.
              No bundled station has zero hotlines, but a network refresh could
              produce one.
            */}
            {targets.some((t) => !t.tollFree) && (
              <Text
                variant="caption"
                color={theme.textTertiary}
                style={styles.phoneCaption}
              >
                These are regional command lines, not direct lines to this
                station — every station in the region shares them. They were
                recorded in 2022 and may be out of date. 192 reaches the
                national fire service on any network, with no credit.
              </Text>
            )}
          </View>
        </View>

        {/* Call CTA */}
        <View style={styles.ctaSection}>
          <Button
            title={`Call ${primaryPhone}`}
            size="large"
            onPress={() => dial(primaryPhone)}
            leftIcon={<PhoneIcon size={24} color="#FFFFFF" weight="fill" />}
          />
          {/*
            The button dialled free 192 until the chain was reordered; it now
            leads with a chargeable line, so it needs the same cost tag the
            home screen's button carries. Derived from tollFree rather than
            position, so it stays right if the ordering changes again.
          */}
          <Text
            variant="caption"
            color={theme.textTertiary}
            align="center"
            style={styles.ctaCaption}
          >
            {targets[0]?.tollFree ?? true
              ? "Free on any network — no credit needed"
              : "Regional command line — may cost airtime"}
          </Text>
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
  ctaSection: {
    paddingVertical: 8,
    gap: 8,
  },
  ctaCaption: {
    paddingHorizontal: 16,
  },
  reportLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 16,
  },
});
