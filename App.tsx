import { ThemeProvider } from './src/theme/ThemeContext';
import { NearestStationProvider } from './src/hooks/useNearestStation';
import { AppNavigator } from './src/navigation/AppNavigator';

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
      */}
      <NearestStationProvider>
        <AppNavigator />
      </NearestStationProvider>
    </ThemeProvider>
  );
}
