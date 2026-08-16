import type { NavigatorScreenParams } from "@react-navigation/native";

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
  /**
   * A tab that hosts a stack, so it can be entered at a screen other than its
   * first: Home's "Save this place" offer lands the caller in the add form
   * rather than on the settings root, two taps from where they were sent.
   *
   * `| undefined` keeps the bare `navigate("Settings")` that opens the tab at
   * whatever it was last showing, which is what the gear icon still wants.
   */
  Settings: NavigatorScreenParams<SettingsStackParamList> | undefined;
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
  /**
   * `openAdd` opens the add form on arrival, for callers sent here by an offer
   * they have already accepted somewhere else. Optional, because the ordinary
   * route in is the Settings list, where the user is browsing rather than
   * answering a question.
   */
  SavedPlaces: { openAdd?: boolean } | undefined;
};
