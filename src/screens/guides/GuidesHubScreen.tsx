import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
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
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GuidesStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<GuidesStackParamList, "GuidesHub">;

const TABS = ["All", "Hazards", "First Aid"] as const;

interface Category {
  id: string;
  label: string;
  Icon: typeof LightningIcon;
  accentColor: string;
  tab: "Hazards" | "First Aid";
}

const CATEGORIES: Category[] = [
  { id: "electrical", label: "Electrical", Icon: LightningIcon, accentColor: colors.brandPrimary, tab: "Hazards" },
  { id: "cooking", label: "Cooking", Icon: CookingPotIcon, accentColor: colors.brandPrimary, tab: "Hazards" },
  { id: "home", label: "Home", Icon: HouseIcon, accentColor: colors.brandPrimary, tab: "Hazards" },
  { id: "workplace", label: "Workplace", Icon: BuildingsIcon, accentColor: colors.brandPrimary, tab: "Hazards" },
  { id: "seasonal", label: "Seasonal", Icon: CalendarIcon, accentColor: colors.brandPrimary, tab: "Hazards" },
  { id: "burns", label: "Burns", Icon: FirstAidKitIcon, accentColor: colors.brandPrimary, tab: "First Aid" },
  { id: "smoke", label: "Smoke", Icon: WindIcon, accentColor: colors.brandPrimary, tab: "Hazards" },
  { id: "evacuation", label: "Evacuation", Icon: SignOutIcon, accentColor: colors.brandPrimary, tab: "Hazards" },
  { id: "extinguisher", label: "Extinguisher", Icon: FireExtinguisherIcon, accentColor: colors.brandPrimary, tab: "Hazards" },
];

export const GuidesHubScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("All");

  const filtered =
    activeTab === "All"
      ? CATEGORIES
      : CATEGORIES.filter((c) => c.tab === activeTab);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text variant="displayBold">Safety Guide</Text>
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
            style={[
              styles.tab,
              activeTab === tab && styles.tabActive,
            ]}
          >
            <Text
              variant="caption"
              weight="bold"
              color={
                activeTab === tab
                  ? colors.brandPrimary
                  : theme.textTertiary
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

        {filtered.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate("GuideDetail", { guideId: cat.id })
            }
          >
            <View
              style={[
                styles.cardIcon,
                { backgroundColor: `${cat.accentColor}14` },
              ]}
            >
              <cat.Icon size={22} color={cat.accentColor} weight="fill" />
            </View>
            <Text variant="caption" weight="bold" numberOfLines={1}>
              {cat.label}
            </Text>
            <View
              style={[styles.cardAccent, { backgroundColor: cat.accentColor }]}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
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
