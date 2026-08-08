import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from "react-native";
import {
  HouseIcon,
  BriefcaseIcon,
  DotsThreeIcon,
  ArrowLeftIcon,
  PlusIcon,
  XIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { OnboardingDots } from "../../components/ui/OnboardingDots";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import { typography } from "../../theme/typography";
import { useNearestStation } from "../../hooks/useNearestStation";
import { useSavedPlaces } from "../../hooks/useSavedPlaces";
import {
  RADIUS_PRESETS,
  DEFAULT_RADIUS_METERS,
  MAX_LABEL_LENGTH,
  MAX_LANDMARKS,
  newPlaceId,
} from "../../lib/savedPlaces";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import * as onboarding from "./onboardingStyles";

type Props = NativeStackScreenProps<RootStackParamList, "SavePlace">;

/**
 * Shortcuts that fill the label field, not a closed list of labels.
 *
 * The third one used to fill the literal word "Other", and the card read the
 * label back verbatim: "I'm at Other." — said to an operator who covers a
 * whole region and cannot see the caller. It now clears the field and puts
 * the cursor in it, because the only useful answer to "somewhere else" is the
 * caller's own word for the place. `fill: null` is what marks it.
 */
const LABEL_OPTIONS: {
  key: string;
  fill: string | null;
  Icon: typeof HouseIcon;
}[] = [
  { key: "Home", fill: "Home", Icon: HouseIcon },
  { key: "Work", fill: "Work", Icon: BriefcaseIcon },
  { key: "Other", fill: null, Icon: DotsThreeIcon },
];

const PRESET_FILLS = LABEL_OPTIONS.map((o) => o.fill).filter(Boolean);

/** "300 m" below a kilometre, "1 km" / "2 km" at and above it. */
function formatRadius(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

/**
 * Reached only when LocationRequestScreen obtained a real fix — see the
 * routing decision there. A place with no coordinates could never match a
 * radius, so this screen has no "no position" state of its own to render.
 */
export const SavePlaceScreen = ({ navigation, route }: Props) => {
  const { theme } = useTheme();
  const { position } = useNearestStation();
  const { addPlace } = useSavedPlaces();
  const labelInput = useRef<TextInput>(null);

  const [label, setLabel] = useState<string>("Home");
  const [landmarks, setLandmarks] = useState<string[]>([""]);
  const [radiusMeters, setRadiusMeters] = useState<number>(
    DEFAULT_RADIUS_METERS,
  );
  const [saveError, setSaveError] = useState<"full" | "storage" | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * The fix the previous screen took right after the grant, preferred over
   * the shared provider's: it is a bounded-freshness fix from seconds ago on
   * this exact screen flow, whereas the provider may still be holding null,
   * or may have fallen back to its unbounded last-known tier. Saving a place
   * at coordinates the caller was at days ago would make every later reading
   * of "I'm at Home" a wrong address.
   */
  const savePosition = route.params ?? position;

  const trimmedLabel = label.trim();
  const canSave = trimmedLabel.length > 0 && !isSaving;
  const filledLandmarks = landmarks.filter((l) => l.trim().length > 0).length;

  const goToReady = () => navigation.navigate("OnboardingReady");

  const updateLandmark = (index: number, text: string) =>
    setLandmarks((prev) => prev.map((l, i) => (i === index ? text : l)));

  const addLandmark = () =>
    setLandmarks((prev) =>
      prev.length < MAX_LANDMARKS ? [...prev, ""] : prev,
    );

  const removeLandmark = (index: number) =>
    setLandmarks((prev) => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    // Belt and braces: this screen is only reached with a fix, but a param
    // can be absent on a manual deep link and the provider's position can
    // vanish (it re-resolves on foreground), so no-coordinates is handled the
    // same way as never having had them rather than writing garbage.
    if (!savePosition) {
      goToReady();
      return;
    }
    if (!trimmedLabel) return;

    setSaveError(null);
    setIsSaving(true);
    let result;
    try {
      result = await addPlace({
        id: newPlaceId(),
        label: trimmedLabel,
        lat: savePosition.lat,
        lng: savePosition.lng,
        landmarks,
        radiusMeters,
      });
    } finally {
      // Always cleared. A rejection that skipped this left Save spinning and
      // permanently disabled — the provider now returns a result rather than
      // rejecting, and this is the second line of defence behind that.
      setIsSaving(false);
    }

    if (result.ok) {
      goToReady();
    } else {
      // `addPlace` refuses rather than assuming success — at the ten-place
      // cap, or when storage would not take the write. During onboarding the
      // cap is effectively unreachable (there are no places yet), but the
      // contract does not promise success, so this screen does not assume it
      // either: it stays put and says which of the two happened, rather than
      // advancing to Ready as if the save had worked.
      setSaveError(result.reason);
    }
  };

  return (
    <View style={[onboarding.screen, { backgroundColor: theme.background }]}>
      <View style={onboarding.fill}>
        <View style={onboarding.headerSplit}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
          >
            <ArrowLeftIcon size={24} color={theme.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await goToReady();
            }}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text
              variant="caption"
              weight="semiBold"
              color={theme.textSecondary}
            >
              Skip
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text variant="displayBold" align="center" style={styles.heading}>
            Save a location
          </Text>

          <Text
            variant="bodyMedium"
            color={theme.textSecondary}
            align="center"
            style={styles.description}
          >
            To help the fire service find you, even without internet, we
            advise saving at least 3 landmarks closest to you.
          </Text>

          <View style={styles.section}>
            <Text variant="caption" weight="bold" color={theme.textSecondary}>
              Label
            </Text>
            {/* The label is read aloud as a whole sentence — "I'm at Mum's
              house." — so it has to be the caller's own word for the place.
              The chips only fill this field; they no longer replace it. */}
            <TextInput
              ref={labelInput}
              style={[
                styles.input,
                styles.labelInput,
                {
                  borderColor: theme.border,
                  color: theme.textPrimary,
                  backgroundColor: theme.background,
                },
              ]}
              placeholder="Home, Shop, Mum's house"
              placeholderTextColor={theme.textSecondary}
              value={label}
              onChangeText={setLabel}
              maxLength={MAX_LABEL_LENGTH}
              autoCapitalize="sentences"
              returnKeyType="done"
              accessibilityLabel="Name for this place"
            />
            <View style={styles.chipRow}>
              {LABEL_OPTIONS.map((option) => {
                const isSelected = option.fill
                  ? trimmedLabel === option.fill
                  : trimmedLabel.length > 0 &&
                    !PRESET_FILLS.includes(trimmedLabel);
                return (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => {
                      setLabel(option.fill ?? "");
                      if (!option.fill) labelInput.current?.focus();
                    }}
                    activeOpacity={0.7}
                    style={[
                      styles.labelChip,
                      {
                        borderColor: theme.border,
                        backgroundColor: theme.background,
                      },
                      isSelected && styles.chipSelected,
                    ]}
                  >
                    <option.Icon
                      size={20}
                      color={
                        isSelected ? colors.brandPrimary : theme.textTertiary
                      }
                    />
                    <Text
                      variant="caption"
                      weight="semiBold"
                      color={
                        isSelected ? theme.textPrimary : theme.textSecondary
                      }
                    >
                      {option.key}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.landmarksHeader}>
              <Text variant="caption" weight="bold" color={theme.textSecondary}>
                Landmarks near you
              </Text>
              <Text variant="caption" color={theme.textSecondary}>
                {filledLandmarks} of {MAX_LANDMARKS}
              </Text>
            </View>
            {landmarks.map((value, index) => (
              <View key={index} style={styles.landmarkRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.landmarkInput,
                    {
                      borderColor: theme.border,
                      color: theme.textPrimary,
                      backgroundColor: theme.background,
                    },
                  ]}
                  placeholder={
                    index === 0
                      ? "near the blue kiosk"
                      : "opposite the pharmacy"
                  }
                  placeholderTextColor={theme.textSecondary}
                  value={value}
                  onChangeText={(text) => updateLandmark(index, text)}
                  accessibilityLabel={`Landmark ${index + 1}`}
                />
                {/*
                  No remove on the only field. Tapping it left the step with
                  zero landmark inputs and a small "Add another" link, on the
                  screen whose own copy advises saving three.
                */}
                {landmarks.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeLandmark(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove landmark ${index + 1}`}
                    hitSlop={8}
                    style={styles.removeLandmark}
                  >
                    <XIcon size={18} color={theme.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {landmarks.length < MAX_LANDMARKS && (
              <TouchableOpacity
                onPress={addLandmark}
                activeOpacity={0.7}
                style={styles.addLandmark}
                accessibilityRole="button"
                accessibilityLabel="Add another landmark"
              >
                <PlusIcon size={16} color={colors.brandPrimary} weight="bold" />
                <Text variant="caption" weight="semiBold" color={colors.brandPrimary}>
                  Add another
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {saveError === "full" && (
            <Text variant="caption" color={colors.error} align="center">
              Your saved places are full, so this one could not be added. Skip
              for now — you can manage saved places from Settings.
            </Text>
          )}
          {saveError === "storage" && (
            <Text variant="caption" color={colors.error} align="center">
              This phone would not save the place. Try again, or skip for now —
              you can add it later from Settings.
            </Text>
          )}
        </ScrollView>

        <View style={onboarding.actions}>
          <Button
            title="Save"
            onPress={handleSave}
            disabled={!canSave}
            loading={isSaving}
          />
        </View>

        <View style={onboarding.dotsRow}>
          <OnboardingDots total={5} step={4} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 24,
  },
  heading: {
    marginBottom: 0,
  },
  description: {
    paddingHorizontal: 8,
  },
  section: {
    gap: 12,
  },
  chipRow: {
    flexDirection: "row",
    gap: 12,
  },
  labelChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
  },
  radiusChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
  },
  chipSelected: {
    borderColor: colors.brandPrimary,
    backgroundColor: `${colors.brandPrimary}08`,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    // TextInput does not go through the styled Text component.
    fontFamily: typography.fonts.regular,
  },
  labelInput: {
    // Single line, so it needs its own comfortable tap height.
    minHeight: 52,
    paddingVertical: 12,
  },
  landmarksHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  landmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  landmarkInput: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 12,
  },
  removeLandmark: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  addLandmark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
  },
  footer: {
    alignItems: "center",
  },
  skipButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
});
