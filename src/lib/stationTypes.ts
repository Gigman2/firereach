export const STATION_TABLE_VERSION = 2 as const;

/** Ghana's national fire emergency number — the last-resort dial target. */
export const NATIONAL_EMERGENCY_PHONE = "192";

export type StationContact = {
  phone: string;
  responseRate: number;
  active: boolean;
};

export type CachedStation = {
  id: string;
  name: string;
  region: string;
  district: string;
  lat: number;
  lng: number;
  contacts: StationContact[];
};

/**
 * The whole national table. Small enough (~23 KB) to hold in full, which is
 * why there is no partial cache, no radius of validity, and no expiry.
 */
export type StationTable = {
  schemaVersion: typeof STATION_TABLE_VERSION;
  /** ISO 8601, or null when this is the untouched bundled table. */
  refreshedAt: string | null;
  source: "bundled" | "network";
  stations: CachedStation[];
};

export type RankedStation = CachedStation & { distanceMeters: number };

/**
 * Numbers to try, best first, always ending with 192. Mirrors the server's
 * Station.PrimaryPhone ordering (highest responseRate, ties broken by the
 * lexicographically smallest phone) and then extends it into a full chain,
 * so "if no answer, try..." needs no extra logic.
 */
export function dialOrder(station: CachedStation): string[] {
  const ranked = station.contacts
    .filter((c) => c.active)
    .slice()
    .sort((a, b) =>
      a.responseRate !== b.responseRate
        ? b.responseRate - a.responseRate
        : a.phone.localeCompare(b.phone)
    )
    .map((c) => c.phone);

  const withoutNational = ranked.filter((p) => p !== NATIONAL_EMERGENCY_PHONE);
  return [...new Set([...withoutNational, NATIONAL_EMERGENCY_PHONE])];
}

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
