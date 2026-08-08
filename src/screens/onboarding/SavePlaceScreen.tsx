import React, { useState } from 'react';
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
  newPlaceId,
} from '../../lib/savedPlaces';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SavePlace'>;

const LABEL_OPTIONS: { key: string; Icon: typeof HouseIcon }[] = [
  { key: 'Home', Icon: HouseIcon },
  { key: 'Work', Icon: BriefcaseIcon },
  { key: 'Other', Icon: DotsThreeIcon },
];

/** "300 m" below a kilometre, "1 km" / "2 km" at and above it. */
function formatRadius(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

/**
 * Reached only when LocationRequestScreen resolved a real position — see the
 * routing decision there. A place with no coordinates could never match a
 * radius, so this screen has no "no position" state of its own to render.
 */
export const SavePlaceScreen = ({ navigation }: Props) => {
  const { theme } = useTheme();
  const { position } = useNearestStation();
  const { addPlace } = useSavedPlaces();

  const [label, setLabel] = useState<string>('Home');
  const [note, setNote] = useState('');
  const [radiusMeters, setRadiusMeters] = useState<number>(DEFAULT_RADIUS_METERS);
  const [saveError, setSaveError] = useState(false);

  const goToReady = () => navigation.replace('OnboardingReady');

  const handleSave = async () => {
    // Belt and braces: this screen is only navigated to when `position` was
    // non-null, but it reads shared state rather than a value passed through
    // navigation params, so a position that vanished in between (e.g. the
    // provider re-resolving on foreground) is handled the same way as never
    // having had one, instead of writing a place with garbage coordinates.
    if (!position) {
      goToReady();
      return;
    }

    setSaveError(false);
    const result = await addPlace({
      id: newPlaceId(),
      label,
      lat: position.lat,
      lng: position.lng,
      note,
      radiusMeters,
    });

    if (result.ok) {
      goToReady();
    } else {
      // `addPlace` refuses at the ten-place cap rather than silently
      // dropping an old place to make room — see useSavedPlaces.tsx. During
      // onboarding this is effectively unreachable (there are no places yet),
      // but the contract does not promise success, so this screen does not
      // assume it either: it stays put and says so, rather than advancing to
      // Ready as if the save had worked.
      setSaveError(true);
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
            Your saved places are full, so this one could not be added. Skip
            for now — you can manage saved places from Settings.
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <OnboardingDots total={5} step={4} />
        <Button title="Save" onPress={handleSave} />
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
