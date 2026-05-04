import React from "react";
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
  RulerIcon,
  PhoneIcon,
  MapPinIcon,
  MapTrifoldIcon,
  ArrowRightIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { StationsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<StationsStackParamList, "StationDetail">;

// Mock data — in production this would come from a store/API
const STATION = {
  id: "1",
  name: "Station 42 - Downtown",
  regionBadge: "Central Metro Region",
  district: "Central District",
  region: "North Region",
  distance: "~ 2.4 km",
  phones: ["(555) 012-3456", "(555) 012-3457"],
  coords: "40.7128° N, 74.0060° W",
};

export const StationDetailScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const handleCall = () => {
    Linking.openURL("tel:5550123456");
  };

  const handleOpenMaps = () => {
    Linking.openURL("https://maps.google.com/?q=40.7128,-74.0060");
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
            {STATION.name}
          </Text>
        </View>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text variant="label" color="#FFFFFF">
              {STATION.regionBadge}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
              {STATION.district}
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
              {STATION.region}
            </Text>
          </View>

          <View style={[styles.infoDivider, { backgroundColor: theme.divider }]} />

          <View style={styles.infoRow}>
            <View style={styles.infoLabel}>
              <RulerIcon size={20} color={colors.brandPrimary} />
              <Text variant="caption" color={theme.textSecondary}>
                Distance
              </Text>
            </View>
            <Text variant="bodyMedium" weight="semiBold">
              {STATION.distance}
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
                PHONE (PRIMARY/ALT)
              </Text>
            </View>
            {STATION.phones.map((phone) => (
              <Text
                key={phone}
                variant="bodyMedium"
                weight="semiBold"
                style={styles.phoneNumber}
              >
                {phone}
              </Text>
            ))}
          </View>
        </View>

        {/* Map Preview */}
        <TouchableOpacity
          style={styles.mapSection}
          activeOpacity={0.8}
          onPress={handleOpenMaps}
        >
          <View style={[styles.mapPreview, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MapPinIcon
              size={40}
              color={colors.brandPrimary}
              weight="fill"
            />
            <View style={styles.coordsBadge}>
              <Text
                variant="label"
                color="#FFFFFF"
                style={{ fontFamily: "monospace" }}
              >
                {STATION.coords}
              </Text>
            </View>
          </View>
          <View style={styles.mapLink}>
            <MapTrifoldIcon size={18} color={colors.brandPrimary} />
            <Text variant="caption" weight="semiBold" color={colors.brandPrimary}>
              Tap to open in Maps
            </Text>
          </View>
        </TouchableOpacity>

        {/* Call CTA */}
        <View style={styles.ctaSection}>
          <Button
            title="Call Station"
            size="large"
            onPress={handleCall}
            leftIcon={<PhoneIcon size={24} color="#FFFFFF" weight="fill" />}
          />
        </View>

        {/* Report Link */}
        <TouchableOpacity
          style={styles.reportLink}
          onPress={() =>
            navigation.navigate("ReportStation", {
              stationId: STATION.id,
              stationName: STATION.name,
            })
          }
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
