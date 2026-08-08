/**
 * A distance for display, or `null` when there is nothing honest to show.
 *
 * `null` rather than a placeholder string is deliberate: the caller decides
 * whether to render, and there is no way to accidentally paint "unavailable"
 * into a badge that is supposed to carry a real number. The previous home-screen
 * version returned "Distance unavailable" for anything `<= 0`, which told a user
 * standing at a fire station that we did not know where it was.
 *
 * `suffix` controls only the trailing " away" — the arithmetic and thresholds
 * are computed once regardless, so the two call sites (the home card and the
 * Stations tab, which has no room for the suffix beside a full station name)
 * can never drift into computing different values again.
 */
export function formatDistance(
  meters: number,
  options: { suffix?: boolean } = {}
): string | null {
  const { suffix = true } = options;
  if (!Number.isFinite(meters) || meters < 0) return null;
  const tail = suffix ? " away" : "";
  if (meters < 100) return `Less than 100 m${tail}`;
  if (meters < 1000) return `~${Math.round(meters)} m${tail}`;
  return `~${(meters / 1000).toFixed(1)} km${tail}`;
}

/**
 * A latitude/longitude pair as a hemisphere-qualified string —
 * `6.8086° N, 2.5160° W`.
 *
 * The absolute value plus an N/S/E/W letter is not decoration. Ghana straddles
 * the Greenwich meridian, so roughly the western half of the country has a
 * negative longitude. Printing it raw gives `-2.5160`, which reads as a typo or
 * a bug to anyone saying it out loud — and saying it out loud is the only
 * reason to render coordinates in this app at all.
 *
 * Currently unused: this moved here when the station detail screen dropped its
 * coordinate readout, which showed the *station's* position — a thing nobody
 * needs, since the truck comes to the caller. It is kept for the deferred
 * "what to say on the call" work, which needs the *user's* position in a form
 * they can read to a dispatcher.
 */
export function formatCoords(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}
