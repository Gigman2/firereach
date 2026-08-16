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
  FlameIcon,
  BrainIcon,
  ArrowRightIcon,
  WifiSlashIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import { useConnectivity } from "../../hooks/useConnectivity";
import { useSafetyContent } from "../../hooks/useSafetyContent";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GuidesStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<GuidesStackParamList, "GuidesHub">;

const TABS = ["All", "Hazards", "First Aid"] as const;

/**
 * Presentation only. Which tab a topic belongs to comes from the content's
 * own `category` field, not from this map — the previous hardcoded array had
 * Smoke, Evacuation, and Extinguisher under Hazards, contradicting §S5.
 *
 * There is deliberately no per-subcategory colour here any more. Each entry
 * used to carry an `accent` that GuideDetailScreen painted its entire header
 * with, which gave nine guides nine differently coloured screens for content
 * of identical weight — colour reading as a severity ranking the app was
 * never assigning. `colors.brandPrimary` is now the only accent either screen
 * uses, and it means the same thing on both.
 */
export const SUBCATEGORY_META: Record<
  string,
  { label: string; Icon: typeof LightningIcon }
> = {
  electrical:   { label: "Electrical",   Icon: LightningIcon        },
  cooking:      { label: "Cooking",      Icon: CookingPotIcon       },
  home:         { label: "Home",         Icon: HouseIcon            },
  workplace:    { label: "Workplace",    Icon: BuildingsIcon        },
  seasonal:     { label: "Seasonal",     Icon: CalendarIcon         },
  flames:       { label: "Flames",       Icon: FlameIcon            },
  burns:        { label: "Burns",        Icon: FirstAidKitIcon      },
  smoke:        { label: "Smoke",        Icon: WindIcon             },
  evacuation:   { label: "Evacuation",   Icon: SignOutIcon          },
  extinguisher: { label: "Extinguisher", Icon: FireExtinguisherIcon },
};

const TAB_FOR_CATEGORY = { hazard: "Hazards", first_aid: "First Aid" } as const;

// With OTA (Task 13), an item can arrive with a subcategory this build of
// the app has never heard of. GuideDetailScreen guards the same lookup by
// dropping the subcategory from its header kicker rather than printing an
// unknown key; this map logs each unknown subcategory once (not once per
// render/item) so a real drift is still visible without spamming the console
// every time the hub re-renders.
const loggedUnknownSubcategories = new Set<string>();
function warnUnknownSubcategoryOnce(subcategory: string): void {
  if (loggedUnknownSubcategories.has(subcategory)) return;
  loggedUnknownSubcategories.add(subcategory);
  console.warn(`[GuidesHubScreen] unknown subcategory "${subcategory}", skipping card`);
}

export const GuidesHubScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { isOnline } = useConnectivity();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("All");

  const items = useSafetyContent();
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

      {/* AI Ask — pinned between the tabs and the grid so the one
          conversational entry point never scrolls away. The red-tinted
          border is the only one on the screen: this is the interactive
          thing here. Surface, not a red fill — red app-wide means a
          control that dials, and this one navigates. */}
      {isOnline === false ? (
        <View
          style={[
            styles.askBar,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View
            style={[styles.askBarIcon, { backgroundColor: theme.background }]}
          >
            <WifiSlashIcon size={22} color={theme.textTertiary} />
          </View>
          <View style={styles.askBarCopy}>
            <Text
              variant="bodyMedium"
              weight="semiBold"
              color={theme.textSecondary}
              style={styles.askBarCopyText}
            >
              AI guide unavailable offline
            </Text>
            <Text
              variant="caption"
              color={theme.textTertiary}
              style={styles.askBarCopyText}
            >
              Your saved guides below still work
            </Text>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.askBar,
            {
              backgroundColor: theme.surface,
              borderColor: `${colors.brandPrimary}66`,
            },
          ]}
          activeOpacity={0.7}
          onPress={() => navigation.navigate("GuidesChat")}
          accessibilityRole="button"
          accessibilityLabel="Ask the AI guide"
          accessibilityHint="Opens the AI chat"
        >
          <View
            style={[
              styles.askBarIcon,
              { backgroundColor: `${colors.brandPrimary}1F` },
            ]}
          >
            <BrainIcon size={22} color={colors.brandPrimary} weight="fill" />
          </View>
          <View style={styles.askBarCopy}>
            <Text variant="bodyMedium" weight="semiBold" style={styles.askBarCopyText}>
              Ask the AI guide
            </Text>
            <Text
              variant="caption"
              color={theme.textSecondary}
              style={styles.askBarCopyText}
            >
              Instant fire safety answers
            </Text>
          </View>
          <View style={styles.askBarArrow}>
            <ArrowRightIcon size={16} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      )}

      {/* Category Grid */}
      <ScrollView
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {filtered.map((item) => {
          const meta = SUBCATEGORY_META[item.subcategory];
          if (!meta) {
            warnUnknownSubcategoryOnce(item.subcategory);
            return null;
          }
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
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
  },
  askBarIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  askBarCopy: {
    flex: 1,
    gap: 2,
  },
  askBarCopyText: {
    flexShrink: 1,
  },
  askBarArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
