import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { MapPinIcon, XIcon } from 'phosphor-react-native';
import * as Location from 'expo-location';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { OnboardingDots } from '../../components/ui/OnboardingDots';
import { colors } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import {
  useNearestStation,
  withTimeout,
  MAX_LAST_KNOWN_AGE_MS,
  MAX_LAST_KNOWN_ACCURACY_M,
} from '../../hooks/useNearestStation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationRequest'>;

/**
 * Bounds the post-grant fix attempt. Shorter than the provider's own 15 s
 * resolution ceiling on purpose: this is a person on an onboarding screen
 * watching a spinner, not a background refresh, and the cost of giving up is
 * only that one optional step is skipped.
 */
const GRANT_FIX_TIMEOUT_MS = 8000;

/**
 * A fix taken by this screen, for this screen's decision.
 *
 * Both tiers are ones the provider would call trustworthy — a last-known fix
 * inside `MAX_LAST_KNOWN_AGE_MS` / `MAX_LAST_KNOWN_ACCURACY_M`, then a live
 * one. The provider's third, *unbounded* last-known tier is deliberately not
 * used: its output is what the provider reports as `lastKnownStale`, and the
 * only thing this screen does with a position is offer to save it as a place.
 * A place saved from a three-day-old fix is a permanently wrong address that
 * the "say this" card would then read aloud with confidence on every future
 * call. Skipping the optional step is the cheaper mistake.
 */
async function fixAfterGrant(): Promise<{ lat: number; lng: number } | null> {
  const recent = await withTimeout(
    Location.getLastKnownPositionAsync({
      maxAge: MAX_LAST_KNOWN_AGE_MS,
      requiredAccuracy: MAX_LAST_KNOWN_ACCURACY_M,
    }),
    GRANT_FIX_TIMEOUT_MS
  );
  if (recent) {
    return { lat: recent.coords.latitude, lng: recent.coords.longitude };
  }

  const live = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    GRANT_FIX_TIMEOUT_MS
  );
  if (live) {
    return { lat: live.coords.latitude, lng: live.coords.longitude };
  }

  return null;
}

export const LocationRequestScreen = ({ navigation }: Props) => {
  const { theme, isDark } = useTheme();
  const { refresh } = useNearestStation();
  const [awaitingFix, setAwaitingFix] = useState(false);

  /**
   * The only place in the app that may raise the system location dialog from
   * a cold, undetermined state — which is why it is preceded by a screen that
   * explains what location is for. The shared provider deliberately checks
   * permission without ever requesting it, so this tap is what turns a
   * `denied` provider state into a real position.
   *
   * The SavePlace-vs-Ready decision is made from a fix this screen requests
   * itself, and nothing else. It used to be made from the provider's
   * `position` once `isResolving` went false after calling `refresh()` — but
   * `refresh()` early-returns while a resolution is already in flight, and on
   * first launch one always is: the bundled table has `refreshedAt: null`, so
   * the mount refresh runs, and it can hold `inFlight` for the full API
   * timeout while the 2.5 s splash finishes. Grant inside that window and
   * `refresh()` did nothing, the effect watching `isResolving` observed the
   * *pre-grant* resolution settling — the one whose `resolvePosition` had
   * already returned `denied`, before there was any permission to use — and
   * routed to Ready. Permission granted, step never offered.
   *
   * `fixAfterGrant()` cannot observe a pre-grant result: its promises are
   * created after `requestForegroundPermissionsAsync` has resolved
   * `granted`, it has no in-flight dedupe to short-circuit it, and it returns
   * its own value rather than reading a context field that some earlier
   * resolution may have left behind. There is no path by which it answers
   * with something that was computed before the grant.
   *
   * `refresh()` is still kicked off, unawaited, so the shared provider picks
   * up the new permission for the rest of the app — but nothing here waits on
   * it or reads its outcome.
   */
  const handleAllowLocation = async () => {
    if (awaitingFix) return;
    setAwaitingFix(true);

    // The permissions API can throw on OEM quirks, and an unhandled rejection
    // here would leave the button spinning with no way forward at all. A
    // permission we could not obtain is a permission we do not have, and the
    // denied screen is the one that offers a route out of that.
    let granted = false;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      granted = status === 'granted';
    } catch (err) {
      console.warn('[LocationRequestScreen] permission request failed', err);
    }

    if (!granted) {
      setAwaitingFix(false);
      navigation.replace('LocationDenied');
      return;
    }

    void refresh();
    const fix = await fixAfterGrant();
    setAwaitingFix(false);

    // The fix travels with the navigation rather than being looked up again
    // on the next screen: SavePlace saves coordinates, and the provider may
    // still be holding null when it mounts. A place with no coordinates could
    // never match a radius, so no fix means no step.
    if (fix) {
      navigation.replace('SavePlace', fix);
    } else {
      navigation.replace('OnboardingReady');
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
        <Button
          title="Allow Location"
          onPress={handleAllowLocation}
          loading={awaitingFix}
        />
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
