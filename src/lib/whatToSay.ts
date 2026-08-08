import { haversineMeters, bearingDegrees, compassPoint } from "./geo";
import { formatDistance, formatCoords } from "./format";
import type { SavedPlace } from "./savedPlaces";
import type { RankedStation } from "./stationTypes";

export type SpeakableLocation =
  | { kind: "savedPlace"; label: string; note: string; lines: string[] }
  | { kind: "derived"; lines: string[]; coords: string }
  | { kind: "none" };

/**
 * The words a caller reads to a dispatcher.
 *
 * This exists because the numbers in the dataset are regional command lines:
 * whoever answers covers a whole region and cannot see the caller. Choosing
 * the nearest station changes no dialled digits — what the caller says is the
 * only thing that locates them.
 *
 * Order matters. A saved place wins outright, because the user's own landmark
 * beats anything derived. Nothing is ever paraphrased: `note` is passed
 * through exactly as typed.
 */
export function whatToSay(
  position: { lat: number; lng: number } | null,
  places: SavedPlace[],
  nearest: RankedStation | null
): SpeakableLocation {
  if (
    !position ||
    !Number.isFinite(position.lat) ||
    !Number.isFinite(position.lng)
  ) {
    return { kind: "none" };
  }

  const matches = places
    .map((p) => ({
      p,
      d: haversineMeters(position.lat, position.lng, p.lat, p.lng),
    }))
    .filter(({ p, d }) => Number.isFinite(d) && d <= p.radiusMeters)
    .sort((a, b) => a.d - b.d);

  if (matches.length > 0) {
    const { p } = matches[0];
    const lines = [`I'm at ${p.label}.`];
    if (p.note.trim()) lines.push(p.note.trim());
    return { kind: "savedPlace", label: p.label, note: p.note, lines };
  }

  const lines: string[] = [];
  const coords = formatCoords(position.lat, position.lng) ?? "";

  if (nearest) {
    lines.push(`I'm in ${nearest.district}, ${nearest.region}.`);
    const metres = haversineMeters(
      nearest.lat,
      nearest.lng,
      position.lat,
      position.lng
    );
    const distance = formatDistance(metres, { suffix: false });
    const direction = compassPoint(
      bearingDegrees(nearest.lat, nearest.lng, position.lat, position.lng)
    );
    if (distance) {
      lines.push(`About ${distance} ${direction} of ${nearest.name}.`);
    }
  }

  return { kind: "derived", lines, coords };
}
