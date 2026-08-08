import React, { useState } from "react";
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
} from "phosphor-react-native";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import { typography } from "../../theme/typography";
import { useNearestStation } from "../../hooks/useNearestStation";
import { useSavedPlaces } from "../../hooks/useSavedPlaces";
import {
  RADIUS_PRESETS,
  DEFAULT_RADIUS_METERS,
  MAX_SAVED_PLACES,
  newPlaceId,
  type SavedPlace,
} from "../../lib/savedPlaces";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SettingsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<SettingsStackParamList, "SavedPlaces">;

const LABEL_OPTIONS: { key: string; Icon: typeof HouseIcon }[] = [
  { key: "Home", Icon: HouseIcon },
  { key: "Work", Icon: BriefcaseIcon },
  { key: "Other", Icon: DotsThreeIcon },
];

/** "300 m" below a kilometre, "1 km" / "2 km" at and above it. Mirrors the
 * formatting onboarding's SavePlaceScreen uses, so a radius reads the same
 * wherever it appears — that function isn't exported, so this is a small,
 * deliberate duplicate rather than a shared import. */
function formatRadius(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

type FormState =
  | { mode: "add" }
  | { mode: "edit"; place: SavedPlace }
  | null;

export const SavedPlacesScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { position } = useNearestStation();
  const { places, isLoading, addPlace, updatePlace, removePlace } =
    useSavedPlaces();

  const [form, setForm] = useState<FormState>(null);
  const [label, setLabel] = useState<string>("Home");
  const [note, setNote] = useState("");
  const [radiusMeters, setRadiusMeters] = useState<number>(
    DEFAULT_RADIUS_METERS
  );
  const [saveError, setSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const atCap = places.length >= MAX_SAVED_PLACES;
  const canAdd = !!position && !atCap;

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
    setNote("");
    setRadiusMeters(DEFAULT_RADIUS_METERS);
    setSaveError(false);
    setForm({ mode: "add" });
  };

  const openEdit = (place: SavedPlace) => {
    setLabel(place.label);
    setNote(place.note);
    setRadiusMeters(place.radiusMeters);
    setSaveError(false);
    setForm({ mode: "edit", place });
  };

  const closeForm = () => setForm(null);

  const handleSave = async () => {
    if (!form) return;
    setSaveError(false);

    if (form.mode === "add") {
      // Belt and braces: the Add control is disabled whenever there is no
      // position, but this reads shared state rather than a value captured
      // when the form opened, so a position that vanished in between (the
      // provider re-resolving on foreground) is handled the same way as
      // never having had one — closing the form instead of writing a place
      // with no coordinates.
      if (!position) {
        closeForm();
        return;
      }
      setIsSaving(true);
      const result = await addPlace({
        id: newPlaceId(),
        label,
        lat: position.lat,
        lng: position.lng,
        note,
        radiusMeters,
      });
      setIsSaving(false);
      if (result.ok) {
        closeForm();
      } else {
        // `addPlace` refuses at the cap rather than assuming success — the
        // disabled-Add guard above and this check are two separate defences,
        // since the list can fill between opening the form and saving it.
        setSaveError(true);
      }
    } else {
      setIsSaving(true);
      await updatePlace({ ...form.place, label, note, radiusMeters });
      setIsSaving(false);
      closeForm();
    }
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
            await removePlace(place.id);
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
              <View style={styles.chipRow}>
                {LABEL_OPTIONS.map((option) => {
                  const isSelected = label === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      onPress={() => setLabel(option.key)}
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
              <Text variant="caption" weight="bold" color={theme.textSecondary}>
                Landmark (optional)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textarea,
                  { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background },
                ]}
                placeholder="near the blue kiosk, opposite the pharmacy"
                placeholderTextColor={theme.textTertiary}
                value={note}
                onChangeText={setNote}
                multiline
              />
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

            {saveError && (
              <Text variant="caption" color={colors.error} align="center">
                Your saved places are full, so this could not be added. Delete
                another place first, then try again.
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
            {isLoading ? (
              <Text
                variant="caption"
                color={theme.textTertiary}
                align="center"
                style={styles.emptyText}
              >
                Loading your places…
              </Text>
            ) : places.length === 0 ? (
              <Text
                variant="caption"
                color={theme.textTertiary}
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
                    color={place.note.trim() ? theme.textSecondary : theme.textTertiary}
                    style={styles.placeNote}
                  >
                    {place.note.trim() || "No landmark saved"}
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
                color={theme.textTertiary}
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
  textarea: {
    minHeight: 72,
    paddingTop: 12,
    textAlignVertical: "top",
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
