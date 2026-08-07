# Offline Station Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make nearest-station resolution work fully offline by shipping the entire 57-station national dataset in the app bundle and computing distance on-device.

**Architecture:** The whole station table is 22.5 KB, so the app carries all of it — bundled at build time and refreshed opportunistically into AsyncStorage. Nearest is a local haversine over that table, identical to the server's. The network becomes an input refresher, never a gate on the answer.

**Tech Stack:** Expo SDK 55, React Native 0.83, TypeScript 5.9, AsyncStorage, `expo-location`, `expo-network`. Adds `jest-expo` for pure-function tests.

## Global Constraints

- **Repository:** `app/` only, at `/Users/ericabbey/Desktop/Projects/firereach/app`. The sibling `api/` repo is **read-only** for this plan — one script reads its committed seed file, nothing writes to it.
- **Branch:** `feature/offline-stations`, cut from `feature/api-wiring`. Commit there. Never commit to `main`, never switch branches.
- **Design:** `/Users/ericabbey/.claude/plans/clever-gathering-cocke.md`. Read it before starting.
- **No API changes.** `GET /v1/stations?lat=7.9465&lng=-1.0232&limit=500` already returns all 57 stations today.
- **The emergency path must never block on async work.** A dialable number must be available on the first frame, from bundled data, before AsyncStorage or GPS resolve.
- **Never delete or expire a cache for being stale.** Stale data beats no data. Label it; never remove it.
- **A failed refresh must never overwrite good cached data.**
- **No map library, no `expo-sqlite`, no new native modules.** 57 haversines is microseconds.
- The API is on **port 9000**. `app/.env` already points there.
- Verification is `npx tsc --noEmit` and `npx jest`.

## File structure

| File | Responsibility |
|---|---|
| `scripts/build-stations-bundle.mjs` (new) | Derives the bundled JSON from the API's committed seed SQL |
| `src/data/stations.bundled.json` (new, generated, committed) | The 57-station table shipped in the binary |
| `src/lib/geo.ts` (new) | Pure haversine + nearest-N ranking |
| `src/lib/stationTypes.ts` | Table/station/contact types; dial-order helper |
| `src/lib/stationCache.ts` | Table persistence; bundled fallback; scoped key list |
| `src/lib/stationsApi.ts` | Full-table fetch preserving every field |
| `src/hooks/useNearestStation.ts` | Local-first resolution and honest position state |
| `src/screens/HomeScreen.tsx` | Honest status, dial chain, freshness |
| `src/screens/stations/StationsListScreen.tsx`, `StationDetailScreen.tsx` | Real cached data instead of mockups |

---

## Task 1: Test harness for pure logic

**Deliberate deviation from convention.** Previous plans in this project explicitly declined to add a test harness. That was right for I/O-bound client code. `geo.ts` is different: it is pure arithmetic that decides which fire station an emergency caller is directed to, it has authoritative expected values in the Go suite, and its edge cases (ties, empty table, antimeridian-adjacent longitudes) cannot be covered by manual smoke-testing. The harness is scoped to `src/lib/` pure functions — no component or hook testing.

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`
- Test: `src/lib/__tests__/harness.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `npx jest` runs; later tasks add `src/lib/__tests__/*.test.ts`

- [ ] **Step 1: Install the harness**

```bash
npx expo install jest-expo jest
npm install --save-dev @types/jest
```

- [ ] **Step 2: Create `jest.config.js`**

Scoped to `src/lib` so no component or hook ever gets pulled into a test run:

```js
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/lib/__tests__/**/*.test.ts"],
};
```

- [ ] **Step 3: Add the script to `package.json`**

Add to the `scripts` block, leaving the existing entries untouched:

```json
"test": "jest"
```

- [ ] **Step 4: Write a test that proves the harness runs**

Create `src/lib/__tests__/harness.test.ts`:

```ts
describe("jest harness", () => {
  it("runs TypeScript in src/lib", () => {
    const doubled: number = [1, 2, 3].map((n) => n * 2).reduce((a, b) => a + b, 0);
    expect(doubled).toBe(12);
  });
});
```

- [ ] **Step 5: Run it**

```bash
npx jest
```

