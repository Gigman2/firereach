# Home Card Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the home screen's emergency card tell the truth, and stop 192 pixels of decoration and a dead button from sitting between the user and the call.

**Architecture:** `formatDistance` moves to a shared module, gains a `null` return for "unknown", and stops claiming a distance is unavailable when the user is standing at the station. The fake map and the inert report FAB are deleted, which raises the call button by roughly 240px. The out-of-Ghana heading stops blaming station coverage for what is actually a rejected position.

**Tech Stack:** Expo SDK 55, React Native 0.83, TypeScript 5.9, jest scoped to `src/lib`.

## What is being fixed, and why each is wrong

1. **`formatDistance` exists twice and disagrees.** `HomeScreen` renders `~2.4 km away`; `StationsListScreen` renders `~826 m`. Home's version also returns the string `"Distance unavailable"` for `meters <= 0` — so a user **standing at a fire station** is told the distance is unavailable.
2. **"No station near your location" is false.** All 57 stations ship in the binary; nothing is missing. What happened is that the app rejected a GPS fix as being outside Ghana — which the status pill already states correctly as "LOCATION OUTSIDE GHANA". The heading contradicts the pill and blames the data.
3. **The map is not a map.** `mapContainer` is a static `View` with `height: 192` and a pin icon. No map library is installed. It costs 192px directly above the primary emergency action, and in the no-station state it shows a location pin above a message saying the location is unusable.
4. **The report FAB has no `onPress` at all.** It is not wired to the screen with the TODO submit handler — it is wired to nothing. It renders, accepts taps, and does nothing. `ReportStation` remains reachable from `StationDetailScreen:263`, which passes real `stationId` and `stationName` params; the home FAB never had a station to report about.

## Global Constraints

- **Repository:** `app/` only, at `/Users/ericabbey/Desktop/Projects/firereach/app`. The sibling `api/` repo is untouched.
- **Branch:** cut `feature/home-card` from `main`. Commit there. Never commit to `main`, never switch branches.
- **Never display a fabricated distance.** When the distance is unknown, render nothing — not a placeholder, not a zero.
- **Never state that a station is missing when the station data is present.** The failure in that state is the position, not the dataset.
- **The emergency path must never block on async work**, and nothing here may increase the number of taps or the time to reach the call button.
- No new dependencies. Verification is `npx tsc --noEmit` (0 errors) and `npx jest`.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/format.ts` (new) | `formatDistance`, the single presentation helper for distances |
| `src/lib/__tests__/format.test.ts` (new) | Its tests |
| `src/screens/HomeScreen.tsx` | Card copy and layout; fake map and FAB removed |
| `src/screens/stations/StationsListScreen.tsx` | Uses the shared helper instead of its own copy |

---

## Task 1: One `formatDistance`, and it can say "I don't know"

**Files:**
- Create: `src/lib/format.ts`
- Create: `src/lib/__tests__/format.test.ts`
- Modify: `src/screens/HomeScreen.tsx`, `src/screens/stations/StationsListScreen.tsx` (delete their local copies, import the shared one)

**Interfaces:**
- Consumes: nothing
- Produces: `formatDistance(meters: number): string | null` from `src/lib/format`. Returns `null` when the distance is not a usable number, which callers must treat as "render nothing".

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/format.test.ts`:

```ts
import { formatDistance } from "../format";

describe("formatDistance", () => {
  it("says 'less than 100 m' rather than a bare zero when you are at the station", () => {
    expect(formatDistance(0)).toBe("Less than 100 m away");
  });

  it("uses metres below a kilometre", () => {
    expect(formatDistance(826)).toBe("~826 m away");
  });

  it("rounds metres to whole numbers", () => {
    expect(formatDistance(826.7)).toBe("~827 m away");
  });

  it("uses kilometres to one decimal at and above a kilometre", () => {
    expect(formatDistance(2415)).toBe("~2.4 km away");
  });

  it("switches unit exactly at 1000 m", () => {
    expect(formatDistance(999)).toBe("~999 m away");
    expect(formatDistance(1000)).toBe("~1.0 km away");
  });

  it("returns null for a negative distance rather than rendering nonsense", () => {
    expect(formatDistance(-1)).toBeNull();
  });

  it("returns null for NaN and Infinity", () => {
    expect(formatDistance(NaN)).toBeNull();
    expect(formatDistance(Infinity)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest src/lib/__tests__/format.test.ts
```

