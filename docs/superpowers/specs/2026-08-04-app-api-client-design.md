# FireReach App ↔ API Wiring — Design Spec

**Date:** 2026-08-04
**Status:** Approved, ready for implementation planning
**Scope:** Spans two separate git repositories — `app/` (Expo/React Native) and `api/` (Go). Neither is a submodule of the other; changes land as independent commits in each.

## Problem

The Go API is feature-complete and has never been called. There is no HTTP client anywhere in `app/src` on either branch — zero `fetch`, no HTTP dependency in `package.json`. `useNearestStation.ts:33` reads:

```ts
// TODO: replace with real API call when /stations/nearest endpoint exists.
// Returning hardcoded data so the pipeline works end-to-end.
```

The endpoint does exist, at `GET /v1/stations?lat=&lng=&limit=`. Three things block the connection:

1. **The app's data layer only exists on `feature/swift-widget`**, a deferred branch. `main` has no `src/lib` and no `src/hooks`.
2. **The API computes distance and discards it.** `sortByDistance` runs haversine purely to order results; `domain.Station` has no distance field and `dto.StationResponse.Distance` is never populated — and being `omitempty`, it vanishes from the JSON entirely. The app renders `distanceMeters`.
3. **The API returns `contacts[]`; the app dials a single `phone`.** Nobody decides which number wins.

There is also no station data anywhere — zero `INSERT INTO stations` in the repo — so even a correctly wired app would render an empty list.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Cherry-pick Phase 1 (`49e1d23..2ec9ee8` — four commits: `91195f3`, `dd2a9a9`, `af97312`, `2ec9ee8`) onto app `main`, then wire there | Verified widget-free: 7 files, zero `WidgetBridge` references. They were authored directly on `49e1d23`, which is already an ancestor of `main`, so they replay cleanly onto `a6e521b`. `feature/swift-widget` keeps its own commits on top and rebases without conflict. |
| 2 | API returns `distance_meters`; client never computes distance | The server already does the math; duplicating haversine in TypeScript now and Swift later invites drift. |
| 3 | API returns `primary_phone`; server picks the contact | "Which number actually answers" is domain logic about station reliability — belongs in Go once, not in TS now and Swift later. |
| 4 | Base URL from `EXPO_PUBLIC_API_URL` | Native in SDK 55, no new dependency, mirrors how `api/` already does `.env` + `.env.example`. |
| 5 | Stations only; content / AI / submissions deferred | Smallest change proving the whole path. The client is built so later endpoints are thin call sites. |
| 6 | Seed from OSM coordinates + official GNFS regional numbers | Every value traces to a citable source; no fuzzy name-joins and no fabricated per-station numbers. |
| 7 | `response_rate` encodes **publication order**, not measurement | See "Honest data caveats" — this is the weakest part of the design and is documented as such in the seed file itself. |
| 8 | Standardize the API on port `8080`; fix `docker-compose.yml` | `.env.example` and the Makefile already assume 8080; only compose disagrees (40000). |
| 9 | Simulator-only verification; no ATS entitlement | Simulator-to-`localhost` is exempt from App Transport Security. Device testing over a LAN IP is documented as optional. |

## Architecture

### Data flow

```
HomeScreen
  └─ useNearestStation
       ├─ readStationCache() ─────────── AsyncStorage, paints instantly
       ├─ useConnectivity ────────────── offline? skip fetch, keep cache
       ├─ Location.getLastKnownPositionAsync()
       ├─ stationsApi.getNearestStations(lat, lng, 3)      ← NEW
       │    └─ apiClient → GET /v1/stations?lat=&lng=&limit=3
       ├─ writeStationCache(fresh)
       └─ (widget branch later: WidgetBridge.writeStationCache)
```

Only `resolveNearestStation` changes inside the hook. Cache-first paint, permission-denied fallback, and stale-over-nothing all stay as they are.

### New app modules

Each has one job and a single reason to change:

