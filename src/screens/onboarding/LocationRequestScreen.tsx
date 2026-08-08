import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { MapPinIcon, XIcon } from 'phosphor-react-native';
import * as Location from 'expo-location';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { OnboardingDots } from '../../components/ui/OnboardingDots';
import { colors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import { useNearestStation } from '../../hooks/useNearestStation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationRequest'>;

export const LocationRequestScreen = ({ navigation }: Props) => {
  const { theme, isDark } = useTheme();
  const { refresh } = useNearestStation();

  /**
   * The only place in the app that may raise the system location dialog from
   * a cold, undetermined state — which is why it is preceded by a screen that
   * explains what location is for. The shared provider deliberately checks
   * permission without ever requesting it, so this tap is what turns a
   * `denied` provider state into a real position.
   */
  const handleAllowLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      // Start resolving now, not when Home mounts. The provider's own mount
      // effect already ran and settled on "denied" because permission was
      // undetermined at app start; nothing else would re-run it until the app
      // is next foregrounded. Deliberately not awaited — a resolution is
      // bounded at 15 s and must never sit between a tap and a screen change.
      void refresh();
      navigation.replace('OnboardingReady');
    } else {
      navigation.replace('LocationDenied');
    }
  };

  const handleSkip = () => {
    navigation.replace('OnboardingReady');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <XIcon size={24} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: isDark ? '#431C00' : '#FFF7ED' }]}>
          <MapPinIcon size={48} color="#F97316" weight="fill" />
        </View>

        <Text
          variant="label"
          color={colors.brandPrimary}
          align="center"
          style={styles.badge}
        >
          ACCESS REQUIRED
        </Text>

        <Text variant="displayBold" align="center" style={styles.heading}>
          We need your location.
        </Text>

        <Text
          variant="bodyMedium"
          color={theme.textSecondary}
          align="center"
          style={styles.description}
        >
          {/*
            Was generic boilerplate — "the best experience", "nearby services",
            "tailor results just for you". The permission prompt is the one
            moment to say what is actually at stake, which is why the app never
            asks for location before this screen has explained it.

            "never sent anywhere" is a load-bearing promise, and it is true
            today: ranking happens on-device in geo.ts, and the only network
            call that carries coordinates is fetchAllStations, which anchors at
            Ghana's centroid (stationsApi.ts) rather than the user's position.
            If that ever changes, this sentence has to change with it.
          */}
          Without it we cannot tell you which fire station is closest to you.
          Your location stays on this phone — it is never sent anywhere. You
          can skip this and still call 192.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button title="Allow Location" onPress={handleAllowLocation} />
        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text variant="caption" weight="medium" color={theme.textSecondary}>
            Skip for now
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.mapPlaceholder, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.mapInner}>
          <View style={[styles.mapPin, { borderColor: theme.background }]}>
            <View style={styles.mapPinDot} />
          </View>
        </View>
      </View>

      <View style={styles.dotsRow}>
        <OnboardingDots total={5} step={3} />
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
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 8,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  badge: {
    letterSpacing: 2,
    marginBottom: 16,
  },
  heading: {
    marginBottom: 12,
  },
  description: {
    paddingHorizontal: 16,
  },
  actions: {
    paddingHorizontal: 32,
    paddingTop: 32,
    gap: 16,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  mapPlaceholder: {
    marginTop: 32,
    marginHorizontal: 24,
    height: 128,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandPrimary,
    borderWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  dotsRow: {
    alignItems: 'center',
    paddingVertical: 32,
  },
});
