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

/** "a", "a and b", "a, b and c" — no Oxford comma, because it is spoken. */
function joinSpoken(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The one sentence a caller reads aloud for a saved place.
 *
 * One sentence, not a list. Each landmark used to be its own line, on the
 * reasoning that an operator triangulates off whichever one they happen to
 * recognise and would hear three short lines better than one joined one. In
 * practice the caller is the one reading, under stress, and a stack of
 * fragments — "I'm around" / "Airport west hotel" / "Close to Fedex" — is not
 * something anyone speaks naturally. Joined, it comes out as the sentence they
 * would have said themselves, and the operator still hears every landmark, in
 * the order it was saved.
 *
 * The landmarks stay verbatim inside it. Only trailing punctuation is dropped,
 * and only so that a landmark someone ended with a full stop does not produce
 * "Opposite frigo., and ..." — the words themselves are never touched, because
 * they are the caller's own and the only part of this that locates the fire.
 *
 * The label is deliberately NOT in the sentence. "I'm around Work." tells a
 * regional operator nothing — it is the caller's private name for a place, and
 * it belongs in the app's own UI, which is where `WhatToSayCard` now shows it.
 * A place with no landmarks at all is the one exception: the label is then the
 * only thing there is to say.
 *
 * Exported so `WhatToSayCard` can build the same sentence for a place the
 * caller picked by hand, where there is no position to match against. It used
 * to keep its own copy of this format under a comment demanding they stay
 * byte-for-byte identical; a sentence with this much punctuation in it is not
 * something to maintain in two places.
 */
export function savedPlaceLines(
  place: Pick<SavedPlace, "label" | "landmarks">,
): string[] {
  const landmarks = place.landmarks
    .map((l) => l.trim().replace(/[.,;]+$/, "").trim())
    .filter((l) => l.length > 0);

  const subject = landmarks.length > 0 ? joinSpoken(landmarks) : place.label;
  return [`I'm around ${subject}.`];
}

/**
 * The words a caller reads to a dispatcher.
 *
 * This exists because the numbers in the dataset are regional command lines:
 * whoever answers covers a whole region and cannot see the caller. Choosing
 * the nearest station changes no dialled digits — what the caller says is the
 * only thing that locates them.
 *
 * Order matters. A saved place wins outright, because the user's own
 * landmarks beat anything derived, and it returns one spoken sentence built
 * by `savedPlaceLines` — see there for why the landmarks are joined rather
 * than listed. Nothing is ever paraphrased either way: the landmarks appear
 * verbatim, in the order they were saved.
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
  nearest: RankedStation | null,
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
    return {
      kind: "savedPlace",
      label: p.label,
      landmarks: p.landmarks,
      lines: savedPlaceLines(p),
    };
  }

  const lines: string[] = [];
  const coords = formatCoords(position.lat, position.lng) ?? "";

  if (nearest) {
    const metres = haversineMeters(
      nearest.lat,
      nearest.lng,
      position.lat,
      position.lng,
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
        bearingDegrees(nearest.lat, nearest.lng, position.lat, position.lng),
      );
      if (distance && direction) {
        lines.push(`About ${distance} ${direction} of ${nearest.name}.`);
      }
    }
  }

  return { kind: "derived", lines, coords };
}
