export const STATION_CACHE_VERSION = 1 as const;

export type StationLocation = {
  lat: number;
  lng: number;
};

export type Station = {
  id: string;
  name: string;
  region: string;
  distanceMeters: number;
  phone: string; // digits only, e.g. "192" or "+233302773906"
};

export type StationSnapshot = {
  schemaVersion: typeof STATION_CACHE_VERSION;
  fetchedAt: string; // ISO 8601
  userLocation: StationLocation;
  station: Station;
};
