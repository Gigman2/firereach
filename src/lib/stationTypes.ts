export const STATION_TABLE_VERSION = 2 as const;

/**
 * Ghana's national fire emergency number — toll-free and fire-specific. It is
 * the only number in the app that connects on any network with zero credit,
 * and the only one guaranteed to be present in every chain. It is no longer
 * the primary target when a station resolves; see dialTargets.
 */
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
 * Numbers to offer. The station's own hotlines lead; 192 is last and always
 * present.
 *
 * This ordering is a product decision, and it trades one real risk for
 * another. 192 is the only number that connects with zero credit, so leading
 * with a hotline means a caller with no airtime taps the primary action and
 * nothing happens. Against that: 192 is a single national line, while the
 * station's own number reaches the people who actually roll. The second
 * consideration was judged to outweigh the first.
 *
 * Two properties keep the trade honest, and both are pinned by tests:
 * 192 never leaves the chain, so the free number is always one tap away; and
 * the chain is never empty, so the call button is never dead. Every station in
 * the bundled table has at least one hotline, so a resolved station always
 * yields a real station number in first position.
 *
 * Hotline order among themselves is NOT a ranked likelihood of pickup. It
 * reproduces the publication order of a 2022 page and measures nothing.
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
    ...[...new Set(hotlines)].map((phone) => ({ phone, tollFree: false })),
    { phone: NATIONAL_EMERGENCY_PHONE, tollFree: true },
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
