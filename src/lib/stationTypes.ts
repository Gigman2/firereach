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

/** Ghana's national fire emergency number — the last-resort dial target. */
export const NATIONAL_EMERGENCY_PHONE = "192";

/** Wire shape returned by GET /v1/stations. Snake_case, mirrors the Go DTO. */
export type ApiStationContact = {
  phone: string;
  response_rate: number;
  active: boolean;
};

export type ApiStation = {
  id: string;
  name: string;
  region: string;
  district: string;
  lat: number;
  lng: number;
  distance_meters: number;
  primary_phone: string;
  contacts: ApiStationContact[];
};
