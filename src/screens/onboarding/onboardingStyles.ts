import type { ViewStyle } from "react-native";
import { space, layout } from "../../theme/spacing";

/**
 * The layout every onboarding screen was rebuilding for itself.
 *
 * Six screens each declared their own `container: { flex: 1 }`, their own
 * `spacer: { flex: 1 }`, and their own header with the same four paddings —
 * differing only in how the header's children were justified. Three declared
 * a byte-identical `actions` block. Nothing said they were meant to match, so
 * they matched by luck, and the fifth onboarding step added recently got its
 * header metrics right only because it was copied from a neighbour.
 *
 * Plain frozen objects rather than `StyleSheet.create`, deliberately: React
 * Native accepts them anywhere a registered style goes, and it keeps this file
 * testable in plain Node, which matters because this project's Jest is scoped
 * to pure modules and cannot import a screen.
 *
 * Compose, do not fork: `style={[onboarding.header, styles.headerTweak]}`.
 * Anything genuinely specific to one screen stays in that screen.
 */

/** Root view of a screen. */
export const screen: ViewStyle = { flex: 1 };

/**
 * Takes the slack between fixed chrome. Used both as the growing middle of a
 * screen and as an explicit spacer before a footer — they were separate
 * `mainContent` and `spacer` keys that resolved to the same thing.
 */
export const fill: ViewStyle = { flex: 1 };

/** Shared header metrics. Not used alone — pick one of the two below. */
const headerBase: ViewStyle = {
  flexDirection: "row",
  paddingHorizontal: layout.screenX,
  paddingTop: layout.headerTop,
  paddingBottom: space.sm,
};

/** A header with one control on the left. */
export const header: ViewStyle = { ...headerBase };

/** Back on the left, skip or close on the right. */
export const headerSplit: ViewStyle = {
  ...headerBase,
  justifyContent: "space-between",
  alignItems: "center",
};

/** A single control pushed to the right. */
export const headerEnd: ViewStyle = {
  ...headerBase,
  justifyContent: "flex-end",
};

/** The primary button group at the bottom of a step. */
export const actions: ViewStyle = {
  paddingHorizontal: layout.contentX,
  paddingTop: layout.contentX,
  gap: space.lg,
};

/** Footer for screens that place their own buttons rather than using actions. */
export const footer: ViewStyle = {
  paddingHorizontal: layout.screenX,
  paddingBottom: layout.footerBottom,
  gap: space.xl,
};

/** The progress dots row. */
export const dotsRow: ViewStyle = {
  alignItems: "center",
  paddingVertical: layout.contentX,
  marginBottom: 32,
};

/**
 * A centred circle for a hero icon. A helper rather than a constant because
 * the flow uses three sizes (96, 128, 192) and the radius must track the size
 * — the one thing in here that was actually easy to get wrong by hand.
 */
export function iconCircle(size: number): ViewStyle {
  return {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: "center",
    justifyContent: "center",
  };
}
