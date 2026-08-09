import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Development-only "start again": wipes everything the app has on disk and
 * remounts the tree, so the next frame is the one a fresh install shows.
 *
 * Every other route back to onboarding on a real device is a chore. Android
 * buries "Clear storage" three taps deep in system settings; iOS has no
 * equivalent at all, so replaying the flow there means deleting the app and
 * rebuilding it. Onboarding is the part of this app most worth testing
 * repeatedly — it is where the user's place and their location permission are
 * decided — and it should not cost a reinstall to look at twice.
 */

/**
 * Set by `useDevRemount` while the app is mounted in development. Null in
 * production, and null in tests that have not registered one.
 */
let remountApp: (() => void) | null = null;

/**
 * Registers the callback that remounts the app tree. Returns an unsubscribe.
 * Exported for `useDevRemount`, which is how the app itself should use this.
 */
export function setAppRemountHandler(fn: () => void): () => void {
  remountApp = fn;
  return () => {
    if (remountApp === fn) remountApp = null;
  };
}

/**
 * Deletes every key, then remounts.
 *
 * Deliberately `clear()`, where `clearStationCache` is deliberately not:
 * that function names its two keys because it has to leave onboarding and
 * theme standing, whereas this one has to leave nothing standing. A list of
 * keys to delete is a list a future key can be left out of — the same shape
 * as the onboarding bug recorded in `onboarding.ts` — and here nobody would
 * see it as anything but the reset mysteriously "not taking".
 *
 * Clearing storage is only half the job. The providers in `App.tsx` each hold
 * their own copy of what they read at launch and nothing tells them to look
 * again, and `AppNavigator` reads the onboarding flag once, at mount, to pick
 * its initial route. `SavedPlacesProvider` is the sharp edge: its `placesRef`
 * would still hold the deleted list and `baselineKnown` would still vouch for
 * it, so the first place saved during the replayed onboarding gets committed
 * on top of that list and brings every deleted place back. Remounting is one
 * mechanism that resettles all of them, instead of a reset hook per provider
 * that the next provider can forget to add.
 */
export async function resetAllAppData(): Promise<void> {
  if (!__DEV__) {
    // Reachable only by a caller that dropped the __DEV__ guard on its own
    // side. Wiping a real user's saved places is not something to do on the
    // strength of a mistake at the call site.
    console.warn("[devReset] refusing to reset outside development");
    return;
  }

  await AsyncStorage.clear();
  // After the wipe, never before: a tree that remounts first would re-read
  // storage that is still populated and land right back on the Home tab.
  remountApp?.();
}

/**
 * Returns a value to hang on the app tree as a `key`. Changing a key remounts
 * that subtree, which is what gives every provider a fresh read of the
 * storage `resetAllAppData` just emptied.
 *
 * In production nothing registers a handler, so this stays 0 for the life of
 * the process and the tree never remounts.
 */
export function useDevRemount(): number {
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!__DEV__) return;
    return setAppRemountHandler(() => setGeneration((g) => g + 1));
  }, []);

  return generation;
}
