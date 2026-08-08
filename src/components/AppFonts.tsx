import React from "react";
import { View } from "react-native";
// Per-weight subpaths, NOT the package root. The root index.js `require()`s
// all 18 faces (nine weights, roman and italic) at module load, and Metro does
// not tree-shake them back out — importing from it ships 6.0 MB of TTF to
// register 1.3 MB. On a low-end Android target that is the difference between
// a rounding error and a fifth of the download.
import { useFonts } from "@expo-google-fonts/inter/useFonts";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { useTheme } from "../theme/ThemeContext";

/**
 * Holds the app back until Inter is ready, then renders normally.
 *
 * The faces are bundled in the binary, not fetched, so this resolves in a few
 * frames offline and on a cold start alike — it is not a network wait and
 * cannot fail because a phone has no signal. If loading somehow errors,
 * `useFonts` reports loaded anyway and the app renders in the platform default
 * rather than not at all: for an emergency app, the wrong font beats no screen.
 *
 * The placeholder is a themed block rather than `null` so a dark-mode cold
 * start does not flash white.
 */
export const AppFonts = ({ children }: { children: React.ReactNode }) => {
  const { theme } = useTheme();
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!loaded && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }} />
    );
  }

  return <>{children}</>;
};
