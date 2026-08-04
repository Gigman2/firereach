import { apiGet } from "./apiClient";
import {
  ApiStation,
  NATIONAL_EMERGENCY_PHONE,
  Station,
} from "./stationTypes";

/**
 * Narrows the wire shape to what the app renders and caches. district, lat,
 * lng, and contacts are deliberately dropped — nothing consumes them yet, and
 * adding them to the cached snapshot would require a schema version bump.
 */
export function toStation(api: ApiStation): Station {
  return {
    id: api.id,
    name: api.name,
    region: api.region,
    distanceMeters: Math.max(0, Math.round(api.distance_meters ?? 0)),
    phone: api.primary_phone || NATIONAL_EMERGENCY_PHONE,
  };
}

/**
 * Ghana's longest dimension is roughly 670 km, so a "nearest" station beyond
 * this is a bad GPS fix or a user outside the country — not a usable result.
 * Deliberately generous: OSM station coverage is sparse in rural areas and a
 * legitimate rural user must not be rejected.
 */
export const MAX_PLAUSIBLE_DISTANCE_METERS = 500_000;

/** Nearest stations first. Returns [] when the API has no active stations. */
export async function getNearestStations(
  lat: number,
  lng: number,
  limit = 3
): Promise<Station[]> {
  const raw = await apiGet<ApiStation[] | null>("/v1/stations", {
    lat,
    lng,
    limit,
  });

  if (!Array.isArray(raw)) return [];
  return raw
    .map(toStation)
    .filter((s) => s.distanceMeters <= MAX_PLAUSIBLE_DISTANCE_METERS);
}
