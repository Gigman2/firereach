/**
 * A distance for display, or `null` when there is nothing honest to show.
 *
 * `null` rather than a placeholder string is deliberate: the caller decides
 * whether to render, and there is no way to accidentally paint "unavailable"
 * into a badge that is supposed to carry a real number. The previous home-screen
 * version returned "Distance unavailable" for anything `<= 0`, which told a user
 * standing at a fire station that we did not know where it was.
 */
export function formatDistance(meters: number): string | null {
  if (!Number.isFinite(meters) || meters < 0) return null;
  if (meters < 100) return "Less than 100 m away";
  if (meters < 1000) return `~${Math.round(meters)} m away`;
  return `~${(meters / 1000).toFixed(1)} km away`;
}