Expected: 1 suite, 1 test, passing.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no output. If `@types/jest` is missing, `describe`/`it`/`expect` will error here.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json jest.config.js src/lib/__tests__/harness.test.ts
git commit -m "test: add jest harness scoped to pure lib functions"
```

---

## Task 2: Bundled station dataset

**Files:**
- Create: `scripts/build-stations-bundle.mjs`
- Create: `src/data/stations.bundled.json` (generated, committed)
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing
- Produces: `src/data/stations.bundled.json` — an array of `{ id, name, region, district, lat, lng, contacts: [{ phone, responseRate, active }] }`, importable as a static module

- [ ] **Step 1: Write the generator**

Create `scripts/build-stations-bundle.mjs`. It parses the API's **committed** seed SQL — the single source of truth — so the bundle can never claim data the backend does not have. It reads a sibling repo, so it is a developer-run regeneration step, never part of the app build:

```js
#!/usr/bin/env node
/**
 * Derives src/data/stations.bundled.json from the API repo's committed seed SQL.
 *
 * The seed is the single source of truth; this only reshapes it. Run manually
 * after the seed changes, then commit the result — the app build never invokes
 * this, and the app must build with no sibling repo present.
 *
 * Usage: node scripts/build-stations-bundle.mjs [path-to-dev_stations.sql]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const seedPath =
  process.argv[2] ?? resolve(here, "../../api/seeds/dev_stations.sql");
const outPath = resolve(here, "../src/data/stations.bundled.json");

const sql = readFileSync(seedPath, "utf8");

const stationRe =
  /INSERT INTO stations \(id, name, region, district, lat, lng, active\) VALUES\s*\(\s*'([^']+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*(-?[\d.]+),\s*(-?[\d.]+),\s*true\)/g;

const contactRe =
  /INSERT INTO station_contacts \(station_id, phone, response_rate, active\) VALUES \('([^']+)', '([^']+)', ([\d.]+), true\)/g;

const unquote = (s) => s.replace(/''/g, "'");

const stations = new Map();
for (const m of sql.matchAll(stationRe)) {
  stations.set(m[1], {
    id: m[1],
    name: unquote(m[2]),
    region: unquote(m[3]),
    district: unquote(m[4]),
    lat: Number(m[5]),
    lng: Number(m[6]),
    contacts: [],
  });
}

let contactCount = 0;
for (const m of sql.matchAll(contactRe)) {
  const station = stations.get(m[1]);
  if (!station) throw new Error(`contact references unknown station ${m[1]}`);
  station.contacts.push({
    phone: m[2],
    responseRate: Number(m[3]),
    active: true,
  });
  contactCount++;
}

const rows = [...stations.values()].sort((a, b) => a.name.localeCompare(b.name));

if (rows.length === 0) throw new Error("parsed zero stations — seed format changed?");
for (const s of rows) {
  if (s.contacts.length === 0) throw new Error(`station ${s.name} has no contacts`);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(rows, null, 2) + "\n");

console.error(
  `wrote ${rows.length} stations / ${contactCount} contacts -> ${outPath}`
);
```

- [ ] **Step 2: Add the npm script**

Add to `package.json` `scripts`:

```json
"build:stations": "node scripts/build-stations-bundle.mjs"
```

- [ ] **Step 3: Generate the bundle**

```bash
npm run build:stations
```

Expected on stderr: `wrote 57 stations / 165 contacts -> .../src/data/stations.bundled.json`.

If the count is not 57/165, the seed changed or the regexes drifted — stop and report rather than committing a different dataset.

- [ ] **Step 4: Sanity-check the output**

```bash
node -e "
const s = require('./src/data/stations.bundled.json');
console.log('stations:', s.length);
console.log('every station has 192:', s.every(x => x.contacts.some(c => c.phone === '192')));
console.log('all coords in Ghana bbox:', s.every(x => x.lat > 4 && x.lat < 12 && x.lng > -4 && x.lng < 2));
console.log('bytes:', JSON.stringify(s).length);
"
```

Expected: `stations: 57`, both booleans `true`, and roughly 20–25 KB.

- [ ] **Step 5: Confirm regeneration is deterministic**

```bash
npm run build:stations && git diff --exit-code src/data/stations.bundled.json
```

Expected: exit 0, no diff. A non-zero exit means the generator is not deterministic — stop and report.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-stations-bundle.mjs src/data/stations.bundled.json package.json
git commit -m "feat(data): bundle the national station table into the app"
```

---

## Task 3: On-device distance and ranking

**Files:**
- Create: `src/lib/geo.ts`
- Test: `src/lib/__tests__/geo.test.ts`

**Interfaces:**
- Consumes: `CachedStation` — defined in Task 4, so this task declares its own minimal structural input type and Task 4's type satisfies it
- Produces: `haversineMeters(lat1, lng1, lat2, lng2): number` and `nearestStations<T extends GeoPoint>(stations: T[], lat, lng, limit): (T & { distanceMeters: number })[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/geo.test.ts`. The 1108 m expectation is lifted from the Go suite's `TestListNearestStations_KnownDistanceIsPlausible`, so client and server are pinned to the same arithmetic:

```ts
import { haversineMeters, nearestStations } from "../geo";

describe("haversineMeters", () => {
  it("is zero at the same point", () => {
    expect(haversineMeters(5.6, -0.19, 5.6, -0.19)).toBe(0);
  });

  it("matches the Go suite: 0.01 deg of longitude at 5.6N is about 1108 m", () => {
    const d = haversineMeters(5.6, -0.19, 5.6, -0.18);
    expect(d).toBeGreaterThan(1050);
    expect(d).toBeLessThan(1160);
  });

  it("is symmetric", () => {
    const a = haversineMeters(5.55, -0.207, 6.69, -1.62);
    const b = haversineMeters(6.69, -1.62, 5.55, -0.207);
    expect(a).toBe(b);
  });

  it("handles the Greenwich meridian, which runs through Ghana", () => {
    // Tema sits at roughly 0 degrees longitude; a sign flip must not blow up.
    const d = haversineMeters(5.66, -0.01, 5.66, 0.01);
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(2400);
  });

  it("returns whole metres", () => {
    expect(Number.isInteger(haversineMeters(5.6, -0.19, 6.0, -1.0))).toBe(true);
  });
});

const STATIONS = [
  { id: "far", lat: 6.0, lng: -1.0 },
  { id: "near", lat: 5.6, lng: -0.2 },
  { id: "mid", lat: 5.7, lng: -0.5 },
];

describe("nearestStations", () => {
  it("returns nearest first", () => {
    const got = nearestStations(STATIONS, 5.6, -0.19, 3);
    expect(got.map((s) => s.id)).toEqual(["near", "mid", "far"]);
  });

  it("attaches distanceMeters ascending", () => {
    const got = nearestStations(STATIONS, 5.6, -0.19, 3);
    expect(got[0].distanceMeters).toBeLessThan(got[1].distanceMeters);
    expect(got[1].distanceMeters).toBeLessThan(got[2].distanceMeters);
  });

  it("honours the limit", () => {
    expect(nearestStations(STATIONS, 5.6, -0.19, 1)).toHaveLength(1);
  });

  it("returns everything when the limit exceeds the input", () => {
    expect(nearestStations(STATIONS, 5.6, -0.19, 99)).toHaveLength(3);
  });

  it("returns an empty array for an empty table rather than throwing", () => {
    expect(nearestStations([], 5.6, -0.19, 3)).toEqual([]);
  });

  it("does not mutate the caller's array", () => {
    const input = [...STATIONS];
    nearestStations(input, 5.6, -0.19, 3);
    expect(input.map((s) => s.id)).toEqual(["far", "near", "mid"]);
  });

  it("breaks ties deterministically regardless of input order", () => {
    const a = nearestStations(
      [{ id: "b", lat: 5.6, lng: -0.19 }, { id: "a", lat: 5.6, lng: -0.19 }],
      5.6,
      -0.19,
      2
    );
    const b = nearestStations(
      [{ id: "a", lat: 5.6, lng: -0.19 }, { id: "b", lat: 5.6, lng: -0.19 }],
      5.6,
      -0.19,
      2
    );
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest src/lib/__tests__/geo.test.ts
```

Expected: FAIL — cannot resolve module `../geo`.

- [ ] **Step 3: Implement**

Create `src/lib/geo.ts`. The constant and formula are ported verbatim from `api/internal/usecase/station/list_nearest.go` so the two agree to the metre:

```ts
/** Metres. Matches earthRadiusKm * 1000 in the Go implementation. */
const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