Expected: FAIL — cannot resolve `../format`.

- [ ] **Step 3: Implement**

Create `src/lib/format.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass**

```bash
npx jest
```

Expected: the new suite passes; all pre-existing suites still pass.

- [ ] **Step 5: Adopt it in both screens**

Delete the local `formatDistance` from `src/screens/HomeScreen.tsx` and from `src/screens/stations/StationsListScreen.tsx`, and import the shared one in each:

```ts
import { formatDistance } from "../lib/format";
```

```ts
import { formatDistance } from "../../lib/format";
```

In `StationsListScreen`, the call site renders the result directly. It now returns `string | null`, so guard it:

```tsx
              {formatDistance(item.distanceMeters) ?? ""}
```

`HomeScreen`'s `distanceLabel` is handled in Task 2 — for now, make it compile by keeping its existing shape and letting Task 2 restructure it. If a type error remains in `HomeScreen.tsx` after this step, that is expected and Task 2 clears it; record it. Errors anywhere else are real.

- [ ] **Step 6: Verify**

```bash
npx jest
npx tsc --noEmit 2>&1 | grep -oE "^[^(]+" | sort | uniq -c
grep -rn "function formatDistance" src/
```

Expected: jest green; any remaining typecheck error confined to `src/screens/HomeScreen.tsx`; the grep finds exactly one definition, in `src/lib/format.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/format.ts src/lib/__tests__/format.test.ts src/screens/HomeScreen.tsx src/screens/stations/StationsListScreen.tsx
git commit -m "refactor(format): one distance formatter that can admit it does not know"
```

---

## Task 2: An honest, compact emergency card

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

**Interfaces:**
- Consumes: `formatDistance(meters): string | null` from Task 1
- Produces: no exported interface change

- [ ] **Step 1: Tell the truth when the position is rejected**

The `noStationHeading` chain currently ends the `implausible` branch with `"No station near your location"`. That blames the station data for a rejected position. Replace that branch's text with:

```tsx
    : positionSource === "implausible"
    ? "Can't place your location in Ghana"
```

Then add a supporting line beside it, so the user knows what to do rather than only what failed:

```tsx
  /**
   * A second line for the no-station states, shown under the heading. The
   * heading says what happened; this says what to do about it. Empty when a
   * station is showing, since the district/region line takes that slot.
   */
  const noStationHelp =
    positionSource === "implausible"
      ? "Your phone reports a position outside the country. Call 192 — they can find you."
      : positionSource === "denied"
      ? "Without location we cannot pick a station, but 192 always answers."
      : "";