| File | Responsibility | Depends on |
|---|---|---|
| `src/lib/apiConfig.ts` | `API_BASE_URL`, `API_TIMEOUT_MS` | `process.env` only |
| `src/lib/apiClient.ts` | `fetch` wrapper: timeout, JSON parse, `ApiError` | `apiConfig` |
| `src/lib/stationsApi.ts` | `getNearestStations()`, `ApiStation → Station` mapper | `apiClient`, `stationTypes` |

`stationTypes.ts` gains `ApiStation` (wire shape) beside the existing `Station` (app shape). The mapper is the only place the two meet, so the API can add fields without touching the cache schema or the widget's `StationSnapshot`.

```ts
export type ApiStation = {
  id: string;
  name: string;
  region: string;
  district: string;
  lat: number;
  lng: number;
  distance_meters: number;
  primary_phone: string;
  contacts: { phone: string; response_rate: number; active: boolean }[];
};
```

The mapper drops `district`, `lat`, `lng`, and `contacts`, and falls back to `192` when `primary_phone` is empty.

### API changes

| Change | File |
|---|---|
| `Station.DistanceMeters int` — transient, per-request, not persisted | `internal/domain/station.go` |
| `Station.PrimaryPhone()` — active contact with highest `response_rate`, tiebreak lowest phone, `""` if none | `internal/domain/station.go` |
| Compute distance once per station, then sort on the stored value | `internal/usecase/station/list_nearest.go` |
| `distance_meters int`, `primary_phone string`; remove the never-populated `distance` | `internal/adapter/dto/station.go` |
| `PORT=8080` | `docker-compose.yml` |

`sortByDistance` currently recomputes haversine on both sides of every comparison — O(n log n) trig calls for a value it discards. Computing once into the field fixes that and enables the feature in the same change.

`GetByID` returns a single station with no user coordinates, so `distance_meters` is `0` there. That is deliberate: the field means "distance from the coordinates you supplied", and `/v1/stations/:id` supplies none.

### Error handling

The hook's existing posture is correct; the client only needs to fail in ways it understands.

| Condition | Behavior |
|---|---|
| Timeout (8s, `AbortSignal.timeout`) | `hasError = true`, cached snapshot retained |
| Non-2xx | `ApiError` carrying `status`, same retention |
| Empty array | Treated as "no station found" — keep cache, else `FALLBACK_STATION` (192) |
| Offline (`useConnectivity`) | Skip the fetch entirely rather than burn a timeout |
| Any failure | Never clear a good snapshot |

## Seed data

`api/seeds/build_seed.py` — committed, re-runnable, records its own provenance — generates `api/seeds/dev_stations.sql`, run via `make seed`. Kept out of `migrations/` so production schema history stays clean and these rows never ship by accident.

**The generated `dev_stations.sql` is committed alongside the script.** `make seed` applies that file and needs no network access; `build_seed.py` exists so the derivation is auditable and repeatable, not as a build-time dependency. Re-running it against live OSM may legitimately produce different rows.

| Field | Source | License / vintage |
|---|---|---|
| Name, lat, lng | OSM Overpass, `amenity=fire_station` in Ghana — 79 features, 57 named | ODbL, fetched 2026-08-04 |
| Region, district | Nominatim reverse geocode (`state`, `county`) | ODbL, fetched 2026-08-04 |
| Contacts | GNFS official contact-numbers page | Archived 2022-08-09 |

Every generated row carries a comment naming its source and fetch date.

### Region → contacts mapping

The archived GNFS page predates the 2019 regional reorganization, so it lists 12 commands while Nominatim returns the modern 16 regions. Successor regions inherit their predecessor's command:

| Modern region (Nominatim) | GNFS command | Numbers |
|---|---|---|
| Greater Accra | Greater Accra | 0302666576, 0299346018 |
| Ashanti | Ashanti | 0322022221, 0299346044 |
| Eastern | Eastern | 0302982062, 0299346041 |
| Central | Central | 0332132902, 0299340499 |
| Western | Western | 0312193521, 0299346040 |
| Western North | Western (successor) | 0312193521, 0299346040 |
| Volta | Volta | 0362026679, 0299346042 |
| Oti | Volta (successor) | 0362026679, 0299346042 |
| Northern | Northern | 0299346046 (see caveat), 0322022864 |
| Savannah, North East | Northern (successor) | 0299346046, 0322022864 |
| Bono, Bono East, Ahafo | Brong Ahafo (predecessor) | 0352027129, 0299340249 |
| Upper East | Upper East | 0382022277 |
| Upper West | Upper West | 0392022389 |
| *unmapped / null* | National Fire Master Control | 0302772446, 0299340383 |

