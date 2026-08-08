import React, { useState } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { MapPinIcon, ArrowLeftIcon } from "phosphor-react-native";
import * as Location from "expo-location";
import { Text } from "../../components/ui/Text";
import { Button } from "../../components/ui/Button";
import { OnboardingDots } from "../../components/ui/OnboardingDots";
import { colors } from "../../theme/colors";
import { useTheme } from "../../theme/ThemeContext";
import {
  useNearestStation,
  withTimeout,
  MAX_LAST_KNOWN_AGE_MS,
  MAX_LAST_KNOWN_ACCURACY_M,
} from "../../hooks/useNearestStation";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import * as onboarding from "./onboardingStyles";

type Props = NativeStackScreenProps<RootStackParamList, "LocationRequest">;

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
    GRANT_FIX_TIMEOUT_MS,
  );
  if (recent) {
    return { lat: recent.coords.latitude, lng: recent.coords.longitude };
  }

  const live = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    GRANT_FIX_TIMEOUT_MS,
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
   * it or reads its outcome, and it is fired after the local fix rather than
   * before, so it does not land inside the provider's own in-flight window.
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
      granted = status === "granted";
    } catch (err) {
      console.warn("[LocationRequestScreen] permission request failed", err);
    }

    if (!granted) {
      setAwaitingFix(false);
      // navigate, not replace. Replacing removed this screen from the
      // stack, so the denied screen's own back arrow landed two steps back on
      // HowItWorks and a user who refused by accident had no way to reach the
      // Allow button again.
      navigation.navigate("LocationDenied");
      return;
    }

    const fix = await fixAfterGrant();
    setAwaitingFix(false);

    // Fired AFTER the local fix, not before. `refresh()` early-returns while
    // a resolution is already in flight, and on first launch the provider's
    // own mount refresh is usually still running here — so calling it first
    // meant it did nothing, nothing retried, and Home could read
    // "LOCATION OFF" for the rest of the session even though the user had
    // just granted permission and saved a place. By now that in-flight
    // resolution has almost always settled, so this one actually runs.
    void refresh();

    // The fix travels with the navigation rather than being looked up again
    // on the next screen: SavePlace saves coordinates, and the provider may
    // still be holding null when it mounts. A place with no coordinates could
    // never match a radius, so no fix means no step.
    if (fix) {
      navigation.navigate("SavePlace", fix);
    } else {
      navigation.navigate("OnboardingReady");
    }
  };

  const handleSkip = () => {
    navigation.navigate("OnboardingReady");
  };

  return (
    <View
      style={[
        onboarding.screen,
        styles.container,
        { backgroundColor: theme.background },
      ]}
    >
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
              await handleSkip();
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

        <View style={styles.content}>
          <View
            style={[
              onboarding.iconCircle(96),
              styles.iconContainer,
              { backgroundColor: isDark ? "#431C00" : "#FFF7ED" },
            ]}
          >
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

        <View style={onboarding.actions}>
          <Button
            title="Allow Location"
            onPress={handleAllowLocation}
            loading={awaitingFix}
          />
        </View>
      </View>

      <View style={onboarding.dotsRow}>
        <OnboardingDots total={5} step={3} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "space-between",
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  iconContainer: {
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
});
