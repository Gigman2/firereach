import React, { useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { MapPinIcon } from "phosphor-react-native";
import { Text } from "./ui/Text";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { useNearestStation } from "../hooks/useNearestStation";
import { useSavedPlaces } from "../hooks/useSavedPlaces";
import { whatToSay, savedPlaceLines } from "../lib/whatToSay";

/**
 * Leads the script when the only position we have is an old one and there is
 * no saved place to offer instead. Says the one thing the derived lines below
 * it cannot say for themselves: that they describe where the phone was, not
 * where the caller is.
 */
const STALE_FIX_CAVEAT =
  "This is where your phone last had a signal — say so if you have moved.";

/**
 * What a dispatcher asks for after the location, in the order they ask it.
 * From a Ghana National Fire Service briefing on being "call ready".
 *
 * The app cannot answer a single one of these and never will: they describe a
 * situation that has not happened yet. What it can do is make sure the caller
 * is not hearing the question for the first time while a building burns. So
 * these are prompts, deliberately phrased as the questions themselves rather
 * than as sentences — nothing here is meant to be read aloud, and anything
 * that looked like a script would get read out as one.
 *
 * Kept short enough to be taken in at a glance. A caller who has to *read*
 * this list has already lost the seconds it was meant to save.
 *
 * Each carries an example, because "what is burning" is a question someone
 * under pressure can answer far too vaguely — "a fire", "everything" — and one
 * concrete answer shows the *grain* expected better than any instruction to be
 * specific would. They are set quieter than the questions and in quotes, so
 * they read as an illustration of the kind of answer rather than an answer to
 * give: the caller's own situation is the only true one.
 */
const CALL_READY_PROMPTS: { ask: string; example: string }[] = [
  { ask: "What is happening", example: "a fire in my kitchen" },
  { ask: "What is burning", example: "a gas cylinder" },
  // Not just "second floor": the number of floors is what tells them what
  // they are bringing.
  { ask: "Which floor", example: "second floor of three" },
  { ask: "Is anyone trapped", example: "two people upstairs" },
];

/**
 * What a caller needs in front of them to make the call, surfaced directly
 * below the call button. Nothing here gates or delays dialling: both hooks are
 * already loaded by providers mounted at the app root, so this reads state
 * that exists already rather than starting any work of its own.
 *
 * Two halves, divided by a rule. Above it, the words to read out — which is
 * only ever the caller's location, because that is the only part of a call
 * this app can know. Below it, `CALL_READY_PROMPTS`: the questions that come
 * next, which it can never answer and does not pretend to. Everything from
 * here to that rule is about the first half.
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
 *    this fix and the screen above says so out loud. Nothing *derived* from it
 *    can be true, so there are no derived lines; but the caller can still be
 *    asked, and this is the state where asking is worth the most.
 *  - `positionSource === "lastKnownStale"` — a last-known fix of *unbounded*
 *    age (see `resolvePosition`), which is the ordinary offline cold start:
 *    indoors, no wifi, GPS unable to lock. The fix may be three days and a
 *    city old. It is not deleted — it still names a real place — but it may
 *    not be spoken as a present-tense claim.
 *  - no position at all — nothing to derive from in the first place.
 *
 * In every one of the three the caller themselves is the better sensor: they
 * can see out of a window. So if they have saved places, the card stops
 * asserting and asks — "Where are you?" — and only if there are none does it
 * fall back to the derived lines, qualified by `STALE_FIX_CAVEAT`, or to
 * nothing at all where even those cannot be trusted.
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
  // No fix, none we may speak in the present tense, or one already rejected.
  const cannotAssert = isStale || isRejected || result.kind === "none";

  // Asking beats guessing, whenever there is something to ask about.
  //
  // A rejected fix used to suppress this too, on the reasoning that nothing
  // derived from a bad fix can be true. That is right about the derived lines
  // below and wrong about the picker: a pick is the caller's own answer and is
  // not derived from the fix at all. Suppressing it meant the one state where
  // the app is least sure where the caller is was also the one state where it
  // refused to let them say.
  const canPick = cannotAssert && places.length > 0;
  const picked = canPick
    ? (places.find((p) => p.id === selectedId) ?? null)
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
    if (canPick) {
      return picked
        ? {
            mode: "script",
            lines: savedPlaceLines(picked),
            canChooseAgain: true,
          }
        : { mode: "picker", lines: [], canChooseAgain: false };
    }

    // Below the picker, not above it. A rejected fix still cannot produce a
    // spoken line — everything past this point is derived from the position —
    // so with nothing to ask about, the honest card remains no card.
    if (isRejected)
      return { mode: "nothing", lines: [], canChooseAgain: false };

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
  if (
    view.mode === "nothing" ||
    (view.mode === "script" && view.lines.length === 0)
  ) {
    return null;
  }

  const isPicker = view.mode === "picker";

  /**
   * The saved place the script is currently speaking for — one the caller
   * picked by hand, or one `whatToSay` matched by radius. Null for a derived
   * script, where there is no saved place to name and the row is not shown.
   */
  const activeLabel = isPicker
    ? null
    : (picked?.label ?? (result.kind === "savedPlace" ? result.label : null));

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.background, borderColor: theme.border },
      ]}
    >
      {/*
        The active saved location, named on its own line above the script.
        The label also appears inside the first spoken line, and the repetition
        is deliberate: this row is the app telling the caller which place it
        has assumed — a thing they can check at a glance and correct — while
        the line below is speech, which has to be a whole sentence to be read
        aloud. Collapsing them would cost one or the other.
      */}
      {activeLabel ? (
        <View style={styles.activeRow}>
          <MapPinIcon size={15} color={colors.brandPrimary} weight="fill" />
          <Text
            variant="caption"
            weight="semiBold"
            color={colors.brandPrimary}
            numberOfLines={1}
            style={styles.activeLabel}
          >
            {activeLabel}
          </Text>

          {view.canChooseAgain ? (
            <TouchableOpacity
              onPress={() => setSelectedId(null)}
              activeOpacity={0.7}
              // 16 px of text plus 28 of slop clears a 44 px target without
              // the row growing to accommodate it.
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="Not here? Choose another place"
            >
              <Text
                variant="label"
                weight="semiBold"
                color={theme.textSecondary}
              >
                Change
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/*
        An eyebrow rather than a heading. What it says matters — these are
        words to read out, not a status — but it is an instruction read once,
        and it was previously set larger and heavier than the sentences it
        introduces, which inverted the hierarchy on the one card whose whole
        job is the sentences.
      */}
      <Text variant="label" color={theme.textTertiary} style={styles.eyebrow}>
        {isPicker ? "WHERE ARE YOU?" : "SAY THIS TO THE OPERATOR"}
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
              <Text
                variant="bodyMedium"
                weight="semiBold"
                color={theme.textPrimary}
              >
                {place.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.script}>
          {view.lines.map((line, i) => (
            <Text key={i} variant="bodyMedium" color={theme.textPrimary}>
              {line}
            </Text>
          ))}

          {/* Same size as the spoken lines above: a misread digit here is
              roughly 11 km of road, which is not a caption-sized mistake. */}
          {view.coords ? (
            <Text variant="bodyMedium" color={theme.textSecondary}>
              {view.coords}
            </Text>
          ) : null}
        </View>
      )}

      {/*
        Below the script, and smaller than it. This is advice to the caller —
        "say so if you have moved" — not a line to be read out, and setting it
        at the same size as the script invited it to be read out as one.
      */}
      {view.caveat ? (
        <Text variant="caption" color={theme.textSecondary}>
          {view.caveat}
        </Text>
      ) : null}

      {/*
        Behind a rule, and styled as questions rather than sentences, because
        the one thing that must not happen on this card is a caller reading
        "What is burning" out to an operator. Everything above the rule is
        speech; everything below it is what they will be asked for next.

        Not shown while picking: that card is asking the caller a question of
        its own, and stacking four more under it would bury the one they have
        to answer to get a location at all.
      */}
      {!isPicker ? (
        <View style={[styles.alsoAsk, { borderTopColor: theme.divider }]}>
          <Text
            variant="label"
            color={theme.textTertiary}
            style={styles.eyebrow}
          >
            THEY WILL ALSO ASK
          </Text>
          {CALL_READY_PROMPTS.map(({ ask, example }) => (
            <View key={ask} style={styles.promptRow}>
              <View
                style={[
                  styles.promptDot,
                  { backgroundColor: theme.textTertiary },
                ]}
              />
              <Text
                variant="caption"
                color={theme.textSecondary}
                style={styles.promptText}
              >
                {ask}
                {/* variant repeated deliberately: `Text` defaults to
                    bodyMedium, and an unqualified nested one would set the
                    example two sizes above the question it belongs to. */}
                <Text variant="caption" color={theme.textTertiary}>
                  {`  “${example}”`}
                </Text>
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    // Separates the card's three parts — place, eyebrow, script. The gap
    // between the spoken lines themselves is `script` below, and much
    // tighter: a single card-level gap of 12 applied between every line
    // turned a two-line address into something the eye read as two separate
    // statements.
    gap: 8,
  },
  activeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  /** Takes the slack so "Change" sits at the far edge. */
  activeLabel: {
    flex: 1,
  },
  eyebrow: {
    letterSpacing: 0.8,
  },
  /**
   * The spoken lines are one block of speech, so they are spaced as
   * paragraphs of one passage rather than as separate elements. The 24 px
   * line height of `bodyMedium` is already doing most of the separating.
   */
  script: {
    gap: 2,
  },
  /**
   * The rule is the point: it is what keeps a prompt from being mistaken for
   * a line of the script above it. `paddingTop` on top of the card's own gap
   * gives the break more room than any other seam on the card.
   */
  alsoAsk: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 5,
  },
  /**
   * Top-aligned, not centred: a question and its example can wrap to two
   * lines on a narrow phone, and a centred bullet would then float against
   * the middle of the pair instead of marking where it starts.
   */
  promptRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  promptDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    // Centres the dot on the first line of a 20 px line-height caption.
    marginTop: 8,
  },
  /** Wraps within its own column rather than pushing the bullet off-row. */
  promptText: {
    flex: 1,
  },
  pickerList: {
    gap: 8,
  },
  /**
   * 48 deliberately survives the tightening everywhere else on this card:
   * this is the one thing on it that gets tapped, by someone whose hands are
   * shaking, and a mis-tap here is a wrong address read to an operator.
   */
  pickerItem: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
});
