import React, { useState } from "react";
import {
  View,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  TextInput,
  Linking,
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
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { StationsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<StationsStackParamList, "StationsList">;

interface Station {
  id: string;
  name: string;
  area: string;
  distance: string;
  phone: string;
}

const STATIONS_DATA: { title: string; data: Station[] }[] = [
  {
    title: "GREATER ACCRA",
    data: [
      {
        id: "1",
        name: "Accra Central Fire Station",
        area: "Accra Metropolitan District, Greater Accra",
        distance: "approx. 2.4 km",
        phone: "tel:+233302773906",
      },
      {
        id: "2",
        name: "Legon Fire Station",
        area: "Ayawaso West, Greater Accra",
        distance: "approx. 5.1 km",
        phone: "tel:112",
      },
    ],
  },
  {
    title: "ASHANTI",
    data: [
      {
        id: "3",
        name: "Kumasi Central Station",
        area: "Kumasi Metro, Ashanti Region",
        distance: "approx. 245 km",
        phone: "tel:112",
      },
    ],
  },
  {
    title: "CENTRAL REGION",
    data: [
      {
        id: "4",
        name: "Cape Coast Fire Dept",
        area: "Cape Coast Metro, Central Region",
        distance: "approx. 150 km",
        phone: "tel:112",
      },
    ],
  },
];

export const StationsListScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [search, setSearch] = useState("");

  const filteredData = STATIONS_DATA.map((section) => ({
    ...section,
    data: section.data.filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.area.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((section) => section.data.length > 0);

  const renderStation = ({ item }: { item: Station }) => (
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
          {item.area}
        </Text>
      </View>
      <View style={styles.stationActions}>
        <View style={[styles.distanceChip, { backgroundColor: theme.surface }]}>
          <Text variant="label" color={theme.textSecondary}>
            {item.distance}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.callChip}
          onPress={() => Linking.openURL(item.phone)}
        >
          <PhoneIcon size={18} color="#FFFFFF" weight="fill" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

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
        {section.title}
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
        <TouchableOpacity>
          <MagnifyingGlassIcon size={24} color={theme.textPrimary} />
        </TouchableOpacity>
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
          placeholder="Search by name or area..."
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
    justifyContent: "space-between",
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
  },
  listContent: {
    paddingBottom: 100,
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