`192` is appended to every station as a final fallback contact (`active = true`, `response_rate = 0.1`), so `PrimaryPhone()` can never return `""` for a seeded station.

### Honest data caveats

These are recorded in the seed file header, not just here.

1. **`response_rate` is not a measurement.** No published GNFS response-rate data exists. The seed encodes *publication order* — first-listed number `1.0`, second `0.5`, `192` fallback `0.1` — solely to make `PrimaryPhone()` deterministic. The field name overstates what the value means. If real reliability data ever arrives, it replaces these wholesale.

2. **Northern regional landline is disputed.** The official page lists `0322022864`, but `032` is the Kumasi/Ashanti prefix while Tamale is `037`; an independent aggregator lists `0372022864`. Because we cannot verify which is correct, the seed makes the **undisputed** `0299346046` primary and places the disputed landline second with a `-- DISCREPANCY` comment.

3. **GNFS numbers are four years old** (archived 2022) and the live site currently returns HTTP 500 across the domain, so they cannot be re-verified right now.

4. **OSM names are inconsistent** — four separate entries are named only "Ghana Fire Service", others "Fire station" or "fire service station". Only the 57 named features are seeded; the 22 unnamed ones are skipped.

5. **ODbL obligations.** OSM-derived data requires attribution and carries share-alike implications for a derived database. Acceptable for dev seed data; **requires a licensing decision before production use.**

> This dataset is suitable for development and demonstration. It is **not** verified for emergency use. Before any real deployment, station numbers must be confirmed directly with GNFS.

## Testing

**Go** — extend `usecase/station/list_nearest_test.go` for `DistanceMeters` (correct values, ascending order, `limit` honored); new `domain/station_test.go` for `PrimaryPhone()` covering: highest rate wins, inactive contacts skipped, tiebreak determinism, empty-contacts returns `""`.

**TypeScript** — no Jest harness exists and this spec does not add one (consistent with the widget plan). Verification is `npx tsc --noEmit` plus the manual checks below.

**End to end**

1. `cd api && go test ./...`
2. `make docker-up && make migrate-up && make seed`
3. `curl "localhost:8080/v1/stations?lat=5.55&lng=-0.21&limit=3"` — assert `distance_meters` ascends, `primary_phone` non-empty, Accra stations rank first
4. `cd app && npx tsc --noEmit`
5. Simulator with `EXPO_PUBLIC_API_URL=http://localhost:8080` — HomeScreen shows a real station name, region, and distance
6. Airplane mode — cached snapshot still renders, no crash, no cleared state
7. Stop the API, pull-to-refresh — stale snapshot retained, error state set

## Out of scope

Content, AI-ask, and submissions endpoints. Auth and admin routes. The `sqlc`-vs-hand-written-SQL question (`sqlc.yaml` points at a directory that does not exist). Health endpoint and graceful shutdown. Moving `NewAuthHandler` off the raw pgx pool. Swift widget work, which stays deferred.

## Sources

- [GNFS contact numbers, archived 2022-08-09](http://web.archive.org/web/20220809162701/http://www.gnfs.gov.gh/contact-numbers)
- [GNFS structure](https://gnfs.gov.gh/structure-gnfs) (live site currently HTTP 500)
- [OSM Overpass API](https://overpass-api.de/) — `amenity=fire_station`, Ghana
- [Nominatim reverse geocoding](https://nominatim.openstreetmap.org/)
- [everydaynewsgh station list](https://everydaynewsgh.com/local-news/all-fire-service-stations-and-their-contacts-in-ghana-2022/) — used only for cross-validation, not as a seed source
- [Ghana National Fire and Rescue Service — Wikipedia](https://en.wikipedia.org/wiki/Ghana_National_Fire_and_Rescue_Service)
