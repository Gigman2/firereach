import { haversineMeters, bearingDegrees, compassPoint } from "./geo";
import { formatDistance, formatCoords } from "./format";
import type { SavedPlace } from "./savedPlaces";
import type { RankedStation } from "./stationTypes";

export type SpeakableLocation =
  | { kind: "savedPlace"; label: string; landmarks: string[]; lines: string[] }
  | { kind: "derived"; lines: string[]; coords: string }
  | { kind: "none" };

/**
 * Beyond this, the nearest station's district says nothing about where the
 * caller is, so it is not claimed at all.
 *
 * The district comes from the *station*, not from the position — there is no
 * reverse-geocoder here — so "I'm in {district}" is only ever an inference
 * from "the nearest station is in {district}". Ghanaian districts run roughly
 * 20–60 km across, the position provider admits a fix up to 500 km from a
 * station (MAX_PLAUSIBLE_DISTANCE_METERS), and much of the country is more
 * than 50 km from any seeded station. Unbounded, a caller in Kumasi was told
 * to say "I'm in La-Nkwantanang-Madina Municipal District, Greater Accra
 * Region." and then, in the very next breath, "About ~196.1 km north-west of
 * Madina Fire Station." — two sentences that contradict each other, read
 * aloud in sequence to an operator who cannot see the caller.
 *
 * 10 km is deliberately conservative: comfortably inside any district's own
 * extent, so a claim that survives it is one the caller can stand behind.
 * Past it the bearing line and the coordinates carry the whole answer, and
 * both stay true at any distance.
 */
export const DISTRICT_CLAIM_MAX_METERS = 10_000;

/**
 * At or below this, say "I'm right by {station}" instead of a distance and a
 * bearing.
 *
 * Two reasons, and either alone would be enough. `formatDistance` returns the
 * sentence *fragment* "Less than 100 m" under this same threshold, which
 * interpolated into the bearing template produced "About Less than 100 m
 * north-west of Madina Fire Station." — read aloud, mid-emergency. And a
 * compass bearing over a few dozen metres is noise: it is derived from a fix
 * whose own accuracy is usually worse than the distance being described.
 *
 * Set to cover `formatDistance`'s fragment range on purpose: it emits the
 * fragment below 100, this branch catches everything at or below 100, so every
 * input that would produce the fragment is handled here.
 * `formatDistance` itself is shared and correct for its own callers, so it is
 * not the thing that changes.
 */
export const NEAR_STATION_MAX_METERS = 100;

/**
 * The words a caller reads to a dispatcher.
 *
 * This exists because the numbers in the dataset are regional command lines:
 * whoever answers covers a whole region and cannot see the caller. Choosing
 * the nearest station changes no dialled digits — what the caller says is the
 * only thing that locates them.
 *
 * Order matters. A saved place wins outright, because the user's own
 * landmarks beat anything derived. Nothing is ever paraphrased: each
 * landmark is pushed as its own line, verbatim, in the order it was saved —
 * a regional operator triangulates off whichever one they happen to
 * recognise, so three short lines read one at a time serve that better than
 * one line joining them together would.
 *
 * Every derived line is bounded by how far the caller is from the station the
 * line is derived from, because a confidently wrong sentence sends the truck
 * to the wrong place and is worse than no sentence at all. See
 * `DISTRICT_CLAIM_MAX_METERS` and `NEAR_STATION_MAX_METERS`. The coordinates
 * are the one part that is true at any distance, so they are always returned.
 *
 * This function knows nothing about how fresh the position is. A caller
 * holding a stale fix must not present these lines as a present-tense claim —
 * `WhatToSayCard` is where that judgement is made, from `positionSource`.
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
    // Tie-broken on id, matching nearestStations in geo.ts. haversineMeters
    // rounds to whole metres, so two places genuinely can tie; without this
    // the winner depends on the order the array happens to be stored in.
    .sort((a, b) => (a.d !== b.d ? a.d - b.d : a.p.id.localeCompare(b.p.id)));

  if (matches.length > 0) {
    const { p } = matches[0];
    const lines = [`I'm at ${p.label}.`];
    for (const landmark of p.landmarks) {
      const trimmed = landmark.trim();
      if (trimmed) lines.push(trimmed);
    }
    return { kind: "savedPlace", label: p.label, landmarks: p.landmarks, lines };
  }

  const lines: string[] = [];
  const coords = formatCoords(position.lat, position.lng) ?? "";

  if (nearest) {
    const metres = haversineMeters(
      nearest.lat,
      nearest.lng,
      position.lat,
      position.lng
    );
    const measured = Number.isFinite(metres);

    // Claimed only when the caller is plausibly inside it — see
    // DISTRICT_CLAIM_MAX_METERS. An unmeasurable distance cannot clear the
    // bound, so it does not get the benefit of the doubt either.
    if (measured && metres <= DISTRICT_CLAIM_MAX_METERS) {
      lines.push(`I'm in ${nearest.district}, ${nearest.region}.`);
    }

    if (measured && metres <= NEAR_STATION_MAX_METERS) {
      lines.push(`I'm right by ${nearest.name}.`);
    } else {
      const distance = formatDistance(metres, { suffix: false });
      const direction = compassPoint(
        bearingDegrees(nearest.lat, nearest.lng, position.lat, position.lng)
      );
      if (distance && direction) {
        lines.push(`About ${distance} ${direction} of ${nearest.name}.`);
      }
    }
  }

  return { kind: "derived", lines, coords };
}
