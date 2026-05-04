export type RootStackParamList = {
  Splash: undefined;
  OnboardingIntro: undefined;
  HowItWorks: undefined;
  LocationRequest: undefined;
  LocationDenied: undefined;
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
