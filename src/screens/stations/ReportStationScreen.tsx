import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Location from "expo-location";
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
import { typography } from "../../theme/typography";
import { ApiError } from "../../lib/apiClient";
import {
  fieldsFor,
  submitStationReport,
  suggestedValueFor,
  type SubmissionType,
} from "../../lib/submissionsApi";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { StationsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<StationsStackParamList, "ReportStation">;

/** The API's own vocabulary — see `SubmissionType`, which these must match. */
type ReportType = SubmissionType;

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
  const { stationId, stationName } = route.params;

  const [selectedType, setSelectedType] = useState<ReportType>("wrong_phone");
  const [phone, setPhone] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [context, setContext] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const draft = { phone, latitude, longitude, note: context };
  const fields = fieldsFor(selectedType);
  const suggestedValue = suggestedValueFor(selectedType, draft);
  const canSubmit = suggestedValue !== null && !isSubmitting;

  /**
   * Fills the coordinate fields from a fresh fix rather than the shared
   * provider's, which may be holding an unbounded-age last-known position.
   * The whole point of this form is to correct coordinates, so seeding it
   * from a stale one would launder yesterday's location into the fix.
   */
  const useCurrentLocation = async () => {
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location is off",
          "Turn on location for FireReach, or type the coordinates yourself.",
        );
        return;
      }
      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLatitude(String(fix.coords.latitude));
      setLongitude(String(fix.coords.longitude));
    } catch (err) {
      console.warn("[ReportStation] could not get a fix", err);
      Alert.alert(
        "Couldn't get your location",
        "Type the coordinates yourself, or try again in a moment.",
      );
    } finally {
      setIsLocating(false);
    }
  };

  const handleSubmit = async () => {
    if (suggestedValue === null || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await submitStationReport({
        stationId,
        type: selectedType,
        suggestedValue,
        note: context,
      });

      // Only leaves on success. The form used to close either way, which read
      // as confirmation for a report that was never sent anywhere.
      Alert.alert(
        "Report sent",
        "Thank you. A verifier will review this before the station list is updated.",
        [{ text: "OK", onPress: () => navigation.goBack() }],
      );
    } catch (err) {
      console.warn("[ReportStation] submit failed", err);
      // Everything typed stays on screen. A report is several fields of
      // effort, and losing it to a dropped connection is how someone decides
      // not to bother a second time.
      setSubmitError(
        err instanceof ApiError && err.status === 429
          ? "You've sent several reports recently. Try again a little later."
          : "Could not send your report. Check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    // Five inputs above a pinned Submit button. "padding" on Android as well
    // as iOS: this app is edge-to-edge, so the manifest's `adjustResize` no
    // longer resizes the window and deferring to it moves nothing. The
    // ScrollView is the only flexing child, so the shrink comes out of it and
    // Submit stays above the keyboard.
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior="padding"
    >
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

        {/*
          Only the fields the chosen type actually uses. "Station closed" used
          to ask for a corrected phone number and corrected coordinates, and
          "Missing station" asked both about a station that is not there.
        */}
        {fields.phone && (
          <View style={styles.fieldGroup}>
            <Text variant="caption" weight="bold" color={theme.textSecondary}>
              Correct Phone Number
            </Text>
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
              // Was "+1 (555) 000-0000" — a US number, on a Ghana-only app.
              placeholder="0302666576"
              placeholderTextColor={theme.textTertiary}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>
        )}

        {fields.coords && (
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
            {/* Had no onPress at all — it was a button that did nothing. */}
            <TouchableOpacity
              style={styles.locationButton}
              onPress={useCurrentLocation}
              disabled={isLocating}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Use my current location"
            >
              {isLocating ? (
                <ActivityIndicator size="small" color={colors.brandPrimary} />
              ) : (
                <CrosshairIcon size={18} color={colors.brandPrimary} />
              )}
              <Text variant="caption" weight="semiBold" color={colors.brandPrimary}>
                {isLocating ? "Getting your location…" : "Use my current location"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Additional Context */}
        <View style={styles.fieldGroup}>
          <Text variant="caption" weight="bold" color={theme.textSecondary}>
            {fields.noteRequired
              ? "What happened?"
              : "Additional context (optional)"}
          </Text>
          <TextInput
            style={[styles.input, styles.textarea, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
            placeholder={
              fields.noteRequired
                ? "Describe what you found — a verifier reads this."
                : "Anything else that would help a verifier check this."
            }
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
        {submitError && (
          <Text
            variant="caption"
            color={colors.error}
            align="center"
            style={styles.submitError}
          >
            {submitError}
          </Text>
        )}
        <Button
          title={isSubmitting ? "Sending…" : "Submit Report"}
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={isSubmitting}
        />
        {/*
          Says which field is missing rather than leaving a dead button with
          no explanation — the endpoint rejects an empty suggested_value, so
          an always-enabled Submit could only ever fail after a round trip.
        */}
        {!canSubmit && !isSubmitting && (
          <Text
            variant="label"
            color={theme.textTertiary}
            align="center"
            style={styles.submitHint}
          >
            {fields.phone
              ? "Enter the correct phone number to submit."
              : fields.coords
                ? "Enter both coordinates to submit."
                : "Describe what you found to submit."}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  submitError: {
    marginBottom: 10,
  },
  submitHint: {
    marginTop: 8,
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
    // TextInput does not go through the styled Text component.
    fontFamily: typography.fonts.regular,
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