export type GeoPoint = { lat: number; lng: number };

/**
 * Great-circle distance in whole metres. Ported from
 * api/internal/usecase/station/list_nearest.go — same radius, same formula,
 * same rounding — so an offline result equals what the server would have said.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Nearest `limit` stations, nearest first, each carrying its distance.
 * Copies before sorting so the caller's array is untouched, and breaks
 * distance ties on `id` so the ordering does not depend on input order.
 */
export function nearestStations<T extends GeoPoint & { id: string }>(
  stations: T[],
  lat: number,
  lng: number,
  limit: number
): (T & { distanceMeters: number })[] {
  return stations
    .map((s) => ({
      ...s,
      distanceMeters: haversineMeters(lat, lng, s.lat, s.lng),
    }))
    .sort((a, b) =>
      a.distanceMeters !== b.distanceMeters
        ? a.distanceMeters - b.distanceMeters
        : a.id.localeCompare(b.id)
    )
    .slice(0, Math.max(0, limit));
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx jest && npx tsc --noEmit
```

Expected: all tests pass, typecheck silent.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo.ts src/lib/__tests__/geo.test.ts
git commit -m "feat(geo): port haversine and nearest-N ranking to the client"
```

---

## Task 4: Station table types, cache, and scoped clearing

**Files:**
- Modify: `src/lib/stationTypes.ts`
- Modify: `src/lib/stationCache.ts`
- Modify: `src/screens/SettingsScreen.tsx:92`
- Test: `src/lib/__tests__/stationTypes.test.ts`

**Interfaces:**
- Consumes: `src/data/stations.bundled.json` (Task 2)
- Produces: `STATION_TABLE_VERSION`, `StationContact`, `CachedStation`, `StationTable`, `RankedStation`, `dialOrder(station)`, `readStationTable()`, `writeStationTable(table)`, `clearStationCache()`, `STATION_CACHE_KEYS`

- [ ] **Step 1: Write the failing test for the dial-order helper**

Create `src/lib/__tests__/stationTypes.test.ts`:

```ts
import { dialOrder, NATIONAL_EMERGENCY_PHONE, CachedStation } from "../stationTypes";

const station = (contacts: CachedStation["contacts"]): CachedStation => ({
  id: "s1",
  name: "Test Station",
  region: "Greater Accra Region",
  district: "Accra Metropolitan District",
  lat: 5.55,
  lng: -0.2,
  contacts,
});

describe("dialOrder", () => {
  it("puts the highest response rate first", () => {
    const got = dialOrder(
      station([
        { phone: "0299346018", responseRate: 0.5, active: true },
        { phone: "0302666576", responseRate: 1.0, active: true },
      ])
    );
    expect(got[0]).toBe("0302666576");
  });

  it("skips inactive contacts", () => {
    const got = dialOrder(
      station([{ phone: "0302666576", responseRate: 1.0, active: false }])
    );
    expect(got).not.toContain("0302666576");
  });

  it("always ends with the national number", () => {
    const got = dialOrder(
      station([{ phone: "0302666576", responseRate: 1.0, active: true }])
    );
    expect(got[got.length - 1]).toBe(NATIONAL_EMERGENCY_PHONE);
  });

  it("never duplicates the national number", () => {
    const got = dialOrder(
      station([
        { phone: "192", responseRate: 0.1, active: true },
        { phone: "0302666576", responseRate: 1.0, active: true },
      ])
    );
    expect(got.filter((p) => p === NATIONAL_EMERGENCY_PHONE)).toHaveLength(1);
  });

  it("returns just the national number when nothing is active", () => {
    expect(dialOrder(station([]))).toEqual([NATIONAL_EMERGENCY_PHONE]);
  });

  it("breaks rate ties deterministically", () => {
    const a = dialOrder(
      station([
        { phone: "0999999999", responseRate: 0.5, active: true },
        { phone: "0111111111", responseRate: 0.5, active: true },
      ])
    );
    expect(a[0]).toBe("0111111111");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest src/lib/__tests__/stationTypes.test.ts
```

Expected: FAIL — `dialOrder` is not exported.

- [ ] **Step 3: Rewrite `src/lib/stationTypes.ts`**

Replace the whole file. `Station`, `StationSnapshot`, and `StationLocation` are removed — nothing keeps a single pinned station any more. `NATIONAL_EMERGENCY_PHONE` and the `ApiStation*` wire types are preserved unchanged:

```ts
export const STATION_TABLE_VERSION = 2 as const;

/** Ghana's national fire emergency number — the last-resort dial target. */
export const NATIONAL_EMERGENCY_PHONE = "192";

export type StationContact = {
  phone: string;
  responseRate: number;
  active: boolean;
};

export type CachedStation = {
  id: string;
  name: string;
  region: string;
  district: string;
  lat: number;
  lng: number;
  contacts: StationContact[];
};

/**
 * The whole national table. Small enough (~23 KB) to hold in full, which is
 * why there is no partial cache, no radius of validity, and no expiry.
 */
export type StationTable = {
  schemaVersion: typeof STATION_TABLE_VERSION;
  /** ISO 8601, or null when this is the untouched bundled table. */
  refreshedAt: string | null;
  source: "bundled" | "network";
  stations: CachedStation[];
};

export type RankedStation = CachedStation & { distanceMeters: number };

/**
 * Numbers to try, best first, always ending with 192. Mirrors the server's
 * Station.PrimaryPhone ordering (highest responseRate, ties broken by the
 * lexicographically smallest phone) and then extends it into a full chain,
 * so "if no answer, try..." needs no extra logic.
 */
export function dialOrder(station: CachedStation): string[] {
  const ranked = station.contacts
    .filter((c) => c.active)
    .slice()
    .sort((a, b) =>
      a.responseRate !== b.responseRate
        ? b.responseRate - a.responseRate
        : a.phone.localeCompare(b.phone)
    )
    .map((c) => c.phone);

  const withoutNational = ranked.filter((p) => p !== NATIONAL_EMERGENCY_PHONE);
  return [...new Set([...withoutNational, NATIONAL_EMERGENCY_PHONE])];
}

/** Wire shape returned by GET /v1/stations. Snake_case, mirrors the Go DTO. */
export type ApiStationContact = {
  phone: string;
  response_rate: number;
  active: boolean;
};

export type ApiStation = {
  id: string;
  name: string;
  region: string;
  district: string;
  lat: number;
  lng: number;
  distance_meters: number;
  primary_phone: string;
  contacts: ApiStationContact[];
};
```

- [ ] **Step 4: Rewrite `src/lib/stationCache.ts`**

The critical property: **the read never returns empty.** A cache miss, a version mismatch, or corrupt JSON all degrade to the bundled table, which is why the old `FALLBACK_STATION` machinery disappears in Task 6:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import bundled from "../data/stations.bundled.json";
import {
  CachedStation,
  STATION_TABLE_VERSION,
  StationTable,
} from "./stationTypes";

const TABLE_KEY = "firereach.stations.v2";
/** Written by the pre-bundle single-station cache. Removed, never read. */
const LEGACY_SNAPSHOT_KEY = "firereach.nearestStation.v1";

/**
 * Every key this module owns. SettingsScreen clears exactly these — never
 * AsyncStorage.clear(), which would also wipe onboarding and theme.
 */
export const STATION_CACHE_KEYS = [TABLE_KEY, LEGACY_SNAPSHOT_KEY];

export function bundledTable(): StationTable {
  return {
    schemaVersion: STATION_TABLE_VERSION,
    refreshedAt: null,
    source: "bundled",
    stations: bundled as CachedStation[],
  };
}

/**
 * Never returns null. A miss, a version mismatch, or corrupt JSON all fall
 * back to the table compiled into the binary, so there is no app state in
 * which the user has no stations at all.
 */
export async function readStationTable(): Promise<StationTable> {
  try {
    const raw = await AsyncStorage.getItem(TABLE_KEY);
    if (!raw) return bundledTable();
    const parsed = JSON.parse(raw) as StationTable;
    if (parsed.schemaVersion !== STATION_TABLE_VERSION) return bundledTable();
    if (!Array.isArray(parsed.stations) || parsed.stations.length === 0) {
      return bundledTable();
    }
    return parsed;
  } catch {
    return bundledTable();
  }
}

export async function writeStationTable(table: StationTable): Promise<void> {
  await AsyncStorage.setItem(TABLE_KEY, JSON.stringify(table));
}

/** Removes only this module's keys. Reads then degrade to the bundled table. */
export async function clearStationCache(): Promise<void> {
  await AsyncStorage.multiRemove(STATION_CACHE_KEYS);
}
```

- [ ] **Step 5: Scope the Settings clear button**

In `src/screens/SettingsScreen.tsx`, replace the `AsyncStorage.clear()` call at line 92. It currently also wipes `@firereach_onboarding_complete` and `@firereach_theme`, restarting onboarding and resetting the theme:

```tsx
          onPress: async () => {
            await clearStationCache();
            Alert.alert(
              "Done",
              "Cached station data cleared. The app will use its built-in station list until it can refresh."
            );
          },
```

Add `import { clearStationCache } from "../lib/stationCache";`. If the `AsyncStorage` import is now unused in this file, remove it — `npx tsc --noEmit` will not catch an unused import, so check by hand.

- [ ] **Step 6: Run tests and typecheck**

```bash
npx jest && npx tsc --noEmit
```

Expected: `dialOrder` tests pass. **`tsc` will report errors in `stationsApi.ts` and `useNearestStation.ts`**, which still reference the deleted `Station`/`StationSnapshot` types — Tasks 5 and 6 fix those. Record the errors in your report; do not fix them here, and do not commit until Step 7.

- [ ] **Step 7: Commit**

Committing with known typecheck errors is deliberate: the type change and its two consumers are three reviewable units.

```bash
git add src/lib/stationTypes.ts src/lib/stationCache.ts src/lib/__tests__/stationTypes.test.ts src/screens/SettingsScreen.tsx
git commit -m "feat(cache): hold the whole station table with a bundled fallback"
```

---

## Task 5: Fetch the full table

**Files:**
- Modify: `src/lib/stationsApi.ts`

**Interfaces:**
- Consumes: `apiGet` from `./apiClient`; `ApiStation`, `CachedStation` from `./stationTypes`
- Produces: `fetchAllStations(): Promise<CachedStation[]>`, `toCachedStation(api: ApiStation): CachedStation`

- [ ] **Step 1: Rewrite `src/lib/stationsApi.ts`**

`toStation` dropped `lat`, `lng`, `district`, and `contacts` — every one of which offline resolution needs. `getNearestStations` and `MAX_PLAUSIBLE_DISTANCE_METERS` are removed: ranking is now local, and an implausible distance is a position problem the hook reports rather than a filter that silently empties the list.

```ts
import { apiGet } from "./apiClient";
import { ApiStation, CachedStation } from "./stationTypes";

/** Ghana's approximate centroid. */
const GHANA_LAT = 7.9465;
const GHANA_LNG = -1.0232;
/** Comfortably above the real station count; the server caps nothing. */
const ALL_STATIONS_LIMIT = 500;

/** Wire shape to cache shape. Keeps every field — offline needs all of them. */
export function toCachedStation(api: ApiStation): CachedStation {
  return {
    id: api.id,
    name: api.name,
    region: api.region,
    district: api.district,
    lat: api.lat,
    lng: api.lng,
    contacts: (api.contacts ?? []).map((c) => ({
      phone: c.phone,
      responseRate: c.response_rate ?? 0,
      active: c.active ?? true,
    })),
  };
}

/**
 * The whole active station table.
 *
 * The endpoint requires coordinates and returns nearest-N, so this anchors at
 * Ghana's centroid with a limit above the real row count. Wasteful in principle,
 * free in practice at ~23 KB, and it needs no API change. If a bulk endpoint or
 * conditional GET is ever added, only this function changes.
 */
export async function fetchAllStations(): Promise<CachedStation[]> {
  const raw = await apiGet<ApiStation[] | null>("/v1/stations", {
    lat: GHANA_LAT,
    lng: GHANA_LNG,
    limit: ALL_STATIONS_LIMIT,
  });

  if (!Array.isArray(raw)) return [];
  return raw.map(toCachedStation);
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: errors now only in `src/hooks/useNearestStation.ts`, which Task 6 rewrites. `stationsApi.ts` itself must be clean. Record the remaining errors in your report.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stationsApi.ts
git commit -m "feat(api): fetch the full station table, preserving every field"
```

---

## Task 6: Local-first resolution

**Files:**
- Modify: `src/hooks/useNearestStation.ts`

**Interfaces:**
- Consumes: `nearestStations` (Task 3); `readStationTable`, `writeStationTable`, `bundledTable` (Task 4); `fetchAllStations` (Task 5)
- Produces: `useNearestStation(): NearestStationState` with `{ nearest, alternatives, table, position, positionSource, isResolving, hasError, refresh }`

Four defects die in this rewrite, all currently in the file:

1. The offline branch returns **before** reading position, which is the single reason offline nearest-station is impossible today.
2. `getLastKnownPositionAsync()` is called unbounded, so it can return a days-old fix hundreds of kilometres away, rank stations from it, and persist that as fresh.
3. `getCurrentPositionAsync` has no timeout and can hang indefinitely on a device with no GPS lock.
4. `FALLBACK_STATION` and its three never-persist guards exist only because the cache could be empty. It cannot be any more.

- [ ] **Step 1: Replace the whole file**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import * as Network from "expo-network";
import {
  CachedStation,
  RankedStation,
  STATION_TABLE_VERSION,
  StationTable,
} from "../lib/stationTypes";
import {
  bundledTable,
  readStationTable,
  writeStationTable,
} from "../lib/stationCache";
import { nearestStations } from "../lib/geo";
import { fetchAllStations } from "../lib/stationsApi";

/** A last-known fix older than this is not trusted to pick a station. */
const MAX_LAST_KNOWN_AGE_MS = 10 * 60 * 1000;
/** Metres. A coarser last-known fix is ignored in favour of a live one. */
const MAX_LAST_KNOWN_ACCURACY_M = 5000;
/** Cold GPS on a low-end device can never lock. Settle rather than hang. */
const POSITION_TIMEOUT_MS = 6000;
/** Refresh the table at most this often. Fire stations do not move. */
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Ghana's longest dimension is roughly 670 km, so a "nearest" station beyond
 * this means a bad GPS fix or a user outside the country — not a usable answer.
 * Deliberately generous: station coverage is sparse in rural areas and a
 * legitimate rural user must not be rejected.
 *
 * Ranking used to be filtered at fetch time, but filtering there would shrink
 * the cached table itself. It belongs here instead, where it affects only what
 * is presented. Without it, a simulator sitting in San Francisco ranks a
 * station 11,746 km away as "nearest" and the app offers to dial it.
 */
const MAX_PLAUSIBLE_DISTANCE_METERS = 500_000;

export type ResolvedPosition = { lat: number; lng: number };
/** `implausible` means we have a fix, but it puts the user nowhere near Ghana. */
export type PositionSource = "live" | "lastKnown" | "none" | "implausible";

export type NearestStationState = {
  nearest: RankedStation | null;
  /** The next-nearest stations, for "other stations near you". */
  alternatives: RankedStation[];
  table: StationTable;
  position: ResolvedPosition | null;
  positionSource: PositionSource;
  isResolving: boolean;
  hasError: boolean;
  refresh: () => Promise<void>;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/**
 * Best available position. A bounded last-known fix is preferred because it
 * is instant; a live fix is raced against a timeout so a device that can
 * never lock still settles instead of hanging.
 */
async function resolvePosition(): Promise<{
  position: ResolvedPosition | null;
  source: PositionSource;
}> {
  const { status } = await Location.getForegroundPermissionsAsync();
  let granted = status === "granted";
  if (!granted) {
    const ask = await Location.requestForegroundPermissionsAsync();
    granted = ask.status === "granted";
  }
  if (!granted) return { position: null, source: "none" };

  const last = await Location.getLastKnownPositionAsync({
    maxAge: MAX_LAST_KNOWN_AGE_MS,
    requiredAccuracy: MAX_LAST_KNOWN_ACCURACY_M,
  });
  if (last) {
    return {
      position: { lat: last.coords.latitude, lng: last.coords.longitude },
      source: "lastKnown",
    };
  }

  const live = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    POSITION_TIMEOUT_MS
  );
  if (live) {
    return {
      position: { lat: live.coords.latitude, lng: live.coords.longitude },
      source: "live",
    };
  }

  return { position: null, source: "none" };
}

function isStale(table: StationTable): boolean {
  if (!table.refreshedAt) return true;
  const age = Date.now() - Date.parse(table.refreshedAt);
  // A negative age means the device clock moved backwards. Treat it as stale
  // rather than trusting a timestamp from the future.
  return Number.isNaN(age) || age < 0 || age > REFRESH_INTERVAL_MS;
}

export function useNearestStation(): NearestStationState {
  const [table, setTable] = useState<StationTable>(bundledTable);
  const [position, setPosition] = useState<ResolvedPosition | null>(null);
  const [positionSource, setPositionSource] = useState<PositionSource>("none");
  const [isResolving, setIsResolving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    setIsResolving(true);
    setHasError(false);

    try {
      inFlight.current = true;

      // 1. Local data first. This never fails and never returns empty, so a
      //    usable answer exists before any network or GPS work is attempted.
      const localTable = await readStationTable();
      setTable(localTable);

      // 2. Position. Ranking happens against whatever table we already have,
      //    so being offline changes nothing about this step.
      const resolved = await resolvePosition();
      setPosition(resolved.position);
      setPositionSource(resolved.source);

      // 3. Network refresh, strictly an upgrade of the inputs. Never gates
      //    the answer. Both expo-network fields are optional; if neither is
      //    reported, fail OPEN and let the request timeout decide.
      const netState = await Network.getNetworkStateAsync();
      const online =
        netState.isInternetReachable ?? netState.isConnected ?? true;
      if (!online || !isStale(localTable)) return;

      const fresh = await fetchAllStations();
      if (fresh.length === 0) return; // Never replace real data with nothing.

      const next: StationTable = {
        schemaVersion: STATION_TABLE_VERSION,
        refreshedAt: new Date().toISOString(),
        source: "network",
        stations: fresh,
      };
      setTable(next);
      await writeStationTable(next);
    } catch (err) {
      console.warn("[useNearestStation] refresh failed", err);
      setHasError(true);
      // The table in state is already the best available. Nothing to undo.
    } finally {
      inFlight.current = false;
      setIsResolving(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived, never persisted — recomputed whenever the table or position
  // changes, so a station is never "assigned" and never goes stale.
  const allRanked: RankedStation[] = position
    ? nearestStations<CachedStation>(table.stations, position.lat, position.lng, 3)
    : [];

  // A fix that puts the nearest station beyond Ghana's own extent is not a
  // usable answer. Report it as implausible rather than offering to dial a
  // station on another continent.
  const implausible =
    allRanked.length > 0 &&
    allRanked[0].distanceMeters > MAX_PLAUSIBLE_DISTANCE_METERS;

  const ranked = implausible ? [] : allRanked;

  return {
    nearest: ranked[0] ?? null,
    alternatives: ranked.slice(1),
    table,
    position,
    positionSource: implausible ? "implausible" : positionSource,
    isResolving,
    hasError,
    refresh,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: errors now only in `src/screens/HomeScreen.tsx`, which consumes the old `snapshot` shape. Task 7 fixes it. Record them.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNearestStation.ts
git commit -m "feat(hook): resolve the nearest station locally, offline included"
```

---

## Task 7: Honest home screen

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

**Interfaces:**
- Consumes: `useNearestStation` (Task 6), `dialOrder` (Task 4)
- Produces: no exported interface change

- [ ] **Step 1: Update the hook usage and dial handling**

Replace the destructuring and both handlers. `dialOrder` gives the full chain, so the primary button dials the first entry and the row beneath offers the rest — the precedence question is deliberately left exactly as the data already orders it:

```tsx
  const { nearest, table, positionSource, refresh, isResolving } =
    useNearestStation();

  const numbers = nearest ? dialOrder(nearest) : [NATIONAL_EMERGENCY_PHONE];
  const primaryNumber = numbers[0];
  const alternates = numbers.slice(1);

  const dial = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch((err) =>
      console.warn("[HomeScreen] dial failed", err)
    );
  };
```

Add `import { dialOrder, NATIONAL_EMERGENCY_PHONE } from "../lib/stationTypes";` (replacing the existing import from that module).

- [ ] **Step 2: Make the status pill honest**

It currently claims `"ONLINE · GPS ACTIVE"` whenever `isOnline !== false`, including when location permission is denied. Drive it from real state:

```tsx
  const statusLabel =
    positionSource === "none"
      ? "NO LOCATION"
      : positionSource === "implausible"
      ? "LOCATION OUTSIDE GHANA"
      : isOnline !== false
      ? "ONLINE · GPS ACTIVE"
      : "OFFLINE · SAVED LIST";

  const statusColor =
    positionSource === "none" || positionSource === "implausible"
      ? colors.warning
      : isOnline !== false
      ? colors.success
      : colors.warning;
```

`nearest` is `null` in the implausible case, so the station card and call button already fall back to their no-station copy — but that copy currently reads "Turn on location to find your station", which is wrong here since location *is* on. Make the card's heading account for it:

```tsx
            <Text variant="heading2">
              {nearest?.name ??
                (positionSource === "implausible"
                  ? "No station near your location"
                  : "Turn on location to find your station")}
            </Text>
```

The primary button still dials `192` in this state, because `dialOrder` falls back to the national number when there is no station.

Use `statusLabel` and `statusColor` in the existing pill in place of the two inline ternaries.

- [ ] **Step 3: Correct the offline banner copy**

The old copy said "showing last known station", which is no longer what happens — the station is computed live from the bundled list:

```tsx
              No internet — using the saved station list
```

- [ ] **Step 4: Render the station card from `nearest`**

Replace the three `station?.` references:

```tsx
              <Text variant="label" color="#FFFFFF">
                {nearest ? formatDistance(nearest.distanceMeters) : "Locating…"}
              </Text>
```

```tsx
            <Text variant="heading2">
              {nearest?.name ?? "Turn on location to find your station"}
            </Text>
            <Text
              variant="caption"
              weight="medium"
              color={theme.textSecondary}
              style={styles.stationRegion}
            >
              {nearest ? `${nearest.district}, ${nearest.region}` : ""}
            </Text>
```

- [ ] **Step 5: Wire the call buttons to the dial chain**

Primary:

```tsx
        <TouchableOpacity
          style={styles.callButton}
          activeOpacity={0.85}
          onPress={() => dial(primaryNumber)}
        >
          <PhoneIcon size={28} color="#FFFFFF" weight="fill" />
          <Text variant="bodyLarge" weight="bold" color="#FFFFFF">
            {nearest ? `Call ${shortName(nearest.name)}` : "Call Emergency"}
          </Text>
        </TouchableOpacity>
```

Replace the single "Call 192 instead" button with the full chain, so a busy line has a next step:

```tsx
        {alternates.length > 0 && (
          <View style={styles.alternatesRow}>
            <Text variant="caption" color={theme.textTertiary}>
              If no answer:
            </Text>
            {alternates.map((phone) => (
              <TouchableOpacity
                key={phone}
                activeOpacity={0.6}
                onPress={() => dial(phone)}
              >
                <Text variant="caption" weight="semiBold" color={colors.brandPrimary}>
                  {phone === NATIONAL_EMERGENCY_PHONE ? "192 (national)" : phone}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
```

Add to `StyleSheet.create`:

```tsx
  alternatesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 12,
    marginTop: -8,
  },
```

- [ ] **Step 6: Add the freshness line**

Below the station card. Quiet, never red, never blocking — a stale list is still the best answer available:

```tsx
        <Text
          variant="caption"
          color={theme.textTertiary}
          style={styles.freshness}
        >
          {table.source === "bundled"
            ? "Using the station list built into the app"
            : `Station list updated ${new Date(
                table.refreshedAt as string
              ).toLocaleDateString()}`}
        </Text>
```

```tsx
  freshness: {
    textAlign: "center",
    marginTop: -8,
  },
```

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit
```

Expected: **no output.** This is the first task since Task 4 where the tree fully typechecks; if anything still errors, it is a real gap.

- [ ] **Step 8: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat(home): honest status, live-derived station, and a dial chain"
```

---

## Task 8: Wire the Stations tab to real data

`StationsListScreen.tsx` and `StationDetailScreen.tsx` are static mockups whose hardcoded coordinates are **New York** (`40.7128° N, 74.0060° W`) in a Ghana emergency app. They never touch the API or the cache. Now that the full table is on-device they become the cheapest real screens in the app — and they work offline.

**Files:**
- Modify: `src/screens/stations/StationsListScreen.tsx`
- Modify: `src/screens/stations/StationDetailScreen.tsx`

**Interfaces:**
- Consumes: `useNearestStation` (Task 6), `dialOrder` (Task 4), `readStationTable` (Task 4)
- Produces: no exported interface change

- [ ] **Step 1: Drive the list from the cached table**

In `StationsListScreen.tsx`, delete the hardcoded `STATIONS_DATA` constant and source the sections from the hook. The screen already renders a region-keyed `SectionList`, so only the data source changes:

```tsx
  const { table, position } = useNearestStation();

  const sections = useMemo(() => {
    const ranked = position
      ? nearestStations(table.stations, position.lat, position.lng, table.stations.length)
      : table.stations.map((s) => ({ ...s, distanceMeters: 0 }));

    const byRegion = new Map<string, typeof ranked>();
    for (const s of ranked) {
      const list = byRegion.get(s.region) ?? [];
      list.push(s);
      byRegion.set(s.region, list);
    }
    return [...byRegion.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data }));
  }, [table, position]);
```

Add `import { useMemo } from "react";` and `import { nearestStations } from "../../lib/geo";`.

Render each row's distance only when a position exists — showing "0 km" for every station with location off would be a lie:

```tsx
          {position ? formatDistance(item.distanceMeters) : item.district}
```

- [ ] **Step 2: Drive the detail screen from the table**

In `StationDetailScreen.tsx`, delete the hardcoded `STATION` object and look the station up by the `stationId` route param that `navigation/types.ts` already declares:

```tsx
  const { stationId } = route.params;
  const [station, setStation] = useState<CachedStation | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const table = await readStationTable();
      if (cancelled) return;
      setStation(table.stations.find((s) => s.id === stationId) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [stationId]);
```

Render `station.name`, `station.district`, `station.region`, and `dialOrder(station)` for the call buttons. Replace the hardcoded maps deep-link with the station's real coordinates:

```tsx
  const handleOpenMaps = () => {
    if (!station) return;
    Linking.openURL(
      `https://maps.google.com/?q=${station.lat},${station.lng}`
    ).catch((err) => console.warn("[StationDetail] open maps failed", err));
  };
