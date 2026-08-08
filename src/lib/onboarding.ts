import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Set once the user has left onboarding by any route. `AppNavigator` reads it
 * on launch to decide whether to show onboarding at all.
 *
 * The literal used to be written out in two files and read in a third, and
 * only one of the three places that leave onboarding actually set it — so
 * skipping from the intro or the how-it-works screen dropped you into the app
 * and then showed you onboarding again on the next launch, forever. One
 * exported key and one exported function, so a new exit cannot forget.
 */
export const ONBOARDING_COMPLETE_KEY = "@firereach_onboarding_complete";

/**
 * Records that onboarding is done. Never throws: failing to persist means the
 * user sees onboarding once more, which is an annoyance. Throwing here would
 * happen mid-navigation on the way into the app, which is not.
 */
export async function completeOnboarding(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
  } catch (err) {
    console.warn("[onboarding] could not persist completion", err);
  }
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)) === "true";
  } catch (err) {
    console.warn("[onboarding] could not read completion", err);
    return false;
  }
}
