import React, { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  LightningIcon,
  CookingPotIcon,
  HouseIcon,
  BuildingsIcon,
  CalendarIcon,
  FirstAidKitIcon,
  WindIcon,
  SignOutIcon,
  FireExtinguisherIcon,
  BrainIcon,
  ArrowRightIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import { useConnectivity } from "../../hooks/useConnectivity";
import { visibleItems } from "../../lib/safetyContent";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GuidesStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<GuidesStackParamList, "GuidesHub">;

const TABS = ["All", "Hazards", "First Aid"] as const;

/**
 * Presentation only. Which tab a topic belongs to comes from the content's
 * own `category` field, not from this map — the previous hardcoded array had
 * Smoke, Evacuation, and Extinguisher under Hazards, contradicting §S5.
 *
 * `accent` is a category colour band, consumed by GuideDetailScreen's header
 * (fix round 1 / I1: that header used to be hardcoded amber for every guide,
 * a leftover from when the screen only ever showed the burns protocol).
 * Kept here, in the one map both screens already read from, so a single edit
 * changes every screen. Values below are a working default from the project
 * owner, not a final design decision. None is red: `colors.brandPrimary`
 * (#CC1B1B) stays reserved for call and emergency actions. Each was checked
 * for >=4.5:1 contrast against white header text; "burns" was darkened from
 * the original #D97706 (3.19:1, fails) to #AD5F04 (4.76:1) to clear that bar.
 */
export const SUBCATEGORY_META: Record<
  string,
  { label: string; Icon: typeof LightningIcon; accent: string }
> = {
  electrical:   { label: "Electrical",   Icon: LightningIcon,        accent: "#B45309" },
  cooking:      { label: "Cooking",      Icon: CookingPotIcon,       accent: "#C2410C" },
  home:         { label: "Home",         Icon: HouseIcon,            accent: "#0F766E" },
  workplace:    { label: "Workplace",    Icon: BuildingsIcon,        accent: "#1D4ED8" },
  seasonal:     { label: "Seasonal",     Icon: CalendarIcon,         accent: "#4D7C0F" },
  burns:        { label: "Burns",        Icon: FirstAidKitIcon,      accent: "#AD5F04" },
  smoke:        { label: "Smoke",        Icon: WindIcon,             accent: "#57534E" },
  evacuation:   { label: "Evacuation",   Icon: SignOutIcon,          accent: "#7E22CE" },
  extinguisher: { label: "Extinguisher", Icon: FireExtinguisherIcon, accent: "#0E7490" },
};

/**
 * Fallback header band for a subcategory that is somehow missing from the
 * map above (shipped content and SUBCATEGORY_META are kept in sync by
 * guidesHubCategories.test.ts, but a screen consuming this map defensively
 * should never crash or fall back to red on a gap). 4.83:1 against white.
 */
export const NEUTRAL_ACCENT = "#6B7280";

const TAB_FOR_CATEGORY = { hazard: "Hazards", first_aid: "First Aid" } as const;

export const GuidesHubScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { isOnline } = useConnectivity();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("All");

  const items = useMemo(() => visibleItems(), []);
  const filtered = useMemo(
    () =>
      activeTab === "All"
        ? items
        : items.filter((i) => TAB_FOR_CATEGORY[i.category] === activeTab),
    [items, activeTab]
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
        <Text variant="heading2">Safety Guide</Text>
      </View>

      <View style={{ marginHorizontal: 16 }}>
        <Text
          variant="bodyMedium"
          color={theme.textSecondary}
          style={styles.subtitle}
        >
          Expert advice for fire prevention and emergency response.
        </Text>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text
              variant="caption"
              weight="bold"
              color={
                activeTab === tab ? colors.brandPrimary : theme.textTertiary
              }
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category Grid */}
      <ScrollView
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {/* AI Ask Bar */}
        {isOnline === false ? (
          <View style={[styles.askBar, { backgroundColor: theme.surface }]}>
            <Text
              variant="caption"
              color={theme.textTertiary}
              style={styles.askBarText}
            >
              AI tips unavailable offline
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.askBar, { backgroundColor: theme.surface }]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate("GuidesChat")}
          >
            <BrainIcon size={20} color={colors.brandPrimary} weight="fill" />
            <Text
              variant="caption"
              color={theme.textTertiary}
              style={styles.askBarText}
            >
              Ask a fire safety question...
            </Text>
            <View style={styles.askBarArrow}>
              <ArrowRightIcon size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        )}

        {filtered.map((item) => {
          const meta = SUBCATEGORY_META[item.subcategory];
          return (
            <TouchableOpacity
              key={item.slug}
              style={[
                styles.card,
                { backgroundColor: theme.background, borderColor: theme.border },
              ]}
              activeOpacity={0.7}
              onPress={() =>
                navigation.navigate("GuideDetail", { guideId: item.slug })
              }
            >
              <View
                style={[
                  styles.cardIcon,
                  { backgroundColor: `${colors.brandPrimary}14` },
                ]}
              >
                <meta.Icon size={22} color={colors.brandPrimary} weight="fill" />
              </View>
              <Text variant="caption" weight="bold" numberOfLines={1}>
                {meta.label}
              </Text>
              <View
                style={[styles.cardAccent, { backgroundColor: colors.brandPrimary }]}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
  subtitle: {
    marginTop: 4,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 24,
    borderBottomWidth: 1,
  },
  tab: {
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: colors.brandPrimary,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 12,
    paddingBottom: 120,
  },
  askBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 100,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 4,
  },
  askBarText: {
    flex: 1,
  },
  askBarArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "47.5%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    overflow: "hidden",
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardAccent: {
    position: "absolute",
    bottom: 0,
    left: 16,
    right: 16,
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
});
