/**
 * The spacing scale the app already uses, written down.
 *
 * These are not new numbers. Every value here was read out of the existing
 * screens, which had converged on the same handful — 8, 12, 16, 20, 24, 32,
 * 40, 48, 60 — without anywhere saying so. Naming them is what lets a shared
 * layout file exist at all: before this, two screens that looked identical
 * were only coincidentally identical, and nothing stopped the next one using
 * 26.
 *
 * Named by role rather than by t-shirt size for the layout constants, because
 * `screenX` tells you where 24 belongs and `xl` does not.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const layout = {
  /** Horizontal padding for a screen's own edges. */
  screenX: 24,
  /** Horizontal padding for centred content that wants to be narrower. */
  contentX: 32,
  /**
   * Top padding on onboarding headers. These screens predate
   * `useSafeAreaInsets` and hardcode a value that clears a notch; the rest of
   * the app uses the hook. Left as-is here because changing it is a visual
   * decision, not a refactor.
   */
  headerTop: 60,
  /** Bottom padding above the home indicator on a footer. */
  footerBottom: 40,
} as const;
