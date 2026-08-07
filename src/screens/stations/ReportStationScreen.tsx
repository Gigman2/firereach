import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeftIcon,
  PhoneIcon,
  MapPinIcon,
  QuestionIcon,
  ProhibitIcon,
  CrosshairIcon,
  InfoIcon,
  FireIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { StationsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<StationsStackParamList, "ReportStation">;

type ReportType = "wrong_phone" | "wrong_location" | "missing" | "closed";

const REPORT_OPTIONS: {
  key: ReportType;
  label: string;
  Icon: typeof PhoneIcon;
}[] = [
  { key: "wrong_phone", label: "Wrong phone", Icon: PhoneIcon },
  { key: "wrong_location", label: "Wrong location", Icon: MapPinIcon },
  { key: "missing", label: "Missing station", Icon: QuestionIcon },
  { key: "closed", label: "Station closed", Icon: ProhibitIcon },
];

export const ReportStationScreen = ({ navigation, route }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { stationName } = route.params;

  const [selectedType, setSelectedType] = useState<ReportType>("wrong_phone");
  const [phone, setPhone] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [context, setContext] = useState("");

  const handleSubmit = () => {
    // TODO: submit report
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: theme.border,
            backgroundColor: theme.background,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <ArrowLeftIcon size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text variant="bodyLarge" weight="bold" style={styles.headerTitle}>
          Report Station Info
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Station Reference */}
        <View style={[styles.stationRef, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.stationRefInfo}>
            <Text variant="bodyMedium" weight="bold">
              {stationName}
            </Text>
          </View>
          <View style={styles.stationRefIcon}>
            <FireIcon size={28} color={colors.brandPrimary} weight="fill" />
          </View>
        </View>

        {/* Report Type Selection */}
        <View style={styles.section}>
          <Text variant="label" color={theme.textTertiary} style={styles.sectionLabel}>
            WHAT INFORMATION IS INCORRECT?
          </Text>
          <View style={styles.typeGrid}>
            {REPORT_OPTIONS.map((option) => {
              const isSelected = selectedType === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.typeOption,
                    { borderColor: theme.border, backgroundColor: theme.background },
                    isSelected && styles.typeOptionSelected,
                  ]}
                  onPress={() => setSelectedType(option.key)}
                  activeOpacity={0.7}
                >
                  <option.Icon
                    size={22}
                    color={
                      isSelected
                        ? colors.brandPrimary
                        : theme.textTertiary
                    }
                  />
                  <Text
                    variant="caption"
                    weight="semiBold"
                    align="center"
                    color={
                      isSelected
                        ? theme.textPrimary
                        : theme.textSecondary
                    }
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Phone Field */}
        <View style={styles.fieldGroup}>
          <Text variant="caption" weight="bold" color={theme.textSecondary}>
            Correct Phone Number
          </Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
            placeholder="+1 (555) 000-0000"
            placeholderTextColor={theme.textTertiary}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
        </View>

        {/* Coordinates */}
        <View style={styles.fieldGroup}>
          <Text variant="caption" weight="bold" color={theme.textSecondary}>
            Correct Coordinates
          </Text>
          <View style={styles.coordsRow}>
            <TextInput
              style={[styles.input, styles.coordInput, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
              placeholder="Latitude"
              placeholderTextColor={theme.textTertiary}
              keyboardType="numeric"
              value={latitude}
              onChangeText={setLatitude}
            />
            <TextInput
              style={[styles.input, styles.coordInput, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
              placeholder="Longitude"
              placeholderTextColor={theme.textTertiary}
              keyboardType="numeric"
              value={longitude}
              onChangeText={setLongitude}
            />
          </View>
          <TouchableOpacity style={styles.locationButton}>
            <CrosshairIcon size={18} color={colors.brandPrimary} />
            <Text variant="caption" weight="semiBold" color={colors.brandPrimary}>
              Use my current location
            </Text>
          </TouchableOpacity>
        </View>

        {/* Additional Context */}
        <View style={styles.fieldGroup}>
          <Text variant="caption" weight="bold" color={theme.textSecondary}>
            Additional context (optional)
          </Text>
          <TextInput
            style={[styles.input, styles.textarea, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
            placeholder="Provide any additional details that might help our verification team..."
            placeholderTextColor={theme.textTertiary}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            value={context}
            onChangeText={setContext}
          />
        </View>

        {/* Disclaimer */}
        <View style={[styles.disclaimer, { backgroundColor: theme.surface, borderColor: theme.divider }]}>
          <InfoIcon size={18} color={colors.brandPrimary} />
          <Text variant="label" color={theme.textTertiary} style={styles.disclaimerText}>
            By submitting this report, you confirm that the information provided
            is accurate to the best of your knowledge. FireReach verifiers will
            review your submission before updating the public database.
          </Text>
        </View>
      </ScrollView>

      {/* Submit */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: theme.border, backgroundColor: theme.background }]}>
        <Button title="Submit Report" onPress={handleSubmit} />
      </View>
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
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
    paddingBottom: 16,
  },
  stationRef: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  stationRefInfo: {
    flex: 1,
    gap: 4,
  },
  stationRefIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: `${colors.brandPrimary}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    gap: 12,
  },
  sectionLabel: {
    letterSpacing: 1,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  typeOption: {
    width: "47%",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  typeOptionSelected: {
    borderColor: colors.brandPrimary,
    backgroundColor: `${colors.brandPrimary}08`,
  },
  fieldGroup: {
    gap: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  coordsRow: {
    flexDirection: "row",
    gap: 12,
  },
  coordInput: {
    flex: 1,
  },
  locationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: `${colors.brandPrimary}10`,
    borderWidth: 1,
    borderColor: `${colors.brandPrimary}30`,
  },
  textarea: {
    height: 96,
    paddingTop: 12,
  },
  disclaimer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  disclaimerText: {
    flex: 1,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
