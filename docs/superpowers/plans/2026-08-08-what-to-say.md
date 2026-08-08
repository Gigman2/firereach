# What To Say On The Call — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a caller the exact words that locate them, because the regional operator who answers cannot see where they are.

**Architecture:** A device-local list of saved places in AsyncStorage, a pure resolver that turns position + places + nearest station into a short script, and a card below the call button that renders it. One optional onboarding step seeds the first place. Everything derived on-device.

**Tech Stack:** TypeScript, React Native 0.83, Expo SDK 55, AsyncStorage, Jest (scoped to `src/lib`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-08-what-to-say-design.md`

## Global Constraints

- **The position never leaves the device.** `LocationRequestScreen` promises this verbatim. No new network call may carry it. The only existing call that carries coordinates sends Ghana's centroid.
- **Nothing may gate or delay the call button.** The card renders below it. No new async work on the path to dialling.
- **Never paraphrase the user's own note.** It is rendered verbatim or not at all.
- **Never claim a place the position does not support.** Outside a place's own radius, it is not that place.
- **No new dependency. No map library. No reverse geocoding.**
- **The numbers are regional command lines, not per-station lines** — 18 across 57 stations, none unique. No copy may imply the caller is talking to their local station.
- Reads that fail — corrupt, version-mismatched, absent — yield an empty list, never a throw.
- Max 10 saved places. Radius presets: 100 / 300 / 1000 / 2000 m, default 300.
- `npx tsc --noEmit` → 0 errors and `npx jest` green at the end of every task.

---

### Task 1: The saved-places store

**Files:**
- Create: `src/lib/savedPlaces.ts`
- Create: `src/lib/__tests__/savedPlaces.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SavedPlace`, `SavedPlacesFile`, `SAVED_PLACES_VERSION`, `MAX_SAVED_PLACES`, `RADIUS_PRESETS`, `DEFAULT_RADIUS_METERS`, `readSavedPlaces(): Promise<SavedPlace[]>`, `writeSavedPlaces(places: SavedPlace[]): Promise<void>`, `newPlaceId(): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/savedPlaces.test.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  readSavedPlaces,
  writeSavedPlaces,
  MAX_SAVED_PLACES,
  DEFAULT_RADIUS_METERS,
  SAVED_PLACES_KEY,
  SAVED_PLACES_VERSION,
  type SavedPlace,
} from "../savedPlaces";

