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
      console.warn("[StationDetail] dial failed", err),
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
          {/*
            Two lines. "University Fire Station, Legon" truncated to
            "University Fire Station …" on one, which is the half that
            distinguishes it from every other station in the region.
          */}
          <Text
            variant="heading2"
            color="#FFFFFF"
            style={styles.headerTitle}
            numberOfLines={2}
          >
            {station?.name ?? (missing ? "Station not found" : "")}
          </Text>
        </View>

        {/*
          District and region belong here, under the name, not in the card
          below. They said the same thing twice — the region was in a badge up
          here AND in a row down there — and the district row was a
          `space-between` with an unflexed value, so a name as long as
          "Ayawaso West Municipal District" ran straight into its own label and
          was clipped at the card edge. As a subtitle it simply wraps.
        */}
        {station ? (
          <Text
            variant="caption"
            color="rgba(255,255,255,0.85)"
            style={styles.headerSubtitle}
          >
            {`${station.district} · ${station.region}`}
          </Text>
        ) : null}
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

        {/* Numbers */}
        <View style={styles.phoneSection}>
          <Text
            variant="label"
            color={theme.textTertiary}
            style={styles.sectionLabel}
          >
            PHONE NUMBERS
          </Text>

          {/*
            Rows that read as things you tap, matching the home screen. These
            dial; they were a stack of coloured text about 24 px tall, which
            is neither an affordance nor a target.
          */}
          {targets.map((target, i) => (
            <TouchableOpacity
              key={target.phone}
              activeOpacity={0.6}
              onPress={() => dial(target.phone)}
              accessibilityRole="button"
              accessibilityLabel={
                target.tollFree
                  ? `Call ${target.phone}, works with no credit`
                  : `Call ${target.phone}`
              }
              style={[
                styles.phoneRow,
                i > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.divider,
                },
              ]}
            >
              <PhoneIcon size={16} color={colors.brandPrimary} weight="fill" />
              <Text
                variant="bodyMedium"
                weight="semiBold"
                color={colors.brandPrimary}
                style={styles.phoneNumber}
              >
                {target.phone}
              </Text>
              {/*
                Only 192, and about reach rather than price — the same rule
                the home screen follows. What it costs is not a question
                anyone asks mid-emergency; which number still works when the
                chargeable one will not connect is.
              */}
              {target.tollFree ? (
                <Text variant="label" color={colors.success}>
                  Works with no credit
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}

          {/*
            Where the numbers came from, which is the one thing the rows
            cannot say for themselves — and it matters, because a caller who
            believes this is the station's own line will not understand why
            whoever answers does not know where they are.

            Gated on a chargeable line actually being present, not on the
            chain being non-empty: the chain always contains 192, so
            targets.length > 0 would print a sentence about regional command
            lines above a list holding nothing but the free national number.
            No bundled station has zero hotlines, but a network refresh could
            produce one.

            Cut from five lines to two. It previously closed by explaining
            that 192 is free on any network with no credit, which the row for
            192 now says itself, and opened by saying twice over that the
            lines are shared.
          */}
          {targets.some((t) => !t.tollFree) && (
            <View style={styles.phoneCaption}>
              <Text variant="caption" color={theme.textTertiary}>
                This is the direct line to this station.
              </Text>
              <Text variant="caption" color={theme.textTertiary}>
                Last updated on 21st June 2026.
              </Text>
            </View>
          )}
        </View>

        {/* Call CTA */}
        <View style={styles.ctaSection}>
          <Button
            title={`Call ${primaryPhone}`}
            size="large"
            onPress={() => dial(primaryPhone)}
            leftIcon={<PhoneIcon size={24} color="#FFFFFF" weight="fill" />}
          />

          <Text
            variant="caption"
            color={theme.textTertiary}
            align="center"
            style={styles.ctaCaption}
          >
            {(targets[0]?.tollFree ?? true)
              ? "Reaches the national fire service"
              : null}
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
  /** Indented past the back button so it hangs under the title, not the icon. */
  headerSubtitle: {
    paddingLeft: 40,
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
  phoneSection: {
    paddingHorizontal: 4,
  },
  sectionLabel: {
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  /** 48 because this row dials. See the same rule on the home screen. */
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
  },
  /** Takes the slack so the reach tag sits against the right edge. */
  phoneNumber: {
    flex: 1,
  },
  phoneCaption: {
    paddingTop: 10,
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
