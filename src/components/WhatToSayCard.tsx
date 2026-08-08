import React, { useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "./ui/Text";
import { useTheme } from "../theme/ThemeContext";
import { useNearestStation } from "../hooks/useNearestStation";
import { useSavedPlaces } from "../hooks/useSavedPlaces";
import { whatToSay } from "../lib/whatToSay";
import type { SavedPlace } from "../lib/savedPlaces";

/**
 * Leads the script when the only position we have is an old one and there is
 * no saved place to offer instead. Says the one thing the derived lines below
 * it cannot say for themselves: that they describe where the phone was, not
 * where the caller is.
 */
const STALE_FIX_CAVEAT =
  "This is where your phone last had a signal — say so if you have moved.";

/**
 * Mirrors the `savedPlace` line format in `whatToSay.ts` exactly (`I'm at
 * ${label}.` plus the note, verbatim, when present). Needed only for the
 * picker below: `whatToSay` always needs a position to decide a saved place
 * is a match, and the picker exists precisely when there isn't a trustworthy
 * one — the caller is naming the place directly instead. Kept as a small
 * literal duplicate rather than calling `whatToSay` with the place's own
 * coordinates as a synthetic position, because two saved places with
 * overlapping radii could then have `whatToSay` report the *other* one as
 * nearer to itself than the one the caller actually picked.
 */
function linesForPlace(place: SavedPlace): string[] {
  const lines = [`I'm at ${place.label}.`];
  if (place.note.trim()) lines.push(place.note.trim());
  return lines;
}

/**
 * The words a caller reads to a dispatcher, surfaced directly below the call
 * button. Nothing here gates or delays dialling: both hooks are already
 * loaded by providers mounted at the app root, so this reads state that
 * exists already rather than starting any work of its own.
 *
 * Everything below turns on one question — *may this card assert, in the
 * present tense, where the caller is?* The operator covers a whole region and
 * cannot see them, so these sentences are the only thing that locates the
 * fire, and a confidently wrong one sends the truck to the wrong street. That
 * is worse than an empty space under the call button.
 *
 * Three inputs decide it, and they are read together rather than as separate
 * early returns, because they overlap:
 *
 *  - `positionSource === "implausible"` — the provider has already rejected
 *    this fix and the screen above says so out loud. Nothing derived from it
 *    can be true, so the card renders nothing at all.
 *  - `positionSource === "lastKnownStale"` — a last-known fix of *unbounded*
 *    age (see `resolvePosition`), which is the ordinary offline cold start:
 *    indoors, no wifi, GPS unable to lock. The fix may be three days and a
 *    city old. It is not deleted — it still names a real place — but it may
 *    not be spoken as a present-tense claim.
 *  - no position at all — nothing to derive from in the first place.
 *
 * In each of the latter two the caller themselves is the better sensor: they
 * can see out of a window. So if they have saved places, the card stops
 * asserting and asks — "Which of these are you at?" — and only if there are
 * none does it fall back to the derived lines, led by `STALE_FIX_CAVEAT`.
 *
 * A pick is an answer to "no trustworthy fix right now", so it lasts exactly
 * as long as that condition, and it is always reversible: mis-taps happen on
 * 48 px targets with shaking hands, and a wrong address the caller cannot
 * clear is the same failure as a wrong address the app invented.
 */
export function WhatToSayCard() {
  const { theme } = useTheme();
  const { position, positionSource, nearest } = useNearestStation();
  const { places } = useSavedPlaces();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const result = whatToSay(position, places, nearest);

  const isRejected = positionSource === "implausible";
  const isStale = positionSource === "lastKnownStale";
  // No fix, or one we may not speak in the present tense.
  const cannotAssert = isStale || result.kind === "none";

  // Asking beats guessing — but only when there is something to ask about,
  // and never for a fix already rejected, where the honest card is no card.
  const canPick = !isRejected && cannotAssert && places.length > 0;
  const picked = canPick
    ? places.find((p) => p.id === selectedId) ?? null
    : null;

  // Once a trustworthy fix arrives it supersedes the pick, and the pick must
  // not survive to be resurrected by a later stale spell — by then the caller
  // may be somewhere else entirely. Clearing it here rather than leaving it
  // parked in state is the difference between a stale answer and no answer.
  useEffect(() => {
    if (!canPick && selectedId !== null) setSelectedId(null);
  }, [canPick, selectedId]);

  const view = ((): {
    mode: "nothing" | "picker" | "script";
    caveat?: string;
    lines: string[];
    coords?: string;
    canChooseAgain: boolean;
  } => {
    if (isRejected) return { mode: "nothing", lines: [], canChooseAgain: false };

    if (canPick) {
      return picked
        ? {
            mode: "script",
            lines: linesForPlace(picked),
            canChooseAgain: true,
          }
        : { mode: "picker", lines: [], canChooseAgain: false };
    }

    if (result.kind === "none") {
      return { mode: "nothing", lines: [], canChooseAgain: false };
    }

    return {
      mode: "script",
      caveat: isStale ? STALE_FIX_CAVEAT : undefined,
      lines: result.lines,
      coords: result.kind === "derived" ? result.coords : undefined,
      canChooseAgain: false,
    };
  })();

  // Nothing to read aloud is nothing to render. Coordinates on their own are
  // not a script — that is what "Say this" over a lone lat/long was, for a
  // position the provider had already thrown away — and neither is a caveat
  // about a fix with no lines under it.
  if (view.mode === "nothing" || (view.mode === "script" && view.lines.length === 0)) {
    return null;
  }

  const isPicker = view.mode === "picker";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.background, borderColor: theme.border },
      ]}
    >
      <Text variant="heading3">
        {isPicker ? "Which of these are you at?" : "Say this"}
      </Text>

      {isPicker ? (
        <View style={styles.pickerList}>
          {places.map((place) => (
            <TouchableOpacity
              key={place.id}
              onPress={() => setSelectedId(place.id)}
              activeOpacity={0.7}
              style={[styles.pickerItem, { borderColor: theme.border }]}
              accessibilityRole="button"
              accessibilityLabel={`I'm at ${place.label}`}
            >
              <Text variant="bodyLarge" weight="semiBold" color={theme.textPrimary}>
                {place.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <>
          {view.caveat ? (
            <Text variant="bodyLarge" color={theme.textSecondary}>
              {view.caveat}
            </Text>
          ) : null}

          {view.lines.map((line, i) => (
            <Text key={i} variant="bodyLarge" color={theme.textPrimary}>
              {line}
            </Text>
          ))}

          {/* Same size as the spoken lines above: a misread digit here is
              roughly 11 km of road, which is not a caption-sized mistake. */}
          {view.coords ? (
            <Text variant="bodyLarge" color={theme.textSecondary} style={styles.coords}>
              {view.coords}
            </Text>
          ) : null}

          {view.canChooseAgain ? (
            <TouchableOpacity
              onPress={() => setSelectedId(null)}
              activeOpacity={0.7}
              style={styles.chooseAgain}
              accessibilityRole="button"
              accessibilityLabel="Not here? Choose again"
            >
              <Text variant="caption" weight="semiBold" color={theme.textSecondary}>
                Not here? Choose again
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  coords: {
    marginTop: -4,
  },
  pickerList: {
    gap: 8,
  },
  pickerItem: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  chooseAgain: {
    minHeight: 48,
    justifyContent: "center",
  },
});
