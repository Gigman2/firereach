import { apiGet } from "./apiClient";
import { ApiStation, CachedStation } from "./stationTypes";

/** Ghana's approximate centroid. */
const GHANA_LAT = 7.9465;
const GHANA_LNG = -1.0232;
/** Comfortably above the real station count; the server caps nothing. */
const ALL_STATIONS_LIMIT = 500;

/** Wire shape to cache shape. Keeps every field — offline needs all of them. */
export function toCachedStation(api: ApiStation): CachedStation {
  return {
    id: api.id,
    name: api.name,
    region: api.region,
    district: api.district,
    lat: api.lat,
    lng: api.lng,
    contacts: (api.contacts ?? []).map((c) => ({
      phone: c.phone,
      responseRate: c.response_rate ?? 0,
      active: c.active ?? true,
    })),
  };
}

/**
 * The whole active station table.
 *
 * The endpoint requires coordinates and returns nearest-N, so this anchors at
 * Ghana's centroid with a limit above the real row count. Wasteful in principle,
 * free in practice at ~23 KB, and it needs no API change. If a bulk endpoint or
 * conditional GET is ever added, only this function changes.
 */
export async function fetchAllStations(): Promise<CachedStation[]> {
  const raw = await apiGet<ApiStation[] | null>("/v1/stations", {
    lat: GHANA_LAT,
    lng: GHANA_LNG,
    limit: ALL_STATIONS_LIMIT,
  });

  if (!Array.isArray(raw)) return [];

  if (raw.length >= ALL_STATIONS_LIMIT) {
    // The server truncates to `limit` nearest-to-anchor and gives no
    // total-count or pagination signal, so hitting the cap is indistinguishable
    // from a complete response. If this ever fires, the cached table is
    // incomplete and stations are silently missing offline: raise the limit, or
    // add a bulk endpoint.
    console.warn(
      `[stationsApi] received ${raw.length} stations, at or above the ${ALL_STATIONS_LIMIT} ` +
        `fetch limit — the station table may be truncated and the offline cache incomplete`
    );
  }

  return raw.map(toCachedStation);
}
