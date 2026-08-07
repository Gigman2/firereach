/** Metres. Matches earthRadiusKm * 1000 in the Go implementation. */
const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

export type GeoPoint = { lat: number; lng: number };

/**
 * Great-circle distance in whole metres. Ported from
 * api/internal/usecase/station/list_nearest.go — same radius, same formula,
 * same rounding — so an offline result equals what the server would have said.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Nearest `limit` stations, nearest first, each carrying its distance.
 * Copies before sorting so the caller's array is untouched, and breaks
 * distance ties on `id` so the ordering does not depend on input order.
 */
export function nearestStations<T extends GeoPoint & { id: string }>(
  stations: T[],
  lat: number,
  lng: number,
  limit: number
): (T & { distanceMeters: number })[] {
  return stations
    .map((s) => ({
      ...s,
      distanceMeters: haversineMeters(lat, lng, s.lat, s.lng),
    }))
    .sort((a, b) =>
      a.distanceMeters !== b.distanceMeters
        ? a.distanceMeters - b.distanceMeters
        : a.id.localeCompare(b.id)
    )
    .slice(0, Math.max(0, limit));
}
