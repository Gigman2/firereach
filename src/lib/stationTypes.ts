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

export type DialTarget = {
  phone: string;
  /**
   * True only for 192. Toll-free numbers connect on any Ghanaian network with
   * no airtime; everything else in the chain is a chargeable landline that a
   * caller with no credit cannot reach at all.
   */
  tollFree: boolean;
};

/**
 * Numbers to offer, best first. 192 always leads and is always present.
 *
 * This is deliberately NOT ordered by which line is most likely to answer.
 * Every station number in the dataset is a chargeable hotline — GNFS itself
 * separates "emergency numbers (112/192)" from "hotlines" — and 192 is the
 * only one that connects with zero credit. Leading with a hotline means a
 * caller with no airtime taps the primary action and nothing happens.
 *
 * The hotlines that follow keep their source ordering, which reproduces the
 * publication order of a 2022 page and measures nothing. They are alternatives,
 * not a ranked likelihood of pickup.
 */
export function dialTargets(station: CachedStation): DialTarget[] {
  const hotlines = station.contacts
    .filter((c) => c.active && c.phone !== NATIONAL_EMERGENCY_PHONE)
    .slice()
    .sort((a, b) =>
      a.responseRate !== b.responseRate
        ? b.responseRate - a.responseRate
        : a.phone.localeCompare(b.phone)
    )
    .map((c) => c.phone);

  return [
    { phone: NATIONAL_EMERGENCY_PHONE, tollFree: true },
    ...[...new Set(hotlines)].map((phone) => ({ phone, tollFree: false })),
  ];
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
