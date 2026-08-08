import React, { useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { HouseIcon, BriefcaseIcon, DotsThreeIcon } from 'phosphor-react-native';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { OnboardingDots } from '../../components/ui/OnboardingDots';
import { colors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { typography } from '../../theme/typography';
import { useNearestStation } from '../../hooks/useNearestStation';
import { useSavedPlaces } from '../../hooks/useSavedPlaces';
import {
  RADIUS_PRESETS,
  DEFAULT_RADIUS_METERS,
  MAX_LABEL_LENGTH,
  newPlaceId,
} from '../../lib/savedPlaces';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SavePlace'>;

/**
 * Shortcuts that fill the label field, not a closed list of labels.
 *
 * The third one used to fill the literal word "Other", and the card read the
 * label back verbatim: "I'm at Other." — said to an operator who covers a
 * whole region and cannot see the caller. It now clears the field and puts
 * the cursor in it, because the only useful answer to "somewhere else" is the
 * caller's own word for the place. `fill: null` is what marks it.
 */
const LABEL_OPTIONS: { key: string; fill: string | null; Icon: typeof HouseIcon }[] = [
  { key: 'Home', fill: 'Home', Icon: HouseIcon },
  { key: 'Work', fill: 'Work', Icon: BriefcaseIcon },
  { key: 'Other', fill: null, Icon: DotsThreeIcon },
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

  const [label, setLabel] = useState<string>('Home');
  const [note, setNote] = useState('');
  const [radiusMeters, setRadiusMeters] = useState<number>(DEFAULT_RADIUS_METERS);
  const [saveError, setSaveError] = useState<'full' | 'storage' | null>(null);
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

  const goToReady = () => navigation.replace('OnboardingReady');

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
        note,
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text variant="displayBold" align="center" style={styles.heading}>
          Save where you are now
        </Text>

        <Text
          variant="bodyMedium"
          color={theme.textSecondary}
          align="center"
          style={styles.description}
        >
          Whoever answers the call covers your whole region and cannot see
          you — save this place so you always have the right words ready.
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
                : trimmedLabel.length > 0 && !PRESET_FILLS.includes(trimmedLabel);
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => {
                    setLabel(option.fill ?? '');
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

        {saveError === 'full' && (
          <Text variant="caption" color={colors.error} align="center">
            Your saved places are full, so this one could not be added. Skip
            for now — you can manage saved places from Settings.
          </Text>
        )}
        {saveError === 'storage' && (
          <Text variant="caption" color={colors.error} align="center">
            This phone would not save the place. Try again, or skip for now —
            you can add it later from Settings.
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <OnboardingDots total={5} step={4} />
        <Button
          title="Save"
          onPress={handleSave}
          disabled={!canSave}
          loading={isSaving}
        />
        <TouchableOpacity onPress={goToReady} style={styles.skipButton}>
          <Text variant="caption" weight="medium" color={theme.textSecondary}>
            Skip for now
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
    gap: 24,
  },
  heading: {
    marginBottom: 4,
  },
  description: {
    paddingHorizontal: 8,
  },
  section: {
    gap: 12,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 12,
  },
  labelChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
  },
  radiusChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    // Single line, so it needs its own comfortable tap height — `textarea`
    // below is what gives the multi-line note field its size.
    minHeight: 52,
    paddingVertical: 12,
  },
  textarea: {
    minHeight: 72,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 20,
    alignItems: 'center',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
