import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "./ui/Text";
import { useTheme } from "../theme/ThemeContext";
import { useNearestStation } from "../hooks/useNearestStation";
import { useSavedPlaces } from "../hooks/useSavedPlaces";
import { whatToSay } from "../lib/whatToSay";
import type { SavedPlace } from "../lib/savedPlaces";

/**
 * Mirrors the `savedPlace` line format in `whatToSay.ts` exactly (`I'm at
 * ${label}.` plus the note, verbatim, when present). Needed only for the
 * no-position picker below: `whatToSay` always needs a position to decide a
 * saved place is a match, and here there isn't one — the caller is naming the
 * place directly instead. Kept as a small literal duplicate rather than
 * calling `whatToSay` with the place's own coordinates as a synthetic
 * position, because two saved places with overlapping radii could then have
 * `whatToSay` report the *other* one as nearer to itself than the one the
 * caller actually picked.
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
 * Three shapes, in order of how good the answer is:
 *  - A saved place matched by position: read its label and note verbatim.
 *  - No match, but a position: fall back to district/region/bearing.
 *  - No position at all: if there are saved places, let the caller say which
 *    one they're at instead of guessing from a fix that doesn't exist. If
 *    there are no places either, render nothing — a card with nothing true to
 *    say is worse than no card.
 */
export function WhatToSayCard() {
  const { theme } = useTheme();
  const { position, nearest } = useNearestStation();
  const { places } = useSavedPlaces();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const result = whatToSay(position, places, nearest);

  // The manual pick only applies while there is no derivable answer. Once a
  // real position resolves, whatToSay's own (fresher, radius-checked) answer
  // takes over rather than a possibly-stale earlier tap.
  const selected =
    result.kind === "none"
      ? places.find((p) => p.id === selectedId) ?? null
      : null;

  if (result.kind === "none" && !selected && places.length === 0) {
    return null;
  }

  const isPicker = result.kind === "none" && !selected;
  const lines = isPicker
    ? []
    : selected
    ? linesForPlace(selected)
    : result.kind !== "none"
    ? result.lines
    : [];
  const coords = result.kind === "derived" ? result.coords : undefined;

  // Belt and braces against the "no station, unparseable position" corner of
  // `derived` that real GPS output cannot reach: nothing to read aloud and no
  // picker to fall back to must still not render an empty box.
  if (!isPicker && lines.length === 0 && !coords) {
    return null;
  }

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
          {lines.map((line, i) => (
            <Text key={i} variant="bodyLarge" color={theme.textPrimary}>
              {line}
            </Text>
          ))}
          {coords ? (
            <Text variant="caption" color={theme.textSecondary} style={styles.coords}>
              {coords}
            </Text>
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
});
