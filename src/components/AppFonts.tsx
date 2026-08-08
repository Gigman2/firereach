import React from "react";
import { View } from "react-native";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
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
