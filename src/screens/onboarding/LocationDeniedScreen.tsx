import React from 'react';
import { View, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { GpsSlashIcon, WarningIcon, ArrowLeftIcon, ArrowSquareOutIcon } from 'phosphor-react-native';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { OnboardingDots } from '../../components/ui/OnboardingDots';
import { colors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationDenied'>;

export const LocationDeniedScreen = ({ navigation }: Props) => {
  const { theme } = useTheme();

  const handleOpenSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        {/*
          Now genuinely returns to LocationRequest — it used to land on
          HowItWorks because that screen replaced itself on the way here.
        */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <ArrowLeftIcon size={24} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <GpsSlashIcon size={80} color={colors.warning} weight="regular" />
        </View>

        <Text variant="heading1" align="center" style={styles.heading}>
          Location access denied.
        </Text>

        <View style={styles.warningBanner}>
          <View style={styles.warningHeader}>
            <WarningIcon size={20} color={colors.warning} weight="fill" />
            <Text variant="bodyMedium" weight="bold">
              Enable Location
            </Text>
          </View>
          <Text
            variant="caption"
            color={theme.textSecondary}
            style={styles.warningBody}
          >
            Without location we cannot pick the station nearest you, so the app
            will offer 192 instead. You can still browse every station and its
            numbers from the Stations tab. To get the nearest one
            automatically, enable location in your device settings.
          </Text>
          <TouchableOpacity onPress={handleOpenSettings} style={styles.settingsLink}>
            <Text variant="caption" weight="bold" color={colors.warning}>
              Open Settings
            </Text>
            <ArrowSquareOutIcon size={14} color={colors.warning} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.spacer} />

      <View style={styles.footer}>
        <Button
          title="Continue anyway"
          variant="secondary"
          onPress={() => navigation.navigate('OnboardingReady')}
          style={[styles.continueButton, { borderColor: theme.border }]}
        />

        {/*
          Step 3 of 5, the same step as LocationRequest — this is that screen's
          denied variant, not a step of its own. It used to draw three dots of
          its own in a different colour, which read as a different flow the
          moment the shared component took the count to five.
        */}
        <View style={styles.dotsRow}>
          <OnboardingDots total={5} step={3} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 8,
  },
  content: {
    paddingHorizontal: 24,
  },
  iconContainer: {
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: `${colors.warning}15`,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: 40,
  },
  heading: {
    marginBottom: 24,
  },
  warningBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${colors.warning}4D`,
    backgroundColor: `${colors.warning}0D`,
    padding: 20,
    gap: 12,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  warningBody: {
    lineHeight: 20,
  },
  settingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  spacer: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 20,
  },
  continueButton: {
    borderWidth: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
