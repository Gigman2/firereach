# FireReach Phase 2 — What To Say On The Call

**Date:** 2026-08-08
**Status:** Approved, ready for implementation planning
**Scope:** `app/` only. The `api/` repository is not touched. No account, no server state.

## Problem

Phase 1 made sure a caller always has a number to dial. It did nothing about the harder half.

Ghana's formal addressing is weak, so dispatchers work from landmarks. A caller in an emergency has to compose that sentence from nothing, while panicking, and often gets it wrong or freezes.

**A discovery during Phase 1 makes this sharper than the original design assumed.** The numbers in the dataset are *regional command lines*, not per-station direct lines — 18 distinct numbers across 57 stations, none unique to a station, one shared set per region (`src/data/stations.bundled.NOTICE.md`). Whoever answers covers a whole region and has no idea which station you are near. Picking the nearest station changes zero dialled digits. **What the caller says is the only thing that locates them.**

This is therefore not a convenience feature. It is the half of the product that Phase 1 deferred.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Saved places**, a short list of `{label, lat, lng, landmarks, radiusMeters}` | A single landmark captured at onboarding only helps if the emergency happens where you onboarded. "Home", "Shop", "Mum's house" covers where people actually are. |
| 2 | **One optional onboarding screen**, after `LocationRequest`, before `OnboardingReady` | Best capture rate — most users end up with exactly one place saved. Skippable, and skipped automatically when there is no position to seed from. |
| 3 | **Per-place radius**, default 300 m, chosen from four presets | A shop front is a point; a farm or compound is not. Presets rather than a text field, so it stays a tap. |
| 4 | **Fallback: district, region, and bearing from the nearest station**, with coordinates underneath | A dispatcher knows their own stations. "About 5 km north-east of Madina station" is actionable in a way four-decimal coordinates read aloud are not. |
| 5 | **Everything derived on-device** | The position never leaves the phone. That promise is already made verbatim on `LocationRequestScreen` and is currently true; this feature must not be what breaks it. |
| 6 | **The card never gates the call button** | It renders below. Nothing about it may add a tap or a delay before dialling. |
| 7 | **No new dependency** | Bearing is arithmetic. Storage is the AsyncStorage already in use. |

## Architecture

### Data model

```ts
export const SAVED_PLACES_VERSION = 1 as const;

export type SavedPlace = {
  id: string;
  /** The user's own word for it — "Home", "Shop", "Mum's house". */
  label: string;
  lat: number;
  lng: number;
  /**
   * The user's own landmarks, read aloud verbatim, one line each. Up to
   * MAX_LANDMARKS (3) — a regional operator triangulates, so a caller who can
   * offer three reference points is easier to place than one who offers one.
   */
  landmarks: string[];
  /** How close counts as being here. Default 300. */
  radiusMeters: number;
};

export type SavedPlacesFile = {
  schemaVersion: typeof SAVED_PLACES_VERSION;
  places: SavedPlace[];
};
```

Stored in AsyncStorage under one key. A corrupt or version-mismatched read yields an empty list rather than throwing — same posture as `readStationTable`, and the consequence of failure is only that the card falls back.

**Radius presets:** 100 m, 300 m, 1 km, 2 km. 300 is the default and is pre-selected.

**Cap:** 10 places. Enough for a real life, small enough that the nearest-place scan stays trivial and the Settings list stays readable.

### Geometry — `src/lib/geo.ts`

`haversineMeters` already exists and is verified against the Go implementation. Two additions:

```ts
/** Initial great-circle bearing from A to B, in degrees clockwise from north. */
export function bearingDegrees(fromLat, fromLng, toLat, toLng): number;

/** "north", "north-east", … — spoken words, not "NE", because this is read aloud. */
export function compassPoint(bearing: number): string;
```

Bearing runs **from the station to the caller**, because that is the direction the sentence describes: *"north-east of Madina station"*.

### The script — `src/lib/whatToSay.ts`

One pure function, no I/O, fully testable:

```ts
export type SpeakableLocation =
  | { kind: "savedPlace"; label: string; landmarks: string[]; lines: string[] }
  | { kind: "derived"; lines: string[]; coords: string }
  | { kind: "none" };

export function whatToSay(
  position: { lat: number; lng: number } | null,
  places: SavedPlace[],
  nearest: RankedStation | null,
): SpeakableLocation;
```

Resolution order:

1. **Inside a saved place's own radius** → that place. Nearest wins if several match. Renders the label, then each landmark verbatim on its own line; the app never paraphrases them.
2. **A position but no matching place** → district and region from the nearest station, plus distance and compass bearing from it, plus coordinates.
3. **No position at all** → `kind: "none"`. The card is replaced by the picker below.

### The card — `src/components/WhatToSayCard.tsx`

Sits on the home screen directly below the call button. Headed **"Say this"**. Renders each line large enough to read under stress — `bodyLarge`, high contrast, never `textTertiary`.

**No-position picker.** When there is no position but places are saved, the card becomes *"Which of these are you at?"* with one tap-target per place; tapping shows that place's lines. This is the denied-permission and no-fix case, and it is the one state where the app otherwise has nothing to offer — the caller still knows where they are, they just need the words.

### Screens

| File | Responsibility |
|---|---|
| `src/screens/onboarding/SavePlaceScreen.tsx` | New, 5th onboarding step. Seeds one place from the current position. Skippable. |
| `src/screens/settings/SavedPlacesScreen.tsx` | New. List, add, edit, delete. Reached from Settings. |
| `src/components/WhatToSayCard.tsx` | New. The card and its picker. |
| `src/hooks/useSavedPlaces.tsx` | New. Provider, single instance, mirrors `NearestStationProvider`. |
| `src/screens/HomeScreen.tsx` | Renders the card below the call button. |

**The onboarding step is skipped, not shown empty, when there is no position** — permission denied, or no fix inside the resolution timeout. A place with no coordinates cannot match a radius, so offering the screen would collect something useless.

**The dot indicators change from four to five** across every onboarding screen. `OnboardingIntro`, `HowItWorks`, `LocationRequest` and `OnboardingReady` all hardcode four; a shared `<OnboardingDots total step />` replaces the copies rather than a fifth copy being added.

## Testing

Jest stays scoped to `src/lib`, per the standing decision.

- `bearingDegrees` against known pairs — due north, due east, the antimeridian, identical points, and a real station/caller pair whose bearing is computed independently.
- `compassPoint` at every 45° boundary and either side of each, including the 337.5°/0° wrap.
- `whatToSay` across all three branches: inside radius, several places matching (nearest wins), just outside radius, no places, no position, no station.
- Per-place radius honoured — a 100 m place and a 2 km place at the same distance resolve differently.
- The saved-places store: round trip, corrupt JSON, version mismatch, over-cap write.

**Not covered by tests, and stated plainly:** every screen-level claim. There are no component tests in this project. The onboarding-skip branch and the card's appearance under stress need a device.

## Out of scope

Sharing a place with anyone. Syncing across devices. Reverse geocoding or any gazetteer — licensing is unresolved and it needs network. Editing a place's coordinates by dragging a map, since there is no map. Speaking the text aloud via TTS. Any change to the dial chain, the station data, or the API.

## Risks

- **A saved place whose landmarks have gone stale** ("near the blue kiosk" — the kiosk is gone) reads confidently and wrongly. Mitigated by them being the user's own words and editable, and by there being up to three: an operator who does not know one may know another. Not solvable in software.
- **Bearing from a station the dispatcher does not think in terms of.** They cover the region and know their stations, but "5 km north-east of Madina" still assumes a shared mental map. It is strictly better than coordinates and strictly worse than a landmark, which is why it is the fallback rather than the primary.
- **The 300 m default is a guess.** It is defensible in dense Accra and probably too tight for a rural compound, which is exactly why the radius is per-place.
