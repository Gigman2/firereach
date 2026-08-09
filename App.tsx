import { ThemeProvider } from './src/theme/ThemeContext';
import { NearestStationProvider } from './src/hooks/useNearestStation';
import { SavedPlacesProvider } from './src/hooks/useSavedPlaces';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AppFonts } from './src/components/AppFonts';
import { useDevRemount } from './src/lib/devReset';

export default function App() {
  /*
    Changes only when the development-only "Reset all app data" in Settings
    fires, and remounts everything below it. The providers each cache what
    they read at launch and the navigator picks its initial route once, so
    emptying storage underneath them is not on its own enough to send anyone
    back to onboarding. Constant in production.
  */
  const generation = useDevRemount();

  return (
    <ThemeProvider key={generation}>
      {/*
        One position resolution for the whole process. Mounted here — inside
        the theme provider, outside the navigator and therefore outside every
        screen — so that navigation can never create a second instance:
        switching tabs, resetting the stack or replacing a route all leave it
        untouched. Two instances meant two positions, and two positions meant
        the Home tab and the Stations tab could name different nearest
        stations at the same moment.

        It also sits OUTSIDE AppFonts, so the GPS request goes out on the first
        frame instead of queueing behind typography. Only the UI waits for the
        font; the work that decides which station to call does not.

        SavedPlacesProvider is outside AppFonts for the same reason and mounted
        beside this one for the same reason again — one instance, so two
        screens cannot disagree about what is saved. Its read of storage is
        part of answering "what do I say on the call", so it has no business
        queueing behind a font either.

        The order of these two is deliberately NOT load-bearing. Neither reads
        the other: stations are ranked from measurements only, and a saved
        place answers what to say rather than who to call. Anything that makes
        one depend on the other has re-merged two facts this app keeps apart.
      */}
      <NearestStationProvider>
        <SavedPlacesProvider>
          <AppFonts>
            <AppNavigator />
          </AppFonts>
        </SavedPlacesProvider>
      </NearestStationProvider>
    </ThemeProvider>
  );
}
