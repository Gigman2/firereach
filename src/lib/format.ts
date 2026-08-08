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
