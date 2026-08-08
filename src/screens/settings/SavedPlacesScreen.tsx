import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeftIcon,
  HouseIcon,
  BriefcaseIcon,
  DotsThreeIcon,
  PencilSimpleIcon,
  TrashIcon,
  PlusIcon,
  XIcon,
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import { typography } from "../../theme/typography";
import { useNearestStation } from "../../hooks/useNearestStation";
import {
  useSavedPlaces,
  type MutationResult,
} from "../../hooks/useSavedPlaces";
import {
  RADIUS_PRESETS,
  DEFAULT_RADIUS_METERS,
  MAX_SAVED_PLACES,
  MAX_LABEL_LENGTH,
  MAX_LANDMARKS,
  newPlaceId,
  type SavedPlace,
} from "../../lib/savedPlaces";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SettingsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<SettingsStackParamList, "SavedPlaces">;

/**
 * Shortcuts that fill the label field, not a closed list of labels. Mirrors
 * onboarding's SavePlaceScreen — see the note there for why the third one
 * clears the field rather than filling in the word "Other".
 */
const LABEL_OPTIONS: { key: string; fill: string | null; Icon: typeof HouseIcon }[] = [
  { key: "Home", fill: "Home", Icon: HouseIcon },
  { key: "Work", fill: "Work", Icon: BriefcaseIcon },
  { key: "Other", fill: null, Icon: DotsThreeIcon },
];

const PRESET_FILLS = LABEL_OPTIONS.map((o) => o.fill).filter(Boolean);

/** "300 m" below a kilometre, "1 km" / "2 km" at and above it. Mirrors the
 * formatting onboarding's SavePlaceScreen uses, so a radius reads the same
 * wherever it appears — that function isn't exported, so this is a small,
 * deliberate duplicate rather than a shared import. */