const place = (over: Partial<SavedPlace> = {}): SavedPlace => ({
  id: "p1",
  label: "Home",
  lat: 5.6091,
  lng: -0.2112,
  note: "near the blue kiosk",
  radiusMeters: DEFAULT_RADIUS_METERS,
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("savedPlaces", () => {
  it("returns an empty list before anything is saved", async () => {
    expect(await readSavedPlaces()).toEqual([]);
  });

  it("round-trips a place", async () => {
    await writeSavedPlaces([place()]);
    expect(await readSavedPlaces()).toEqual([place()]);
  });

  it("returns empty rather than throwing on corrupt JSON", async () => {
    await AsyncStorage.setItem(SAVED_PLACES_KEY, "{ not json");
    expect(await readSavedPlaces()).toEqual([]);
  });

  it("returns empty on a version mismatch rather than guessing the shape", async () => {
    await AsyncStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify({ schemaVersion: 999, places: [place()] })
    );
    expect(await readSavedPlaces()).toEqual([]);
  });

  it("drops entries with unusable coordinates", async () => {
    await AsyncStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify({
        schemaVersion: SAVED_PLACES_VERSION,
        places: [place(), place({ id: "bad", lat: NaN }), place({ id: "b2", lng: 999 })],
      })
    );
    const got = await readSavedPlaces();
    expect(got.map((p) => p.id)).toEqual(["p1"]);
  });

  it("caps what it writes", async () => {
    const many = Array.from({ length: MAX_SAVED_PLACES + 5 }, (_, i) =>
      place({ id: `p${i}` })
    );
    await writeSavedPlaces(many);
    expect((await readSavedPlaces()).length).toBe(MAX_SAVED_PLACES);
  });

  it("falls back to the default radius when one is missing or absurd", async () => {
    await AsyncStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify({
        schemaVersion: SAVED_PLACES_VERSION,
        places: [
          place({ id: "a", radiusMeters: undefined as unknown as number }),
          place({ id: "b", radiusMeters: -5 }),
        ],
      })
    );
    const got = await readSavedPlaces();
    expect(got.map((p) => p.radiusMeters)).toEqual([
      DEFAULT_RADIUS_METERS,
      DEFAULT_RADIUS_METERS,
    ]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest src/lib/__tests__/savedPlaces.test.ts`
Expected: FAIL — cannot resolve `../savedPlaces`.

- [ ] **Step 3: Implement**

```ts
// src/lib/savedPlaces.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

export const SAVED_PLACES_VERSION = 1 as const;
export const SAVED_PLACES_KEY = "@firereach_saved_places";

/** Enough for a real life, small enough that the nearest-place scan is free. */
export const MAX_SAVED_PLACES = 10;

export const RADIUS_PRESETS = [100, 300, 1000, 2000] as const;
export const DEFAULT_RADIUS_METERS = 300;

export type SavedPlace = {
  id: string;
  /** The user's own word for it — "Home", "Shop", "Mum's house". */
  label: string;
  lat: number;
  lng: number;
  /** The user's own landmark sentence, read aloud verbatim. May be empty. */
  note: string;
  /** How close counts as being here. */
  radiusMeters: number;
};

export type SavedPlacesFile = {
  schemaVersion: typeof SAVED_PLACES_VERSION;
  places: SavedPlace[];
};

export function newPlaceId(): string {
  // Enough entropy for a device-local list capped at ten. Not a UUID, and not
  // pretending to be one.
  return `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function usable(p: unknown): p is SavedPlace {
  const q = p as SavedPlace;
  return (
    !!q &&
    typeof q.id === "string" &&
    typeof q.label === "string" &&
    Number.isFinite(q.lat) &&
    Number.isFinite(q.lng) &&
    q.lat >= -90 &&
    q.lat <= 90 &&
    q.lng >= -180 &&
    q.lng <= 180
  );
}

/**
 * Never throws and never rejects. A place list that cannot be read is an empty
 * list: the card falls back to district and bearing, which is a degraded
 * answer rather than a crash on the screen someone opens during a fire.
 */
export async function readSavedPlaces(): Promise<SavedPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPlacesFile;
    if (parsed?.schemaVersion !== SAVED_PLACES_VERSION) return [];
    if (!Array.isArray(parsed.places)) return [];
    return parsed.places
      .filter(usable)
      .slice(0, MAX_SAVED_PLACES)
      .map((p) => ({
        ...p,
        note: typeof p.note === "string" ? p.note : "",
        radiusMeters:
          Number.isFinite(p.radiusMeters) && p.radiusMeters > 0
            ? p.radiusMeters
            : DEFAULT_RADIUS_METERS,
      }));
  } catch {
    return [];
  }
}

export async function writeSavedPlaces(places: SavedPlace[]): Promise<void> {
  const file: SavedPlacesFile = {
    schemaVersion: SAVED_PLACES_VERSION,
    places: places.filter(usable).slice(0, MAX_SAVED_PLACES),
  };
  await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(file));
}
```

- [ ] **Step 4: Run tests** — `npx jest src/lib/__tests__/savedPlaces.test.ts`, expect PASS. Then `npx tsc --noEmit` → 0.

If AsyncStorage is not already mocked in this project's jest setup, add the official mock — `jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))` — in this test file rather than changing global config.

- [ ] **Step 5: Commit**

```bash
git add src/lib/savedPlaces.ts src/lib/__tests__/savedPlaces.test.ts
git commit -m "feat(places): device-local saved places store"
```

---

### Task 2: Bearing and compass points

**Files:**
- Modify: `src/lib/geo.ts` (append; do not touch `haversineMeters` or `nearestStations`)
- Modify: `src/lib/__tests__/geo.test.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `bearingDegrees(fromLat, fromLng, toLat, toLng): number` (0–360, clockwise from north), `compassPoint(bearing: number): string` (spoken words).

**Do not modify any existing test in `geo.test.ts`.** `haversineMeters` is verified against the Go implementation to zero metres across 570 comparisons; nothing here may disturb it.

- [ ] **Step 1: Write the failing tests** (append to `src/lib/__tests__/geo.test.ts`)

```ts
describe("bearingDegrees", () => {
  it("reads 0 for due north", () => {
    expect(Math.round(bearingDegrees(5.6, -0.2, 6.6, -0.2))).toBe(0);
  });

  it("reads 180 for due south", () => {
    expect(Math.round(bearingDegrees(6.6, -0.2, 5.6, -0.2))).toBe(180);
  });

  it("reads about 90 for due east", () => {
    expect(Math.round(bearingDegrees(5.6, -0.2, 5.6, 0.8))).toBe(90);
  });

  it("reads about 270 for due west", () => {
    expect(Math.round(bearingDegrees(5.6, 0.8, 5.6, -0.2))).toBe(270);
  });

  it("always returns 0-360, never negative", () => {
    const b = bearingDegrees(5.6, 0.5, 5.5, -0.5);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });

  it("returns 0 for identical points rather than NaN", () => {
    expect(bearingDegrees(5.6, -0.2, 5.6, -0.2)).toBe(0);
  });
});

describe("compassPoint", () => {
  it("names the eight points at their centres", () => {
    expect(compassPoint(0)).toBe("north");
    expect(compassPoint(45)).toBe("north-east");
    expect(compassPoint(90)).toBe("east");
    expect(compassPoint(135)).toBe("south-east");
    expect(compassPoint(180)).toBe("south");
    expect(compassPoint(225)).toBe("south-west");
    expect(compassPoint(270)).toBe("west");
    expect(compassPoint(315)).toBe("north-west");
  });

  it("wraps past 337.5 back to north", () => {
    expect(compassPoint(338)).toBe("north");
    expect(compassPoint(359.9)).toBe("north");
    expect(compassPoint(360)).toBe("north");
  });

  it("splits on the 22.5 boundaries", () => {
    expect(compassPoint(22)).toBe("north");
    expect(compassPoint(23)).toBe("north-east");
  });

  it("spells words rather than abbreviations, because this is read aloud", () => {
    expect(compassPoint(45)).not.toBe("NE");
  });
});
```

Add `bearingDegrees, compassPoint` to the existing import from `../geo` at the top of the file.

- [ ] **Step 2: Run and watch it fail** — `npx jest src/lib/__tests__/geo.test.ts`, expect FAIL on undefined functions.

- [ ] **Step 3: Implement** (append to `src/lib/geo.ts`)

```ts
/**
 * Initial great-circle bearing from A to B, degrees clockwise from north.
 *
 * Used to describe where the caller is relative to a station the dispatcher
 * knows — "north-east of Madina station" — so the direction runs station to
 * caller, and callers pass the arguments in that order.
 */
export function bearingDegrees(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(fromLat);
  const φ2 = toRad(toLat);
  const Δλ = toRad(toLng - fromLng);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  // atan2(0, 0) is 0, so identical points give north rather than NaN.
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

const POINTS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
] as const;

/**
 * Eight points, spelled out. Someone is reading this down a phone line while
 * a fire burns; "NE" is not a word.
 */
export function compassPoint(bearing: number): string {
  const norm = ((bearing % 360) + 360) % 360;
  return POINTS[Math.round(norm / 45) % 8];
}
```

- [ ] **Step 4: Run tests** — `npx jest`, all green including every pre-existing geo test unmodified. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo.ts src/lib/__tests__/geo.test.ts
git commit -m "feat(geo): bearing and spoken compass points"
```

---

### Task 3: The resolver

**Files:**
- Create: `src/lib/whatToSay.ts`
- Create: `src/lib/__tests__/whatToSay.test.ts`

**Interfaces:**
- Consumes: `SavedPlace` (Task 1), `haversineMeters`/`bearingDegrees`/`compassPoint` (Task 2), `RankedStation` from `src/lib/stationTypes`, `formatDistance`/`formatCoords` from `src/lib/format`.
- Produces: `SpeakableLocation`, `whatToSay(position, places, nearest): SpeakableLocation`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/whatToSay.test.ts
import { whatToSay } from "../whatToSay";
import type { SavedPlace } from "../savedPlaces";
import type { RankedStation } from "../stationTypes";

const HOME: SavedPlace = {
  id: "h", label: "Home", lat: 5.6091, lng: -0.2112,
  note: "near the blue kiosk", radiusMeters: 300,
};

// Madina, from the bundled table.
const STATION: RankedStation = {
  id: "s", name: "Madina Fire Station", region: "Greater Accra Region",
  district: "La-Nkwantanang-Madina Municipal District",
  lat: 5.6837, lng: -0.1665, contacts: [], distanceMeters: 0,
};

describe("whatToSay", () => {
  it("uses a saved place when the caller is inside its radius", () => {
    const got = whatToSay({ lat: 5.6092, lng: -0.2113 }, [HOME], STATION);
    expect(got.kind).toBe("savedPlace");
    if (got.kind !== "savedPlace") return;
    expect(got.label).toBe("Home");
    expect(got.note).toBe("near the blue kiosk");
  });

  it("renders the user's note verbatim, never paraphrased", () => {
    const odd = { ...HOME, note: "3rd gate AFTER the mosque, blue roof" };
    const got = whatToSay({ lat: 5.6091, lng: -0.2112 }, [odd], STATION);
    expect(JSON.stringify(got)).toContain("3rd gate AFTER the mosque, blue roof");
  });

  it("does not claim a place the caller is outside the radius of", () => {
    // ~1.1 km east — well beyond 300 m.
    const got = whatToSay({ lat: 5.6091, lng: -0.2012 }, [HOME], STATION);
    expect(got.kind).toBe("derived");
  });

  it("honours each place's own radius", () => {
    const tight = { ...HOME, id: "t", radiusMeters: 100 };
    const loose = { ...HOME, id: "l", label: "Farm", radiusMeters: 2000 };
    const at = { lat: 5.6091, lng: -0.2012 }; // ~1.1 km from both
    expect(whatToSay(at, [tight], STATION).kind).toBe("derived");
    const got = whatToSay(at, [loose], STATION);
    expect(got.kind).toBe("savedPlace");
    if (got.kind === "savedPlace") expect(got.label).toBe("Farm");
  });

  it("picks the nearest when several places match", () => {
    const near = { ...HOME, id: "n", label: "Shop", lat: 5.60915, lng: -0.21125 };
    const far = { ...HOME, id: "f", label: "Home", lat: 5.6100, lng: -0.2120 };
    const got = whatToSay({ lat: 5.60915, lng: -0.21125 }, [far, near], STATION);
    expect(got.kind === "savedPlace" && got.label).toBe("Shop");
  });

  it("falls back to district, region and bearing from the station", () => {
    const got = whatToSay({ lat: 5.6091, lng: -0.2112 }, [], STATION);
    expect(got.kind).toBe("derived");
    if (got.kind !== "derived") return;
    const all = got.lines.join(" ");
    expect(all).toContain("La-Nkwantanang-Madina Municipal District");
    expect(all).toContain("Greater Accra Region");
    expect(all).toContain("Madina Fire Station");
    expect(all).toMatch(/south-west/);
    expect(got.coords).toBe("5.6091° N, 0.2112° W");
  });

  it("still gives district and coordinates when there is no station", () => {
    const got = whatToSay({ lat: 5.6091, lng: -0.2112 }, [], null);
    expect(got.kind).toBe("derived");
    if (got.kind !== "derived") return;
    expect(got.coords).toBe("5.6091° N, 0.2112° W");
    expect(got.lines.join(" ")).not.toContain("undefined");
  });

  it("says nothing when there is no position", () => {
    expect(whatToSay(null, [HOME], STATION).kind).toBe("none");
  });

  it("says nothing when there is no position and no places either", () => {
    expect(whatToSay(null, [], null).kind).toBe("none");
  });
});
```

- [ ] **Step 2: Run and watch it fail** — `npx jest src/lib/__tests__/whatToSay.test.ts`.

- [ ] **Step 3: Implement**

```ts
// src/lib/whatToSay.ts
import { haversineMeters, bearingDegrees, compassPoint } from "./geo";
import { formatDistance, formatCoords } from "./format";
import type { SavedPlace } from "./savedPlaces";
import type { RankedStation } from "./stationTypes";

export type SpeakableLocation =
  | { kind: "savedPlace"; label: string; note: string; lines: string[] }
  | { kind: "derived"; lines: string[]; coords: string }
  | { kind: "none" };

/**
 * The words a caller reads to a dispatcher.
 *
 * This exists because the numbers in the dataset are regional command lines:
 * whoever answers covers a whole region and cannot see the caller. Choosing
 * the nearest station changes no dialled digits — what the caller says is the
 * only thing that locates them.
 *
 * Order matters. A saved place wins outright, because the user's own landmark
 * beats anything derived. Nothing is ever paraphrased: `note` is passed
 * through exactly as typed.
 */
export function whatToSay(
  position: { lat: number; lng: number } | null,
  places: SavedPlace[],
  nearest: RankedStation | null
): SpeakableLocation {
  if (
    !position ||
    !Number.isFinite(position.lat) ||
    !Number.isFinite(position.lng)
  ) {
    return { kind: "none" };
  }

  const matches = places
    .map((p) => ({
      p,
      d: haversineMeters(position.lat, position.lng, p.lat, p.lng),
    }))
    .filter(({ p, d }) => Number.isFinite(d) && d <= p.radiusMeters)
    .sort((a, b) => a.d - b.d);

  if (matches.length > 0) {
    const { p } = matches[0];
    const lines = [`I'm at ${p.label}.`];
    if (p.note.trim()) lines.push(p.note.trim());
    return { kind: "savedPlace", label: p.label, note: p.note, lines };
  }

  const lines: string[] = [];
  const coords = formatCoords(position.lat, position.lng) ?? "";

  if (nearest) {
    lines.push(`I'm in ${nearest.district}, ${nearest.region}.`);
    const metres = haversineMeters(
      nearest.lat,
      nearest.lng,
      position.lat,
      position.lng
    );
    const distance = formatDistance(metres, { suffix: false });
    const direction = compassPoint(
      bearingDegrees(nearest.lat, nearest.lng, position.lat, position.lng)
    );
    if (distance) {
      lines.push(`About ${distance} ${direction} of ${nearest.name}.`);
    }
  }

  return { kind: "derived", lines, coords };
}
```

- [ ] **Step 4: Run tests** — `npx jest`, all green. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatToSay.ts src/lib/__tests__/whatToSay.test.ts
git commit -m "feat(places): resolve position and places into a spoken script"
```

---

### Task 4: The provider

**Files:**
- Create: `src/hooks/useSavedPlaces.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: Task 1's store.
- Produces: `SavedPlacesProvider`, `useSavedPlaces(): { places, addPlace, updatePlace, removePlace, isLoading }`.

Mirror `src/hooks/useNearestStation.tsx`: context + provider, single instance mounted in `App.tsx` so navigation cannot create a second. Read once on mount; every mutation writes through to AsyncStorage and updates state optimistically.

- [ ] **Step 1: Implement**

```tsx
// src/hooks/useSavedPlaces.tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  readSavedPlaces,
  writeSavedPlaces,
  MAX_SAVED_PLACES,
  type SavedPlace,
} from "../lib/savedPlaces";

type Ctx = {
  places: SavedPlace[];
  isLoading: boolean;
  addPlace: (p: SavedPlace) => Promise<void>;
  updatePlace: (p: SavedPlace) => Promise<void>;
  removePlace: (id: string) => Promise<void>;
};

const SavedPlacesContext = createContext<Ctx | null>(null);

export const SavedPlacesProvider = ({ children }: { children: React.ReactNode }) => {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await readSavedPlaces();
      if (cancelled) return;
      setPlaces(loaded);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Write-through, then set state from what was written, so what the screen
  // shows is what is on disk rather than what we hoped to put there.
  const commit = useCallback(async (next: SavedPlace[]) => {
    const capped = next.slice(0, MAX_SAVED_PLACES);
    await writeSavedPlaces(capped);
    setPlaces(await readSavedPlaces());
  }, []);

  const addPlace = useCallback(
    async (p: SavedPlace) => commit([...places, p]),
    [places, commit]
  );
  const updatePlace = useCallback(
    async (p: SavedPlace) => commit(places.map((x) => (x.id === p.id ? p : x))),
    [places, commit]
  );
  const removePlace = useCallback(
    async (id: string) => commit(places.filter((x) => x.id !== id)),
    [places, commit]
  );

  return (
    <SavedPlacesContext.Provider
      value={{ places, isLoading, addPlace, updatePlace, removePlace }}
    >
      {children}
    </SavedPlacesContext.Provider>
  );
};

export function useSavedPlaces(): Ctx {
  const ctx = useContext(SavedPlacesContext);
  if (!ctx) throw new Error("useSavedPlaces must be used inside SavedPlacesProvider");
  return ctx;
}
```

- [ ] **Step 2: Mount it in `App.tsx`**

Wrap `<AppFonts>`'s children — inside `NearestStationProvider`, outside the navigator. Do not move `NearestStationProvider` or `AppFonts`: the GPS request must still start on the first frame, and the comment in `App.tsx` explaining that ordering must stay accurate.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` → 0, `npx jest` green.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSavedPlaces.tsx App.tsx
git commit -m "feat(places): single-instance saved places provider"
```

---

### Task 5: Shared onboarding dots, renumbered to five

**Files:**
- Create: `src/components/ui/OnboardingDots.tsx`
- Modify: `src/screens/onboarding/OnboardingIntroScreen.tsx`, `HowItWorksScreen.tsx`, `LocationRequestScreen.tsx`, `OnboardingReadyScreen.tsx`

**Interfaces:**
- Produces: `<OnboardingDots total={number} step={number} />`, `step` 1-based.

Every one of those screens hardcodes its own row of dots and its own `dotActive`/`dotInactive` styles. Adding a fifth step must not mean a fifth copy. Read each screen to find its current step index — do not assume the order.

- [ ] **Step 1: Implement the component**

```tsx
// src/components/ui/OnboardingDots.tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";

/**
 * One row of progress dots. Replaces four hand-rolled copies that each
 * hardcoded a count, so adding an onboarding step meant editing all of them
 * and quietly getting one wrong.
 */
export const OnboardingDots = ({ total, step }: { total: number; step: number }) => (
  <View style={styles.row}>
    {Array.from({ length: total }, (_, i) => (
      <View key={i} style={i + 1 === step ? styles.active : styles.inactive} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  active: { height: 8, width: 32, borderRadius: 4, backgroundColor: colors.brandPrimary },
  inactive: { height: 8, width: 8, borderRadius: 4, backgroundColor: `${colors.brandPrimary}33` },
});
```

- [ ] **Step 2: Replace each copy.** In each of the four screens, swap the hand-rolled `<View style={styles.dots}>…</View>` for `<OnboardingDots total={5} step={N} />` with that screen's own index, and delete the now-unused `dots`, `dotActive`, `dotInactive` style keys. `LocationDeniedScreen` is a side branch off `LocationRequest`, not a numbered step — leave its dots alone if it has them, or give it the same index as `LocationRequest` if that is what it shows today. Match the existing behaviour; do not invent a new one.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` → 0, `npx jest` green (the font guard scans these files). Grep that no `dotActive` remains outside the new component.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(onboarding): one dots component, five steps"
```

---

### Task 6: The save-a-place onboarding step

**Files:**
- Create: `src/screens/onboarding/SavePlaceScreen.tsx`
- Modify: `src/navigation/types.ts`, `src/navigation/AppNavigator.tsx`, `src/screens/onboarding/LocationRequestScreen.tsx`, `src/screens/onboarding/LocationDeniedScreen.tsx`

**Interfaces:**
- Consumes: `useSavedPlaces` (Task 4), `useNearestStation` for the current position, `RADIUS_PRESETS`/`DEFAULT_RADIUS_METERS`/`newPlaceId` (Task 1), `OnboardingDots` (Task 5).
- Produces: route `SavePlace: undefined` in `RootStackParamList`.

**The screen must be skipped, not shown empty, when there is no position.** A place with no coordinates cannot match a radius. `LocationRequestScreen`'s "Allow Location" path navigates to `SavePlace` only if a position resolved; otherwise it goes straight to `OnboardingReady`. "Skip for now" and `LocationDeniedScreen`'s "Continue anyway" both go straight to `OnboardingReady`.

Content: heading "Save where you are now", one short line explaining why (the operator covers a whole region and cannot see you), a label field pre-filled with three tap-chips — Home / Work / Other — a note field with a concrete placeholder ("near the blue kiosk, opposite the pharmacy"), the four radius presets with 300 m pre-selected, a "Save" primary button and a "Skip for now" text link. Both routes land on `OnboardingReady`.

Save writes `{ id: newPlaceId(), label, lat, lng, note, radiusMeters }` via `addPlace`, using the position from `useNearestStation`. Use `<OnboardingDots total={5} step={5} />` and renumber `OnboardingReady` to a sixth step **only if** the dots today treat Ready as a step — check, do not assume.

- [ ] **Step 1: Add the route** to `RootStackParamList` and register it in `AppNavigator`, ordered between `LocationRequest` and `OnboardingReady`.
- [ ] **Step 2: Build the screen**, following `LocationRequestScreen`'s layout idiom (safe-area padding, `content`/`spacer`/`footer`). Use the shared `Text` and `Button`. Any `TextInput` needs an explicit `fontFamily: typography.fonts.regular` or the font guard test fails.
- [ ] **Step 3: Wire the skip logic** in `LocationRequestScreen` and `LocationDeniedScreen`.
- [ ] **Step 4: Verify** — `npx tsc --noEmit` → 0, `npx jest` green.
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(onboarding): optional save-a-place step"
```

---

### Task 7: Managing places in Settings

**Files:**
- Create: `src/screens/settings/SavedPlacesScreen.tsx`
- Modify: `src/screens/SettingsScreen.tsx`, `src/navigation/types.ts`, `src/navigation/TabNavigator.tsx`

**Interfaces:**
- Consumes: `useSavedPlaces`, `useNearestStation`, Task 1's constants.

The Settings tab currently registers `SettingsScreen` directly. Give it a small native stack — mirroring `StationsScreen.tsx` — with `SettingsHome` and `SavedPlaces`, so the row can push. Add a `SettingsStackParamList` alongside the existing stack param lists.

Add a **"Your places"** row under a new `SectionHeader title="What to say"`, showing the count, following the existing row idiom in that file exactly.

The screen lists each place as label, note, and radius, with edit and delete. Add uses the current position; when there is no position, the Add button is disabled with a one-line explanation rather than hidden — a disabled control that says why beats a control that vanishes. Deleting confirms via `Alert.alert`, matching `handleClearCache`. Enforce `MAX_SAVED_PLACES` by disabling Add at the cap and saying so.

- [ ] **Step 1: Add the stack and param list.**
- [ ] **Step 2: Build the screen** (list, add, edit, delete). `TextInput`s need explicit `fontFamily`.
- [ ] **Step 3: Add the Settings row.**
- [ ] **Step 4: Verify** — `npx tsc --noEmit` → 0, `npx jest` green.
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(settings): manage saved places"
```

---

### Task 8: The card on the home screen

**Files:**
- Create: `src/components/WhatToSayCard.tsx`
- Modify: `src/screens/HomeScreen.tsx`

**Interfaces:**
- Consumes: `whatToSay` (Task 3), `useSavedPlaces` (Task 4), position and `nearest` from `useNearestStation`.

Renders **directly below the call button** and above the alternates row. Heading "Say this". Each line at `bodyLarge` with `theme.textPrimary` — this gets read under stress, so it never uses `textTertiary`, and the earlier contrast regression on this screen is not to be repeated. Coordinates sit underneath at `caption`, monospace, clearly secondary.

**The no-position picker.** When `whatToSay` returns `kind: "none"` and there are saved places, render "Which of these are you at?" with one tap-target per place; tapping selects it and shows that place's lines. When there are no places either, render nothing at all — an empty card is worse than no card.

The card must not gate anything. No new async work; `useSavedPlaces` is already loaded by the provider, and the position already exists on the screen.

`useNearestStation` must expose the raw position for this. Check whether it already does; if not, add it to the context value without changing any existing field or the resolution logic.

- [ ] **Step 1: Build the card.**
- [ ] **Step 2: Place it in `HomeScreen`** below the call button.
- [ ] **Step 3: Verify** — `npx tsc --noEmit` → 0, `npx jest` green (56 existing plus everything added).
- [ ] **Step 4: Commit**

```bash
git commit -am "feat(home): say-this card below the call button"
```

---

## Verification

**Automated:** `npx tsc --noEmit` → 0. `npx jest` → every pre-existing test unmodified and passing, plus the new `savedPlaces`, `geo` bearing/compass, and `whatToSay` suites. The font guard suite must stay green, which means every new `TextInput` carries an explicit `fontFamily`.

**Human, on a device** — none of the following is covered by any test:

1. **Fresh install, location allowed** — the save-a-place step appears, seeds from the real position, and saving lands on Ready.
2. **Fresh install, location denied** — the step is skipped entirely; onboarding still completes.
3. **Standing at a saved place** — the card reads the label and the note verbatim.
4. **A few streets away** — the card falls back to district, region and bearing. The bearing is correct against a map.
5. **Airplane mode** — everything above still works; nothing waits on the network.
6. **Location off, with places saved** — the picker appears and selecting a place shows its lines.
7. **Location off, no places** — no card at all, and the call button is unaffected.
8. **Ten places saved** — Add is disabled and says why.
9. The call button is reachable in the same number of taps as before, in every one of these states.
