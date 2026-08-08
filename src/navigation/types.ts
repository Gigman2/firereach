export type RootStackParamList = {
  Splash: undefined;
  OnboardingIntro: undefined;
  HowItWorks: undefined;
  LocationRequest: undefined;
  LocationDenied: undefined;
  /**
   * The fix LocationRequestScreen obtained for itself immediately after the
   * grant. Passed explicitly because that screen no longer routes here on the
   * strength of the shared provider's `position` — see the note there — and
   * without it this screen could be reached while the provider still holds
   * null and would bounce the user out the moment they pressed Save, losing
   * whatever they had typed. Optional: the provider's own position is used
   * when there is no param.
   */
  SavePlace: { lat: number; lng: number } | undefined;
  OnboardingReady: undefined;
  MainTabs: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Stations: undefined;
  Guides: undefined;
  Settings: undefined;
};

export type StationsStackParamList = {
  StationsList: undefined;
  StationDetail: { stationId: string };
  ReportStation: { stationId: string; stationName: string };
};

export type GuidesStackParamList = {
  GuidesHub: undefined;
  GuideDetail: { guideId: string };
  GuidesChat: undefined;
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  SavedPlaces: undefined;
};