function formatRadius(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

/**
 * The list row shows one line, not all three: the first landmark, plus a
 * count of the rest when there are more. `numberOfLines={1}` on the Text
 * that renders this is what actually stops a long landmark wrapping the row
 * — this only decides the words, not the truncation.
 */
function landmarksSummary(landmarks: string[]): string {
  if (landmarks.length === 0) return "No landmark saved";
  if (landmarks.length === 1) return landmarks[0];
  return `${landmarks[0]} +${landmarks.length - 1} more`;
}

type FormState =
  | { mode: "add" }
  | { mode: "edit"; place: SavedPlace }
  | null;

export const SavedPlacesScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { position } = useNearestStation();
  const { places, isLoading, loadFailed, addPlace, updatePlace, removePlace } =
    useSavedPlaces();
  const labelInput = useRef<TextInput>(null);

  const [form, setForm] = useState<FormState>(null);
  const [label, setLabel] = useState<string>("Home");
  const [landmarks, setLandmarks] = useState<string[]>([""]);
  const [radiusMeters, setRadiusMeters] = useState<number>(
    DEFAULT_RADIUS_METERS
  );
  const [saveError, setSaveError] = useState<"full" | "storage" | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const trimmedLabel = label.trim();
  const atCap = places.length >= MAX_SAVED_PLACES;
  const canAdd = !!position && !atCap;
  const filledLandmarks = landmarks.filter((l) => l.trim().length > 0).length;

  const updateLandmark = (index: number, text: string) =>
    setLandmarks((prev) => prev.map((l, i) => (i === index ? text : l)));

  const addLandmark = () =>
    setLandmarks((prev) =>
      prev.length < MAX_LANDMARKS ? [...prev, ""] : prev,
    );

  const removeLandmark = (index: number) =>
    setLandmarks((prev) => prev.filter((_, i) => i !== index));

  // Shown next to a disabled Add control rather than swallowed, so someone
  // who cannot add a place still learns why — a control that just vanishes
  // teaches nothing about what would fix it.
  const addDisabledReason = atCap
    ? `You've saved the maximum of ${MAX_SAVED_PLACES} places. Delete one to add another.`
    : !position
    ? "Add uses your current position, which isn't available yet."
    : null;

  const openAdd = () => {
    setLabel("Home");
    setLandmarks([""]);
    setRadiusMeters(DEFAULT_RADIUS_METERS);
    setSaveError(null);
    setForm({ mode: "add" });
  };

  const openEdit = (place: SavedPlace) => {
    setLabel(place.label);
    setLandmarks(place.landmarks.length > 0 ? place.landmarks : [""]);
    setRadiusMeters(place.radiusMeters);
    setSaveError(null);
    setForm({ mode: "edit", place });
  };

  const closeForm = () => setForm(null);

  const handleSave = async () => {
    if (!form) return;
    if (!trimmedLabel) return;
    setSaveError(null);

    let run: () => Promise<MutationResult>;
    if (form.mode === "add") {
      // Belt and braces: the Add control is disabled whenever there is no
      // position, but this reads shared state rather than a value captured
      // when the form opened, so a position that vanished in between (the
      // provider re-resolving on foreground) is handled the same way as
      // never having had one — closing the form instead of writing a place
      // with no coordinates.
      const at = position;
      if (!at) {
        closeForm();
        return;
      }
      run = () =>
        addPlace({
          id: newPlaceId(),
          label: trimmedLabel,
          lat: at.lat,
          lng: at.lng,
          landmarks,
          radiusMeters,
        });
    } else {
      const existing = form.place;
      run = () =>
        updatePlace({
          ...existing,
          label: trimmedLabel,
          landmarks,
          radiusMeters,
        });
    }

    // `finally`, because a rejection that skipped it left the Save button
    // spinning and permanently disabled — the form could never be submitted
    // or dismissed by its own controls again. The provider now returns a
    // result rather than rejecting; this is the second line of defence.
    setIsSaving(true);
    let result: MutationResult;
    try {
      result = await run();
    } finally {
      setIsSaving(false);
    }

    // Refusals are reported, never assumed away. "full" and "storage" are
    // kept apart because telling someone to delete a place when the real
    // problem is that the write failed sends them off destroying data for
    // nothing. The disabled-Add guard and this check are separate defences:
    // the list can fill between opening the form and saving it.
    if (result.ok) closeForm();
    else setSaveError(result.reason);
  };

  const handleDelete = (place: SavedPlace) => {
    Alert.alert(
      "Delete place",
      `Remove "${place.label}" from your saved places?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // A failed delete used to reject unhandled and leave the row
            // sitting there, which reads as "it worked and then came back".
            // The provider now reports rather than rejects; the catch is for
            // anything that gets past it, since nothing else would ever see
            // a rejection from this floating async handler.
            let result: MutationResult;
            try {
              result = await removePlace(place.id);
            } catch (err) {
              console.warn("[SavedPlacesScreen] delete failed", err);
              result = { ok: false, reason: "storage" };
            }
            if (!result.ok) {
              Alert.alert(
                "Could not delete",
                `"${place.label}" is still saved — this phone would not write the change. Try again.`
              );
            }
          },
        },
      ]
    );
  };

  const headerTitle = !form
    ? "Your places"
    : form.mode === "add"
    ? "Add a place"
    : "Edit place";

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
          onPress={() => (form ? closeForm() : navigation.goBack())}
          style={styles.backButton}
        >
          <ArrowLeftIcon size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text variant="bodyLarge" weight="bold" style={styles.headerTitle}>
          {headerTitle}
        </Text>
      </View>

      {form ? (
        <>
          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <Text variant="caption" weight="bold" color={theme.textSecondary}>
                Label
              </Text>
              {/* The label is read aloud as a whole sentence — "I'm at Mum's
                  house." — so it has to be the caller's own word for the
                  place. The chips only fill this field. */}
              <TextInput
                ref={labelInput}
                style={[
                  styles.input,
                  styles.labelInput,
                  { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background },
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
                        { borderColor: theme.border, backgroundColor: theme.background },
                        isSelected && styles.chipSelected,
                      ]}
                    >
                      <option.Icon
                        size={20}
                        color={isSelected ? colors.brandPrimary : theme.textTertiary}
                      />
                      <Text
                        variant="caption"
                        weight="semiBold"
                        color={isSelected ? theme.textPrimary : theme.textSecondary}
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
                      { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background },
                    ]}
                    placeholder={
                      index === 0
                        ? "near the blue kiosk"
                        : "opposite the pharmacy"
                    }
                    placeholderTextColor={theme.textTertiary}
                    value={value}
                    onChangeText={(text) => updateLandmark(index, text)}
                    accessibilityLabel={`Landmark ${index + 1}`}
                  />
                  <TouchableOpacity
                    onPress={() => removeLandmark(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove landmark ${index + 1}`}
                    hitSlop={8}
                    style={styles.removeLandmark}
                  >
                    <XIcon size={18} color={theme.textTertiary} />
                  </TouchableOpacity>
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

            <View style={styles.section}>
              <Text variant="caption" weight="bold" color={theme.textSecondary}>
                How close counts as being here?
              </Text>
              <View style={styles.chipRow}>
                {RADIUS_PRESETS.map((preset) => {
                  const isSelected = radiusMeters === preset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      onPress={() => setRadiusMeters(preset)}
                      activeOpacity={0.7}
                      style={[
                        styles.radiusChip,
                        { borderColor: theme.border, backgroundColor: theme.background },
                        isSelected && styles.chipSelected,
                      ]}
                    >
                      <Text
                        variant="caption"
                        weight="semiBold"
                        color={isSelected ? theme.textPrimary : theme.textSecondary}
                      >
                        {formatRadius(preset)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {saveError === "full" && (
              <Text variant="caption" color={colors.error} align="center">
                Your saved places are full, so this could not be added. Delete
                another place first, then try again.
              </Text>
            )}
            {saveError === "storage" && (
              <Text variant="caption" color={colors.error} align="center">
                This phone would not save the change, so nothing was altered.
                Try again.
              </Text>
            )}
          </ScrollView>

          <View
            style={[
              styles.footer,
              { paddingBottom: insets.bottom + 16, borderTopColor: theme.border },
            ]}
          >
            <Button
              title={form.mode === "add" ? "Save" : "Save changes"}
              onPress={handleSave}
              loading={isSaving}
              disabled={!trimmedLabel || isSaving}
            />
            <TouchableOpacity onPress={closeForm} style={styles.cancelButton}>
              <Text variant="caption" weight="medium" color={theme.textSecondary}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {/* textSecondary, not textTertiary: #9CA3AF on white is 2.54:1,
                under the 4.5:1 floor, and this app is read outdoors in
                daylight. The same swap is made at every user-facing string
                on this screen. */}
            {isLoading ? (
              <Text
                variant="caption"
                color={theme.textSecondary}
                align="center"
                style={styles.emptyText}
              >
                Loading your places…
              </Text>
            ) : loadFailed ? (
              // Not "no saved places yet" — that is a claim about the user's
              // data made on the strength of a read that failed. Whatever is
              // saved is still saved; we just cannot see it.
              <Text
                variant="caption"
                color={theme.textSecondary}
                align="center"
                style={styles.emptyText}
              >
                Your saved places could not be read on this phone. They have
                not been lost, and adding one will try reading them again
                first — nothing will be written over them.
              </Text>
            ) : places.length === 0 ? (
              <Text
                variant="caption"
                color={theme.textSecondary}
                align="center"
                style={styles.emptyText}
              >
                No saved places yet. Add the place you're at now, so you
                always have the right words ready when you call.
              </Text>
            ) : (
              places.map((place) => (
                <View
                  key={place.id}
                  style={[
                    styles.placeCard,
                    { backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                >
                  <View style={styles.placeHeader}>
                    <Text variant="bodyMedium" weight="bold" style={styles.placeLabel}>
                      {place.label}
                    </Text>
                    <View style={[styles.radiusBadge, { backgroundColor: theme.surface }]}>
                      <Text variant="label" color={theme.textSecondary}>
                        {formatRadius(place.radiusMeters)}
                      </Text>
                    </View>
                  </View>
                  <Text
                    variant="caption"
                    color={theme.textSecondary}
                    style={styles.placeNote}
                    numberOfLines={1}
                  >
                    {landmarksSummary(place.landmarks)}
                  </Text>
                  <View style={[styles.placeActions, { borderTopColor: theme.divider }]}>
                    <TouchableOpacity
                      style={styles.placeActionButton}
                      onPress={() => openEdit(place)}
                    >
                      <PencilSimpleIcon size={16} color={theme.textSecondary} />
                      <Text variant="caption" weight="semiBold" color={theme.textSecondary}>
                        Edit
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.placeActionButton}
                      onPress={() => handleDelete(place)}
                    >
                      <TrashIcon size={16} color={colors.brandPrimary} />
                      <Text variant="caption" weight="semiBold" color={colors.brandPrimary}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          <View
            style={[
              styles.footer,
              { paddingBottom: insets.bottom + 16, borderTopColor: theme.border },
            ]}
          >
            <Button
              title="Add place"
              onPress={openAdd}
              disabled={!canAdd}
              leftIcon={<PlusIcon size={20} color={canAdd ? "#FFFFFF" : theme.textTertiary} weight="bold" />}
            />
            {addDisabledReason && (
              <Text
                variant="caption"
                color={theme.textSecondary}
                align="center"
                style={styles.disabledReason}
              >
                {addDisabledReason}
              </Text>
            )}
          </View>
        </>
      )}
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
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 16,
  },
  emptyText: {
    paddingHorizontal: 8,
    paddingTop: 32,
  },
  placeCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  placeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  placeLabel: {
    flex: 1,
  },
  radiusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
  },
  placeNote: {
    lineHeight: 20,
  },
  placeActions: {
    flexDirection: "row",
    gap: 24,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  placeActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  formContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 24,
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
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 12,
    alignItems: "center",
    borderTopWidth: 1,
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  disabledReason: {
    paddingHorizontal: 8,
  },
});