```

- [ ] **Step 2: Delete the fake map**

Remove the entire `mapContainer` block — the `View` wrapping `mapPlaceholder` and `distanceBadge` — and replace the card's body so the information sits directly in the card:

```tsx
        <View
          style={[
            styles.stationCard,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <View style={styles.stationInfo}>
            <Text variant="heading2">{nearest?.name ?? noStationHeading}</Text>

            {nearest ? (
              <Text
                variant="caption"
                weight="medium"
                color={theme.textSecondary}
                style={styles.stationRegion}
              >
                {`${nearest.district}, ${nearest.region}`}
              </Text>
            ) : noStationHelp ? (
              <Text
                variant="caption"
                weight="medium"
                color={theme.textSecondary}
                style={styles.stationRegion}
              >
                {noStationHelp}
              </Text>
            ) : null}

            {distanceLabel && (
              <Text
                variant="caption"
                color={theme.textTertiary}
                style={styles.stationRegion}
              >
                {distanceLabel}
              </Text>
            )}
          </View>
        </View>
```

Delete the `mapContainer`, `mapPlaceholder`, and `distanceBadge` entries from `StyleSheet.create`. `MapPinIcon` is now unused in this file — remove it from the `phosphor-react-native` import. An unused import will not fail typecheck, so check by hand.

- [ ] **Step 3: Make `distanceLabel` nullable**

`distanceLabel` currently always resolves to a string, including the `"Distance unavailable"` case. It must now be `string | null`, so the badge simply does not render when the distance is unknown. Keep the existing `lastKnownStale` qualification, which appends "(from your last known location)" — but only when there is a distance to qualify:

```tsx
  const rawDistance = nearest ? formatDistance(nearest.distanceMeters) : null;
  const distanceLabel =
    rawDistance && positionSource === "lastKnownStale"
      ? `${rawDistance} (from your last known location)`
      : rawDistance;
```

- [ ] **Step 4: Delete the dead FAB**

Remove the `TouchableOpacity` carrying `styles.fab` and its `PencilSimpleIcon` child, near the end of the component after the `ScrollView`. It has **no `onPress`** — it is not merely wired to an unfinished screen, it is wired to nothing.

Remove the `fab` entry from `StyleSheet.create` and drop `PencilSimpleIcon` from the `phosphor-react-native` import.

The report flow is unaffected: `StationDetailScreen` navigates to `ReportStation` with real `stationId` and `stationName` params, which is the only place those params can be supplied.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit && echo "tsc: 0 errors"
npx jest
grep -rn "mapContainer\|mapPlaceholder\|distanceBadge\|styles.fab\|PencilSimpleIcon\|MapPinIcon\|Distance unavailable" src/screens/HomeScreen.tsx
```

Expected: typecheck silent, jest green, and the grep produces **no output** — every removed symbol gone, and no lingering "Distance unavailable" string.

- [ ] **Step 6: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat(home): honest out-of-Ghana copy, no fake map, no dead FAB"
```

---

## Verification

**Automated**

```bash
npx tsc --noEmit && npx jest
grep -rn "function formatDistance" src/       # exactly one, in src/lib/format.ts
grep -rn "Distance unavailable" src/          # no output
```

**Human, on the simulator**

1. **Simulator default (US) location** — heading reads "Can't place your location in Ghana", the supporting line points at 192, no distance chip renders, and the status pill still reads "LOCATION OUTSIDE GHANA". The two now agree.
2. **Custom location `5.5493, -0.2073`** — a real Accra station with `district, region` and a distance such as "~2.4 km away". No map box above it.
3. **Standing at a station** — set the custom location to a station's exact coordinates from `src/data/stations.bundled.json`; the card must read "Less than 100 m away", never "Distance unavailable".
4. **Call button position** — it should sit roughly 240px higher than before, reachable without scrolling on a small device.
5. **No FAB** — the pencil button is gone from the home screen; reporting is still reachable via Stations → a station → Report.
6. **Stations tab** — distances still render, now in the same wording as the home screen.

## Self-review notes

- **Coverage.** Duplicate and broken formatter → Task 1. False out-of-Ghana heading → Task 2 Step 1. Fake map → Task 2 Step 2. Distance badge no longer fabricates → Task 2 Step 3. Dead FAB → Task 2 Step 4.
- **Deliberate intermediate breakage.** Task 1 may leave one typecheck error in `HomeScreen.tsx`, which Task 2 clears. Task 1 names it; anything else is real.
- **A wording change rides along.** The Stations tab previously rendered `~826 m` and now renders `~826 m away`, because both screens share one formatter. That is the point of unifying them, and the reviewer of an earlier change flagged the divergence as a defect.
- **Not in scope.** `ReportStationScreen`'s TODO submit handler; the parked copy fixes from the previous change; the `GuidesChatScreen` content-dialling follow-up.
