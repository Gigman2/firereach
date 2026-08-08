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

/**
 * Initial great-circle bearing from A to B, degrees clockwise from north.
 *
 * Used to describe where the caller is relative to a station the dispatcher
 * knows — "north-east of Madina station" — so the direction runs station to
 * caller, and callers pass the arguments in that order.
 */
export function bearingDegrees(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(fromLat);
  const φ2 = toRad(toLat);
  const Δλ = toRad(toLng - fromLng);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  // atan2(0, 0) is 0, so identical points give north rather than NaN.
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

const POINTS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
] as const;

/**
 * Eight points, spelled out. Someone is reading this down a phone line while
 * a fire burns; "NE" is not a word.
 */
export function compassPoint(bearing: number): string {
  // NaN would index the array out of range and return undefined, which
  // reaches a caller as the literal "undefined" in a sentence read to a
  // dispatcher. bearingDegrees never emits NaN, but this is exported on its
  // own and the cost of not depending on that is one line.
  if (!Number.isFinite(bearing)) return "";
  const norm = ((bearing % 360) + 360) % 360;
  return POINTS[Math.round(norm / 45) % 8];
}