```

While `station` is null, render the existing layout with empty strings rather than an early return, so there is no flash of a blank screen.

- [ ] **Step 3: Confirm no mock data survives**

```bash
grep -rn "40.7128\|74.0060\|STATIONS_DATA\|Downtown District\|Zone 7" src/
```

Expected: **no output.**

- [ ] **Step 4: Typecheck and test**

```bash
npx tsc --noEmit && npx jest
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/screens/stations/
git commit -m "feat(stations): drive the stations tab from the cached table"
```

---

## Verification

Run after Task 8. The simulator steps are human-driven — a subagent cannot grant a permission dialog or toggle airplane mode.

**Automated**

```bash
npx tsc --noEmit && npx jest
npm run build:stations && git diff --exit-code src/data/stations.bundled.json
grep -rn "FALLBACK_STATION\|StationSnapshot\|getNearestStations" src/   # expect no output
```

**Human, on the simulator** (`npx expo run:ios`, API stack on :9000)

1. **Airplane mode, fresh install.** Delete the app first. Set Simulator location to Accra (`5.5493, -0.2073`), enable airplane mode, launch, grant location. A real Accra station must appear with a real distance, and the freshness line must read "Using the station list built into the app". **This is the headline case and it fails today.**
2. **Travel test.** Online in Accra first, then airplane mode, then change Simulator location to Kumasi (`6.6885, -1.6244`) and pull to refresh. Must resolve to a Kumasi station — not the stale Accra one.
3. **No permission, offline, never online.** Fresh install, deny location, airplane mode. The screen must stay usable with `192` dialable and the pill reading "NO LOCATION" — no spinner, no dead button.
4. **Dial chain.** With a station shown, confirm the "If no answer" row lists the regional number and `192`, and that each dials.
5. **Clock skew.** Set the device clock back a year. The freshness line must not show a negative or absurd age, and a refresh must still be attempted.
6. **Settings → Clear cached data.** Onboarding must not restart, the theme must survive, and the station card must still show a station from the bundled list.
7. **Stations tab.** Confirm real Ghana stations grouped by region, sorted by distance, and that tapping one opens a detail screen with matching data. Works in airplane mode.

**Note:** there is no `android/` directory — only iOS has ever been built. The target hardware is low-end Android, so that gap should be closed before this is considered done.

---

## Self-review notes

- **Design coverage.** Bundled dataset → Task 2. On-device haversine → Task 3. Widened types and never-empty cache → Task 4. Full-field fetch → Task 5. Resolver rewrite with all four named bugs → Task 6. Honest status, dial chain, freshness → Task 7. Mockup screens → Task 8. `AsyncStorage.clear()` → Task 4 Step 5.
- **Deliberate deviation.** The design did not call for a test harness; Task 1 adds one, scoped to `src/lib/`. `geo.ts` decides which station an emergency caller is sent to, is pure, and has authoritative expected values in the Go suite. Flagged here because it reverses a convention two earlier plans set.
- **Deliberate intermediate breakage.** Tasks 4, 5, and 6 each commit with known `tsc` errors in their not-yet-updated consumers. The alternative is one enormous commit spanning types, cache, API client, hook, and screen. Each task states exactly which errors are expected; anything else is a real failure.
- **Not in this plan.** Saved places and the read-aloud card — the design's Phase 2 — get their own plan; they are independently shippable and this one is already eight tasks. Also deferred: dial-target precedence, a `verification` field on contacts, SMS/USSD in any form, ETag/`updated_at` on the API, GhanaPostGPS, gazetteer, offline submission queue.
- **Type consistency.** `CachedStation`, `StationContact`, `StationTable`, `RankedStation`, `dialOrder`, `readStationTable`, `writeStationTable`, `bundledTable`, `STATION_CACHE_KEYS`, `fetchAllStations`, `toCachedStation`, `haversineMeters`, `nearestStations` are defined once and referenced by those exact names throughout. `Station`, `StationSnapshot`, `StationLocation`, `FALLBACK_STATION`, `getNearestStations`, `toStation`, and `MAX_PLAUSIBLE_DISTANCE_METERS` are all removed, and the Task 8 grep proves it.
