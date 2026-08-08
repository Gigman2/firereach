import { ThemeProvider } from './src/theme/ThemeContext';
import { NearestStationProvider } from './src/hooks/useNearestStation';
import { SavedPlacesProvider } from './src/hooks/useSavedPlaces';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AppFonts } from './src/components/AppFonts';

export default function App() {
  return (
    <ThemeProvider>
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
      */}
      <NearestStationProvider>
        <AppFonts>
          <SavedPlacesProvider>
            <AppNavigator />
          </SavedPlacesProvider>
        </AppFonts>
      </NearestStationProvider>
    </ThemeProvider>
  );
}
