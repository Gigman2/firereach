# FireReach App ↔ API Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `resolveNearestStation` stub in the RN app with a real call to `GET /v1/stations`, adding the two API fields the app needs and a sourced dev seed so the result is verifiable.

**Architecture:** The Go API gains `distance_meters` (already computed for sorting, currently discarded) and `primary_phone` (server-side contact selection). The app gains a three-file client — config, fetch wrapper, endpoint module — with a mapper isolating the wire shape from the app's cached `Station` shape. A generated seed derived from OpenStreetMap coordinates and official GNFS regional numbers makes the endpoint return real data.

**Tech Stack:** Go 1.26 (Gin, pgx/v5, `github.com/google/uuid`), Expo SDK 55 / React Native 0.83 / TypeScript 5.9, PostgreSQL 16, Python 3 (seed generation only).

## Global Constraints

- **Two separate git repositories.** `app/` and `api/` have independent histories and neither is a submodule. Every task states its working directory; never stage across both.
- **Spec:** `app/docs/superpowers/specs/2026-08-04-app-api-client-design.md`. Read it before starting.
- **API port is 8080** everywhere. `docker-compose.yml` is the only file that disagrees; Task 5 fixes it.
- **`stations.id` is a Postgres `UUID` column**, not text. Seed rows need real UUIDs — deterministic uuid5 values derived from OSM element IDs, never invented strings like `stn_accra`.
- **Go work is TDD.** Write the failing test, run it, watch it fail, then implement.
- **TypeScript work is not TDD.** No Jest harness exists and this plan does not add one — matching the Swift widget plan's convention. TS verification is `npx tsc --noEmit` plus the manual checks in Task 11.
- **Never fabricate station data.** Every seeded value traces to a source recorded in the seed file header.
- **`response_rate` encodes publication order, not measured reliability.** First-listed number `1.0`, second `0.5`, `192` fallback `0.1`.
- **Do not touch the Swift widget work.** `feature/swift-widget` stays deferred and untouched.

---

# Phase 1 — Bring the data layer to app `main`

## Task 1: Cherry-pick Phase 1 commits onto `main`

**Working directory:** `/Users/ericabbey/Desktop/Projects/firereach/app`

**Files:**
- Adds (via cherry-pick): `src/lib/stationTypes.ts`, `src/lib/stationCache.ts`, `src/hooks/useConnectivity.ts`, `src/hooks/useNearestStation.ts`
- Modifies (via cherry-pick): `src/screens/HomeScreen.tsx`, `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `Station`, `StationSnapshot`, `StationLocation`, `STATION_CACHE_VERSION` from `src/lib/stationTypes`; `readStationCache()`, `writeStationCache(snapshot)`, `clearStationCache()` from `src/lib/stationCache`; `useConnectivity(): { isOnline: boolean | null }`; `useNearestStation(): { snapshot, isResolving, hasError, refresh }`

- [ ] **Step 1: Confirm the starting state**

```bash
git status --short          # expect: clean
git rev-parse --abbrev-ref HEAD   # expect: main
git log --oneline -1        # expect: 93ca4c5 Add app-to-API wiring design spec
```

- [ ] **Step 2: Confirm the four commits are widget-free**

```bash
git grep -l "WidgetBridge\|widget-bridge" 2ec9ee8 -- src/ modules/
```

Expected: **no output**. If anything prints, stop — the range is not clean and the plan's premise is wrong.

- [ ] **Step 3: Cherry-pick the range**

```bash
git cherry-pick 49e1d23..2ec9ee8
```

This replays exactly four commits: `91195f3` (station types + cache), `dd2a9a9` (useConnectivity), `af97312` (useNearestStation), `2ec9ee8` (HomeScreen wiring).

If a conflict appears in `package-lock.json`, resolve by taking the incoming version and running `npm install` to regenerate:

```bash
git checkout --theirs package-lock.json && npm install && git add package-lock.json && git cherry-pick --continue
```

- [ ] **Step 4: Install the dependencies the picked commits introduced**

```bash
npm install
```

`dd2a9a9` adds `expo-network`; `91195f3` relies on `@react-native-async-storage/async-storage`, already present.

- [ ] **Step 5: Verify it typechecks**

```bash
npx tsc --noEmit
```

Expected: **no output** (success). The `WidgetBridge` import does not exist on this branch, so `useNearestStation.ts` must have no unresolved imports. If TypeScript complains about a missing `../../modules/widget-bridge/src`, the wrong commit range was picked — reset with `git reset --hard 93ca4c5` and re-check Step 2.

- [ ] **Step 6: Confirm the files landed**

```bash
ls src/lib src/hooks
```

Expected: `stationCache.ts  stationTypes.ts` and `useConnectivity.ts  useNearestStation.ts`.

- [ ] **Step 7: Verify the TODO is present and unmodified**

```bash
grep -n "TODO: replace with real API call" src/hooks/useNearestStation.ts
```

Expected: `33:  // TODO: replace with real API call when /stations/nearest endpoint exists.`

No commit needed — the cherry-pick already created four commits.

---

# Phase 2 — API changes

## Task 2: `Station.DistanceMeters` and `Station.PrimaryPhone()`

**Working directory:** `/Users/ericabbey/Desktop/Projects/firereach/api`

**Files:**
- Modify: `internal/domain/station.go`
- Test: `internal/domain/station_test.go` (create)

**Interfaces:**
- Consumes: `domain.StationContact{Phone string, ResponseRate float64, Active bool}` (already exists)
- Produces: `domain.Station.DistanceMeters int` field; `func (s Station) PrimaryPhone() string`

- [ ] **Step 1: Write the failing test**

Create `internal/domain/station_test.go`:

```go
package domain_test

import (
	"testing"

	"github.com/firereach/api/internal/domain"
)

func TestPrimaryPhone_HighestResponseRateWins(t *testing.T) {
	s := domain.Station{Contacts: []domain.StationContact{
		{Phone: "0302666576", ResponseRate: 0.5, Active: true},
		{Phone: "0299346018", ResponseRate: 1.0, Active: true},
		{Phone: "192", ResponseRate: 0.1, Active: true},
	}}
	if got := s.PrimaryPhone(); got != "0299346018" {
		t.Errorf("expected highest-rate contact, got %q", got)
	}
}

func TestPrimaryPhone_SkipsInactive(t *testing.T) {
	s := domain.Station{Contacts: []domain.StationContact{
		{Phone: "0302666576", ResponseRate: 1.0, Active: false},
		{Phone: "192", ResponseRate: 0.1, Active: true},
	}}
	if got := s.PrimaryPhone(); got != "192" {
		t.Errorf("expected inactive contact skipped, got %q", got)
	}
}

func TestPrimaryPhone_TiebreakIsDeterministic(t *testing.T) {
	a := domain.Station{Contacts: []domain.StationContact{
		{Phone: "0999999999", ResponseRate: 0.5, Active: true},
		{Phone: "0111111111", ResponseRate: 0.5, Active: true},
	}}
	b := domain.Station{Contacts: []domain.StationContact{
		{Phone: "0111111111", ResponseRate: 0.5, Active: true},
		{Phone: "0999999999", ResponseRate: 0.5, Active: true},
	}}
	if a.PrimaryPhone() != b.PrimaryPhone() {
		t.Fatalf("tiebreak not deterministic: %q vs %q", a.PrimaryPhone(), b.PrimaryPhone())
	}
	if got := a.PrimaryPhone(); got != "0111111111" {
		t.Errorf("expected lexicographically smallest phone on tie, got %q", got)
	}
}

func TestPrimaryPhone_NoContactsReturnsEmpty(t *testing.T) {
	if got := (domain.Station{}).PrimaryPhone(); got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestPrimaryPhone_AllInactiveReturnsEmpty(t *testing.T) {
	s := domain.Station{Contacts: []domain.StationContact{
		{Phone: "0302666576", ResponseRate: 1.0, Active: false},
	}}
	if got := s.PrimaryPhone(); got != "" {
		t.Errorf("expected empty string when all contacts inactive, got %q", got)
	}
}

func TestStation_HasDistanceMetersField(t *testing.T) {
	s := domain.Station{DistanceMeters: 2400}
	if s.DistanceMeters != 2400 {
		t.Errorf("expected 2400, got %d", s.DistanceMeters)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
go test ./internal/domain/ -run 'TestPrimaryPhone|TestStation_HasDistance' -v
```

Expected: FAIL — compile errors, `s.PrimaryPhone undefined` and `unknown field DistanceMeters`.

- [ ] **Step 3: Implement**

In `internal/domain/station.go`, add the field to `Station` (after `UpdatedAt`) and the method below the struct:

```go
type Station struct {
	ID        string
	Name      string
	Region    string
	District  string
	Lat       float64
	Lng       float64
	Contacts  []StationContact
	Active    bool
	CreatedAt time.Time
	UpdatedAt time.Time

	// DistanceMeters is the great-circle distance from the coordinates the
	// caller supplied. It is computed per request and never persisted, so it
	// is zero on any read that had no reference point (e.g. GetByID).
	DistanceMeters int
}

// PrimaryPhone returns the active contact most likely to answer: the highest
// ResponseRate, ties broken by the lexicographically smallest phone so the
// result is stable regardless of row order. Returns "" when no contact is
// active, leaving the fallback decision to the caller.
func (s Station) PrimaryPhone() string {
	best := ""
	bestRate := -1.0
	for _, c := range s.Contacts {
		if !c.Active {
			continue
		}
		if c.ResponseRate > bestRate || (c.ResponseRate == bestRate && c.Phone < best) {
			best, bestRate = c.Phone, c.ResponseRate
		}
	}
	return best
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
go test ./internal/domain/ -v
```

Expected: PASS, including the pre-existing `errors_test.go` cases.

- [ ] **Step 5: Commit**

```bash
git add internal/domain/station.go internal/domain/station_test.go
git commit -m "feat(domain): add DistanceMeters field and PrimaryPhone selection"
```

---

## Task 3: Compute distance once and sort on the stored value

**Working directory:** `/Users/ericabbey/Desktop/Projects/firereach/api`

**Files:**
- Modify: `internal/usecase/station/list_nearest.go`
- Test: `internal/usecase/station/list_nearest_test.go`

**Interfaces:**
- Consumes: `domain.Station.DistanceMeters` from Task 2
- Produces: `ListNearestStations.Execute` now returns stations with `DistanceMeters` populated and ascending

- [ ] **Step 1: Write the failing tests**

Append to `internal/usecase/station/list_nearest_test.go`:

```go
func TestListNearestStations_PopulatesDistanceMeters(t *testing.T) {
	repo := &mocks.StationRepo{
		ListActiveFunc: func(ctx context.Context) ([]domain.Station, error) {
			return []domain.Station{
				{ID: "1", Name: "Exactly Here", Lat: 5.6, Lng: -0.19, Active: true},
				{ID: "2", Name: "Far Station", Lat: 6.0, Lng: -1.0, Active: true},
			}, nil
		},
	}

	uc := station.NewListNearestStations(repo)
	results, err := uc.Execute(context.Background(), 5.6, -0.19, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if results[0].DistanceMeters != 0 {
		t.Errorf("station at the query point should be 0m away, got %d", results[0].DistanceMeters)
	}
	if results[1].DistanceMeters <= 0 {
		t.Errorf("distant station should have positive distance, got %d", results[1].DistanceMeters)
	}
}

func TestListNearestStations_DistanceAscending(t *testing.T) {
	repo := &mocks.StationRepo{
		ListActiveFunc: func(ctx context.Context) ([]domain.Station, error) {
			return []domain.Station{
				{ID: "1", Name: "Far", Lat: 6.0, Lng: -1.0, Active: true},
				{ID: "2", Name: "Near", Lat: 5.6, Lng: -0.2, Active: true},
				{ID: "3", Name: "Medium", Lat: 5.7, Lng: -0.5, Active: true},
			}, nil
		},
	}

	uc := station.NewListNearestStations(repo)
	results, err := uc.Execute(context.Background(), 5.6, -0.19, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for i := 1; i < len(results); i++ {
		if results[i-1].DistanceMeters > results[i].DistanceMeters {
			t.Fatalf("results not ascending at index %d: %d > %d",
				i, results[i-1].DistanceMeters, results[i].DistanceMeters)
		}
	}
}

func TestListNearestStations_KnownDistanceIsPlausible(t *testing.T) {
	// 0.01 degrees of longitude at latitude 5.6 is roughly 1.108 km.
	repo := &mocks.StationRepo{
		ListActiveFunc: func(ctx context.Context) ([]domain.Station, error) {
			return []domain.Station{
				{ID: "1", Name: "One Notch East", Lat: 5.6, Lng: -0.18, Active: true},
			}, nil
		},
	}

	uc := station.NewListNearestStations(repo)
	results, err := uc.Execute(context.Background(), 5.6, -0.19, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := results[0].DistanceMeters
	if got < 1050 || got > 1160 {
		t.Errorf("expected roughly 1108m, got %d", got)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
go test ./internal/usecase/station/ -run TestListNearestStations -v
```

Expected: FAIL — `DistanceMeters` is zero for every station, so `TestListNearestStations_PopulatesDistanceMeters` reports `distant station should have positive distance, got 0` and `TestListNearestStations_KnownDistanceIsPlausible` reports `expected roughly 1108m, got 0`.

- [ ] **Step 3: Implement**

Replace `sortByDistance` in `internal/usecase/station/list_nearest.go`:

```go
func sortByDistance(stations []domain.Station, lat, lng float64, limit int) []domain.Station {
	// Compute once per station rather than inside the comparator, which
	// previously ran haversine O(n log n) times and discarded every result.
	for i := range stations {
		km := haversine(lat, lng, stations[i].Lat, stations[i].Lng)
		stations[i].DistanceMeters = int(math.Round(km * 1000))
	}

	sort.Slice(stations, func(i, j int) bool {
		return stations[i].DistanceMeters < stations[j].DistanceMeters
	})

	if limit > 0 && limit < len(stations) {
		stations = stations[:limit]
	}
	return stations
}
```

`Execute` is unchanged. The `math` and `sort` imports are already present.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
go test ./internal/usecase/station/ -v
```

Expected: PASS, including the three pre-existing `TestListNearestStations_*` cases.

- [ ] **Step 5: Commit**

```bash
git add internal/usecase/station/list_nearest.go internal/usecase/station/list_nearest_test.go
git commit -m "feat(station): populate DistanceMeters and sort on the computed value"
```

---

## Task 4: Expose `distance_meters` and `primary_phone` in the DTO

**Working directory:** `/Users/ericabbey/Desktop/Projects/firereach/api`

**Files:**
- Modify: `internal/adapter/dto/station.go`
- Test: `internal/adapter/dto/station_test.go` (create)

**Interfaces:**
- Consumes: `domain.Station.DistanceMeters` and `domain.Station.PrimaryPhone()` from Task 2
- Produces: JSON fields `distance_meters` (int) and `primary_phone` (string) on every station response; the unused `distance` field is removed

- [ ] **Step 1: Write the failing test**

Create `internal/adapter/dto/station_test.go`:

```go
package dto_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/firereach/api/internal/adapter/dto"
	"github.com/firereach/api/internal/domain"
)

func sampleStation() domain.Station {
	return domain.Station{
		ID:             "11111111-1111-1111-1111-111111111111",
		Name:           "Accra City Fire Station",
		Region:         "Greater Accra Region",
		District:       "Accra Metropolitan District",
		Lat:            5.54931,
		Lng:            -0.20730,
		DistanceMeters: 2400,
		Contacts: []domain.StationContact{
			{Phone: "0302666576", ResponseRate: 1.0, Active: true},
			{Phone: "192", ResponseRate: 0.1, Active: true},
		},
	}
}

func TestToStationResponse_CarriesDistanceAndPrimaryPhone(t *testing.T) {
	got := dto.ToStationResponse(sampleStation())
	if got.DistanceMeters != 2400 {
		t.Errorf("expected 2400, got %d", got.DistanceMeters)
	}
	if got.PrimaryPhone != "0302666576" {
		t.Errorf("expected highest-rate contact, got %q", got.PrimaryPhone)
	}
	if len(got.Contacts) != 2 {
		t.Errorf("expected 2 contacts preserved, got %d", len(got.Contacts))
	}
}

func TestToStationResponse_ZeroDistanceIsStillSerialized(t *testing.T) {
	s := sampleStation()
	s.DistanceMeters = 0

	blob, err := json.Marshal(dto.ToStationResponse(s))
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if !strings.Contains(string(blob), `"distance_meters":0`) {
		t.Errorf("zero distance must not be omitted, got %s", blob)
	}
}

func TestToStationResponse_EmptyPrimaryPhoneWhenNoActiveContacts(t *testing.T) {
	s := sampleStation()
	s.Contacts = []domain.StationContact{{Phone: "0302666576", ResponseRate: 1.0, Active: false}}

	if got := dto.ToStationResponse(s).PrimaryPhone; got != "" {
		t.Errorf("expected empty primary phone, got %q", got)
	}
}

func TestToStationListResponse_MapsEveryStation(t *testing.T) {
	got := dto.ToStationListResponse([]domain.Station{sampleStation(), sampleStation()})
	if len(got) != 2 {
		t.Fatalf("expected 2 responses, got %d", len(got))
	}
	if got[1].PrimaryPhone != "0302666576" {
		t.Errorf("second entry not mapped, got %q", got[1].PrimaryPhone)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
go test ./internal/adapter/dto/ -v
```

Expected: FAIL — compile error, `got.DistanceMeters undefined` and `got.PrimaryPhone undefined`.

- [ ] **Step 3: Implement**

In `internal/adapter/dto/station.go`, replace `StationResponse` and `ToStationResponse`:

```go
type StationResponse struct {
	ID             string                   `json:"id"`
	Name           string                   `json:"name"`
	Region         string                   `json:"region"`
	District       string                   `json:"district"`
	Lat            float64                  `json:"lat"`
	Lng            float64                  `json:"lng"`
	DistanceMeters int                      `json:"distance_meters"`
	PrimaryPhone   string                   `json:"primary_phone"`
	Contacts       []StationContactResponse `json:"contacts"`
}

func ToStationResponse(s domain.Station) StationResponse {
	contacts := make([]StationContactResponse, len(s.Contacts))
	for i, c := range s.Contacts {
		contacts[i] = StationContactResponse{
			Phone:        c.Phone,
			ResponseRate: c.ResponseRate,
			Active:       c.Active,
		}
	}
	return StationResponse{
		ID:             s.ID,
		Name:           s.Name,
		Region:         s.Region,
		District:       s.District,
		Lat:            s.Lat,
		Lng:            s.Lng,
		DistanceMeters: s.DistanceMeters,
		PrimaryPhone:   s.PrimaryPhone(),
		Contacts:       contacts,
	}
}
```

The old `Distance float64` field with `json:"distance,omitempty"` is deleted — it was never populated, and `omitempty` meant a legitimate zero would vanish from the payload.

- [ ] **Step 4: Run the full suite to verify nothing regressed**

```bash
go test ./... && go build ./... && go vet ./...
```

Expected: all packages PASS, build and vet clean.

- [ ] **Step 5: Commit**

```bash
git add internal/adapter/dto/station.go internal/adapter/dto/station_test.go
git commit -m "feat(dto): expose distance_meters and primary_phone on station responses"
```

---

## Task 5: Standardize the API port on 8080

**Working directory:** `/Users/ericabbey/Desktop/Projects/firereach/api`

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: nothing
- Produces: the API listens on `8080` in every run mode, matching `.env.example` and the app's default base URL

- [ ] **Step 1: Confirm the mismatch**

```bash
grep -n "40000\|PORT" docker-compose.yml .env.example
```

Expected: `docker-compose.yml` shows `"40000:40000"` and `PORT=40000`; `.env.example` shows `PORT=8080`.

- [ ] **Step 2: Edit `docker-compose.yml`**

In the `api` service, change the ports mapping and the `PORT` environment entry:

```yaml
services:
  api:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://firereach:firereach@db:5432/firereach?sslmode=disable
      - CLAUDE_API_KEY=${CLAUDE_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - ENVIRONMENT=development
      - PORT=8080
```

Leave the `db` service untouched.

- [ ] **Step 3: Verify no stale references remain**

```bash
grep -rn "40000" . --exclude-dir=.git
```

Expected: **no output**.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "fix(compose): serve the API on 8080 to match .env.example"
```

---

# Phase 3 — Seed data

## Task 6: Generate and commit the dev seed

**Working directory:** `/Users/ericabbey/Desktop/Projects/firereach/api`

**Files:**
- Create: `seeds/build_seed.py`
- Create: `seeds/dev_stations.sql` (generated by the script, then committed)
- Modify: `Makefile`

**Interfaces:**
- Consumes: the `stations` and `station_contacts` schema from `migrations/000001` and `migrations/000005`
- Produces: `make seed`, which populates a running database with sourced station rows

- [ ] **Step 1: Write the generator**

Create `seeds/build_seed.py`:

```python
#!/usr/bin/env python3
"""Generate seeds/dev_stations.sql for FireReach development.

Sources
-------
Coordinates + names : OpenStreetMap, amenity=fire_station within Ghana,
                      via the Overpass API. Licensed ODbL.
Region + district   : OSM Nominatim reverse geocoding (state, county).
                      Licensed ODbL.
Contact numbers     : Ghana National Fire Service official contact-numbers
                      page, archived 2022-08-09 at
                      web.archive.org/web/20220809162701/
                      http://www.gnfs.gov.gh/contact-numbers

This script exists so the derivation is auditable and repeatable. The SQL it
produces is committed, so `make seed` never needs network access. Re-running
against live OSM may legitimately produce a different row set.

Usage: python3 seeds/build_seed.py > seeds/dev_stations.sql
"""

import json
import sys
import time
import urllib.parse
import urllib.request
import uuid

OVERPASS = "https://overpass.kumi.systems/api/interpreter"
NOMINATIM = "https://nominatim.openstreetmap.org/reverse"
UA = "FireReach-dev-seed/1.0 (https://github.com/firereach)"

OVERPASS_QUERY = """[out:json][timeout:90];
area["ISO3166-1"="GH"][admin_level=2]->.gh;
(node["amenity"="fire_station"](area.gh);
 way["amenity"="fire_station"](area.gh););
out center tags;"""

# GNFS regional commands, verbatim from the archived official page.
# Ordered [first-published, second-published]; publication order becomes
# response_rate 1.0 / 0.5. These are NOT measured response rates.
GNFS_COMMANDS = {
    "greater accra": ["0302666576", "0299346018"],
    "ashanti":       ["0322022221", "0299346044"],
    "eastern":       ["0302982062", "0299346041"],
    "central":       ["0332132902", "0299340499"],
    "western":       ["0312193521", "0299346040"],
    "volta":         ["0362026679", "0299346042"],
    # DISCREPANCY: the official page lists the Northern landline as
    # 0322022864, but 032 is the Kumasi/Ashanti prefix while Tamale is 037;
    # an independent aggregator lists 0372022864. Since we cannot verify
    # which is correct, the undisputed 0299 number is published first and
    # therefore becomes primary.
    "northern":      ["0299346046", "0322022864"],
    "brong ahafo":   ["0352027129", "0299340249"],
    "upper east":    ["0382022277"],
    "upper west":    ["0392022389"],
    "tema":          ["0303202554", "0299340083"],
}
NATIONAL = ["0302772446", "0299340383"]  # Fire Master Control
EMERGENCY = "192"

# The archived page predates the 2019 regional reorganization, so successor
# regions inherit their predecessor's command.
REGION_TO_COMMAND = {
    "greater accra region": "greater accra",
    "ashanti region":       "ashanti",
    "eastern region":       "eastern",
    "central region":       "central",
    "western region":       "western",
    "western north region": "western",
    "volta region":         "volta",
    "oti region":           "volta",
    "northern region":      "northern",
    "savannah region":      "northern",
    "north east region":    "northern",
    "bono region":          "brong ahafo",
    "bono east region":     "brong ahafo",
    "ahafo region":         "brong ahafo",
    "upper east region":    "upper east",
    "upper west region":    "upper west",
}

NAMESPACE = uuid.UUID("6ba7b811-9dad-11d1-80b4-00c04fd430c8")  # RFC 4122 URL


def station_uuid(kind, osm_id):
    """Deterministic UUID so re-seeding preserves station identity."""
    return str(uuid.uuid5(NAMESPACE, f"https://www.openstreetmap.org/{kind}/{osm_id}"))


def fetch_stations():
    body = urllib.parse.urlencode({"data": OVERPASS_QUERY}).encode()
    req = urllib.request.Request(OVERPASS, data=body, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r).get("elements", [])


def reverse(lat, lon):
    qs = urllib.parse.urlencode({"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 8})
    req = urllib.request.Request(f"{NOMINATIM}?{qs}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        addr = json.load(r).get("address", {})
    return addr.get("state") or "", addr.get("county") or ""


def sql_str(value):
    return "'" + value.replace("'", "''") + "'"


def main():
    elements = fetch_stations()
    named = [e for e in elements if e.get("tags", {}).get("name")]
    named.sort(key=lambda e: e["tags"]["name"])
    sys.stderr.write(f"{len(elements)} features, {len(named)} named\n")

    rows = []
    for e in named:
        lat = e.get("lat") or e.get("center", {}).get("lat")
        lon = e.get("lon") or e.get("center", {}).get("lon")
        if lat is None or lon is None:
            continue
        region, district = reverse(lat, lon)
        time.sleep(1.2)  # Nominatim usage policy: max 1 request/second
        rows.append({
            "id": station_uuid(e["type"], e["id"]),
            "name": e["tags"]["name"],
            "region": region or "Unknown Region",
            "district": district or "Unknown District",
            "lat": lat,
            "lng": lon,
            "numbers": GNFS_COMMANDS.get(
                REGION_TO_COMMAND.get(region.strip().lower(), ""), NATIONAL
            ),
        })
        sys.stderr.write(f"  {e['tags']['name']} -> {region}\n")

    out = sys.stdout
    out.write("-- FireReach development seed. GENERATED by seeds/build_seed.py.\n")
    out.write("-- Do not edit by hand; re-run the generator instead.\n")
    out.write("--\n")
    out.write("-- Coordinates + names : OpenStreetMap (ODbL), amenity=fire_station\n")
    out.write("-- Region + district   : OSM Nominatim reverse geocoding (ODbL)\n")
    out.write("-- Contact numbers     : GNFS official contact-numbers page,\n")
    out.write("--                       archived 2022-08-09\n")
    out.write("--\n")
    out.write("-- CAVEATS\n")
    out.write("--   response_rate encodes PUBLICATION ORDER, not measured\n")
    out.write("--   reliability. No GNFS response-rate data is published. The\n")
    out.write("--   field name overstates what these values mean.\n")
    out.write("--\n")
    out.write("--   Contact numbers are regional command lines, not per-station\n")
    out.write("--   direct lines, and were archived in 2022.\n")
    out.write("--\n")
    out.write("--   NOT VERIFIED FOR EMERGENCY USE. Confirm every number directly\n")
    out.write("--   with GNFS before any production deployment.\n")
    out.write("--\n")
    out.write("-- OSM data is ODbL: attribution and share-alike obligations apply\n")
    out.write("-- to derived databases. Resolve licensing before shipping.\n\n")
    out.write("BEGIN;\n\n")
    out.write("DELETE FROM station_contacts;\n")
    out.write("DELETE FROM stations;\n\n")

    for r in rows:
        out.write(
            "INSERT INTO stations (id, name, region, district, lat, lng, active) VALUES\n"
            f"  ('{r['id']}', {sql_str(r['name'])}, {sql_str(r['region'])}, "
            f"{sql_str(r['district'])}, {r['lat']}, {r['lng']}, true);\n"
        )
        contacts = [(p, 1.0 if i == 0 else 0.5) for i, p in enumerate(r["numbers"])]
        contacts.append((EMERGENCY, 0.1))
        for phone, rate in contacts:
            out.write(
                "INSERT INTO station_contacts (station_id, phone, response_rate, active) "
                f"VALUES ('{r['id']}', '{phone}', {rate}, true);\n"
            )
        out.write("\n")

    out.write("COMMIT;\n")
    sys.stderr.write(f"wrote {len(rows)} stations\n")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the generator**

```bash
mkdir -p seeds
python3 seeds/build_seed.py > seeds/dev_stations.sql
```

This takes roughly 90 seconds — Nominatim is rate-limited to one request per second and there are ~57 stations. Progress prints to stderr.

Expected stderr tail: `wrote 57 stations` (the exact count may differ slightly if OSM changed; anything in the 50–60 range is fine).

- [ ] **Step 3: Sanity-check the generated SQL**

```bash
head -30 seeds/dev_stations.sql
grep -c "INSERT INTO stations" seeds/dev_stations.sql
grep -c "'192'" seeds/dev_stations.sql
grep -c "Unknown Region" seeds/dev_stations.sql
```

Expected: the provenance header including the "NOT VERIFIED FOR EMERGENCY USE" line; the station count matches the stderr report; the `192` count equals the station count (one fallback each); `Unknown Region` is 0 or a small number — if it is large, Nominatim was rate-limiting and the script should be re-run.

- [ ] **Step 4: Add the `seed` target to the Makefile**

Add to `.PHONY` and append a target:

```makefile
.PHONY: run dev build test migrate-up migrate-down generate docker-up docker-down seed

seed:
	psql "$(DATABASE_URL)" -f seeds/dev_stations.sql
```

- [ ] **Step 5: Commit**

```bash
git add seeds/build_seed.py seeds/dev_stations.sql Makefile
git commit -m "feat(seeds): add sourced dev station seed from OSM and GNFS"
```

---

# Phase 4 — App API client

## Task 7: API configuration

**Working directory:** `/Users/ericabbey/Desktop/Projects/firereach/app`

**Files:**
- Create: `src/lib/apiConfig.ts`
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: `API_BASE_URL: string`, `API_TIMEOUT_MS: number` from `src/lib/apiConfig`

- [ ] **Step 1: Create `src/lib/apiConfig.ts`**

```ts
/**
 * Expo SDK 55 inlines process.env.EXPO_PUBLIC_* at build time, so this reads
 * from app/.env (gitignored) with a localhost fallback for the simulator.
 *
 * Testing on a physical device: set EXPO_PUBLIC_API_URL to your machine's LAN
 * address (e.g. http://192.168.1.42:8080). iOS App Transport Security blocks
 * cleartext HTTP to a LAN IP unless NSAllowsLocalNetworking is added to the
 * iOS Info.plist; the simulator is exempt when talking to localhost.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

/** Emergency UX: fail fast to cached data rather than hang on a dead network. */
export const API_TIMEOUT_MS = 8000;
```

- [ ] **Step 2: Create `.env.example`**

```
# Copy to .env and adjust. EXPO_PUBLIC_ vars are inlined into the JS bundle,
# so never put secrets here.
EXPO_PUBLIC_API_URL=http://localhost:8080
```

- [ ] **Step 3: Ignore the real `.env`**

Append to `.gitignore`:

```
# Local environment
.env
```

- [ ] **Step 4: Create your local `.env`**

```bash
cp .env.example .env
```

- [ ] **Step 5: Verify `.env` is ignored but `.env.example` is not**

```bash
git status --short
```

Expected: `.env.example`, `.gitignore`, and `src/lib/apiConfig.ts` appear; `.env` does **not**.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/apiConfig.ts .env.example .gitignore
git commit -m "feat(app): add API base URL and timeout configuration"
```

---

## Task 8: HTTP client

**Working directory:** `/Users/ericabbey/Desktop/Projects/firereach/app`

**Files:**
- Create: `src/lib/apiClient.ts`

**Interfaces:**
- Consumes: `API_BASE_URL`, `API_TIMEOUT_MS` from Task 7
- Produces: `class ApiError extends Error { status: number }`; `async function apiGet<T>(path: string, params?: Record<string, string | number>): Promise<T>`

- [ ] **Step 1: Create `src/lib/apiClient.ts`**

```ts
import { API_BASE_URL, API_TIMEOUT_MS } from "./apiConfig";

/** A non-2xx response. Network and timeout failures surface as plain Errors. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Built by hand rather than with URL/URLSearchParams: React Native's URL
 * polyfill is incomplete and searchParams is unreliable on Hermes.
 */
function buildUrl(
  path: string,
  params?: Record<string, string | number>
): string {
  const base = API_BASE_URL.replace(/\/+$/, "");
  if (!params) return `${base}${path}`;

  const query = Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    )
    .join("&");

  return query ? `${base}${path}?${query}` : `${base}${path}`;
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number>
): Promise<T> {
  // AbortController rather than AbortSignal.timeout, which Hermes does not
  // reliably implement.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(buildUrl(path, params), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ApiError(
        response.status,
        `GET ${path} failed with status ${response.status}`
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/apiClient.ts
git commit -m "feat(app): add fetch wrapper with timeout and typed errors"
```

---

## Task 9: Stations endpoint and wire-shape mapper

**Working directory:** `/Users/ericabbey/Desktop/Projects/firereach/app`

**Files:**
- Modify: `src/lib/stationTypes.ts`
- Create: `src/lib/stationsApi.ts`

**Interfaces:**
- Consumes: `apiGet` from Task 8; `Station` from `src/lib/stationTypes`
- Produces: `ApiStation`, `ApiStationContact`, `NATIONAL_EMERGENCY_PHONE` from `src/lib/stationTypes`; `toStation(api: ApiStation): Station` and `getNearestStations(lat: number, lng: number, limit?: number): Promise<Station[]>` from `src/lib/stationsApi`

- [ ] **Step 1: Append the wire types to `src/lib/stationTypes.ts`**

Leave the existing `STATION_CACHE_VERSION`, `StationLocation`, `Station`, and `StationSnapshot` untouched and append:

```ts
/** Ghana's national fire emergency number — the last-resort dial target. */
export const NATIONAL_EMERGENCY_PHONE = "192";

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

`ApiStation` stays separate from `Station` so the API can grow fields without forcing a cache schema bump — which would invalidate every cached snapshot and, later, the widget's App Group payload.

- [ ] **Step 2: Create `src/lib/stationsApi.ts`**

```ts
import { apiGet } from "./apiClient";
import {
  ApiStation,
  NATIONAL_EMERGENCY_PHONE,
  Station,
} from "./stationTypes";

/**
 * Narrows the wire shape to what the app renders and caches. district, lat,
 * lng, and contacts are deliberately dropped — nothing consumes them yet, and
 * adding them to the cached snapshot would require a schema version bump.
 */
export function toStation(api: ApiStation): Station {
  return {
    id: api.id,
    name: api.name,
    region: api.region,
    distanceMeters: Math.max(0, Math.round(api.distance_meters ?? 0)),
    phone: api.primary_phone || NATIONAL_EMERGENCY_PHONE,
  };
}

/** Nearest stations first. Returns [] when the API has no active stations. */
export async function getNearestStations(
  lat: number,
  lng: number,
  limit = 3
): Promise<Station[]> {
  const raw = await apiGet<ApiStation[] | null>("/v1/stations", {
    lat,
    lng,
    limit,
  });

  if (!Array.isArray(raw)) return [];
  return raw.map(toStation);
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stationTypes.ts src/lib/stationsApi.ts
git commit -m "feat(app): add stations endpoint and wire-shape mapper"
```

---

## Task 10: Replace the hardcoded stub in `useNearestStation`

**Working directory:** `/Users/ericabbey/Desktop/Projects/firereach/app`

**Files:**
- Modify: `src/hooks/useNearestStation.ts`

**Interfaces:**
- Consumes: `getNearestStations` from Task 9
- Produces: unchanged public surface — `useNearestStation(): { snapshot, isResolving, hasError, refresh }`

- [ ] **Step 1: Replace the imports**

At the top of `src/hooks/useNearestStation.ts`, add `expo-network` and the stations API beside the existing imports:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import * as Network from "expo-network";
import {
  STATION_CACHE_VERSION,
  NATIONAL_EMERGENCY_PHONE,
  Station,
  StationSnapshot,
} from "../lib/stationTypes";
import {
  readStationCache,
  writeStationCache,
} from "../lib/stationCache";
import { getNearestStations } from "../lib/stationsApi";
```

- [ ] **Step 2: Point the fallback constant at the shared emergency number**

Replace the `FALLBACK_STATION` literal phone with the shared constant:

```ts
const FALLBACK_STATION: Station = {
  id: "stn_fallback_192",
  name: "National Fire Service",
  region: "Ghana",
  distanceMeters: 0,
  phone: NATIONAL_EMERGENCY_PHONE,
};
```

- [ ] **Step 3: Delete the stub and its TODO**

Remove the entire `resolveNearestStation` function — the one whose body reads `// TODO: replace with real API call when /stations/nearest endpoint exists.` and returns the hardcoded Accra Central object. `getNearestStations` replaces it.

- [ ] **Step 4: Add a fallback helper above `useNearestStation`**

```ts
function fallbackSnapshot(): StationSnapshot {
  return {
    schemaVersion: STATION_CACHE_VERSION,
    fetchedAt: new Date().toISOString(),
    userLocation: { lat: 0, lng: 0 },
    station: FALLBACK_STATION,
  };
}
```

- [ ] **Step 5: Rewrite the body of `refresh`**

Replace the whole `try` block inside `refresh` with:

```ts
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      let granted = status === "granted";
      if (!granted) {
        const ask = await Location.requestForegroundPermissionsAsync();
        granted = ask.status === "granted";
      }
      if (!granted) {
        // Fall back to last-known cache (already in state) and the national
        // emergency contact if there is no cache.
        if (!snapshot) {
          const fb = fallbackSnapshot();
          setSnapshot(fb);
          await writeStationCache(fb);
        }
        return;
      }

      // Offline: the cached snapshot is the best available answer, and there
      // is no point burning the full request timeout to rediscover that.
      const netState = await Network.getNetworkStateAsync();
      const online = Boolean(
        netState.isInternetReachable ?? netState.isConnected
      );
      if (!online) {
        if (!snapshot) {
          const fb = fallbackSnapshot();
          setSnapshot(fb);
          await writeStationCache(fb);
        }
        return;
      }

      const last = await Location.getLastKnownPositionAsync();
      const position =
        last ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));

      const stations = await getNearestStations(
        position.coords.latitude,
        position.coords.longitude,
        3
      );

      if (stations.length === 0) {
        // The API answered, but has no active stations. Keep any cached
        // snapshot; otherwise seed the national fallback.
        if (!snapshot) {
          const fb = fallbackSnapshot();
          setSnapshot(fb);
          await writeStationCache(fb);
        }
        return;
      }

      const fresh: StationSnapshot = {
        schemaVersion: STATION_CACHE_VERSION,
        fetchedAt: new Date().toISOString(),
        userLocation: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
        station: stations[0],
      };

      setSnapshot(fresh);
      await writeStationCache(fresh);
    } catch (err) {
      console.warn("[useNearestStation] refresh failed", err);
      setHasError(true);
      // Keep existing snapshot — stale data > no data per spec.
    } finally {
      inFlight.current = false;
      setIsResolving(false);
    }
```

Note this branch has no `WidgetBridge` calls — that coupling lives only on `feature/swift-widget` and must not be introduced here.

- [ ] **Step 6: Confirm the TODO is gone**

```bash
grep -n "TODO: replace with real API call" src/hooks/useNearestStation.ts
```

Expected: **no output**, exit status 1.

- [ ] **Step 7: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useNearestStation.ts
git commit -m "feat(app): resolve nearest station from the API instead of a stub"
```

---

# Phase 5 — Verification

## Task 11: End-to-end verification

**Working directory:** both repos, as noted per step

**Files:** none modified — this task only verifies

**Interfaces:**
- Consumes: everything from Tasks 1–10
- Produces: a confirmed working path from Postgres to the HomeScreen

- [ ] **Step 1: Full Go suite (`api/`)**

```bash
go build ./... && go vet ./... && go test ./...
```

Expected: build and vet silent; every package `ok` or `[no test files]`.

- [ ] **Step 2: Bring up the database and API (`api/`)**

```bash
make docker-up
docker compose ps
```

Expected: both `api` and `db` services running, `db` healthy.

- [ ] **Step 3: Migrate and seed (`api/`)**

```bash
make migrate-up
make seed
```

Expected: migrations apply cleanly; the seed prints a series of `INSERT 0 1` lines and ends with `COMMIT`.

- [ ] **Step 4: Confirm the rows landed (`api/`)**

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM stations;" \
                     -c "SELECT count(*) FROM station_contacts;"
```

Expected: roughly 57 stations, and about three contacts per station.

- [ ] **Step 5: Verify the endpoint contract (`api/`)**

```bash
curl -s "http://localhost:8080/v1/stations?lat=5.5493&lng=-0.2073&limit=3" | python3 -m json.tool
```

Expected: three objects. Assert all of these:
- `distance_meters` is present on each and **ascends** across the array
- the first entry's `distance_meters` is small (under ~2000) — the query point is Accra City Fire Station's own coordinates
- `primary_phone` is non-empty on every entry
- for Greater Accra stations, `primary_phone` is `0302666576`
- each `contacts` array contains `192`
- no `distance` key appears anywhere

- [ ] **Step 6: Verify the single-station route still works (`api/`)**

```bash
STATION_ID=$(psql "$DATABASE_URL" -tAc "SELECT id FROM stations LIMIT 1")
curl -s "http://localhost:8080/v1/stations/$STATION_ID" | python3 -m json.tool
```

Expected: one station with `distance_meters: 0` — correct, since this route receives no reference coordinates.

- [ ] **Step 7: Typecheck the app (`app/`)**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 8: Run on the simulator (`app/`)**

```bash
cat .env      # confirm EXPO_PUBLIC_API_URL=http://localhost:8080
npx expo run:ios
```

Grant the location permission when prompted. Expected on HomeScreen:
- a real station name from the seed (not "Accra Central Fire Station", which was the deleted stub's hardcoded value)
- a real region such as "Greater Accra Region"
- a distance badge reading `~N.N km away` rather than "Locating…"
- the call button reading `Call <station name>`

The simulator reports a Bay Area location by default, so the "nearest" station will be whichever Ghanaian station is closest to that — expected and harmless. To exercise it properly, set **Features → Location → Custom Location** to `5.5493, -0.2073` and pull to refresh.

- [ ] **Step 9: Verify offline behavior (`app/`)**

With the app running and a station displayed, stop the API:

```bash
make docker-down     # in api/
```

Trigger a refresh in the app. Expected: the previously displayed station **stays on screen**. No crash, no blank card, no reversion to "Finding nearest station…".

- [ ] **Step 10: Verify cold-start-with-cache (`app/`)**

With the API still down, force-quit and relaunch the app. Expected: the cached station renders immediately from AsyncStorage.

- [ ] **Step 11: Restore and confirm recovery (`api/`, then app)**

```bash
make docker-up
```

Refresh in the app. Expected: fresh data loads, `fetchedAt` advances.

- [ ] **Step 12: Confirm both repos are clean**

```bash
cd /Users/ericabbey/Desktop/Projects/firereach/api && git status --short
cd /Users/ericabbey/Desktop/Projects/firereach/app && git status --short
```

Expected: both clean apart from the untracked `app/.env`, which is gitignored and must never be committed.

---

## Self-review notes

- **Spec coverage.** Every spec decision maps to a task: #1→T1, #2→T3+T4, #3→T2+T4, #4→T7, #5→scope of T9 (stations only), #6→T6, #7→T6 (`response_rate` comment block), #8→T5, #9→T7 docstring + T11 Step 8. Error-handling table→T8 (timeout, non-2xx) and T10 (empty array, offline, retention). Testing section→T2/T3/T4 unit tests and T11 end-to-end.
- **Known deviation from the spec.** The spec's seed preview showed string IDs like `stn_accra_central`; `stations.id` is a Postgres `UUID` column, so Task 6 uses deterministic uuid5 values derived from OSM element URLs instead. Same stability guarantee, correct type.
- **Deliberately unchanged.** `HomeScreen`'s hardcoded `NEARBY_STATIONS` chips stay hardcoded. `getNearestStations` fetches three so the data is there, but rendering the 2nd and 3rd requires extending `StationSnapshot`, which bumps the cache schema version and ripples into the widget's App Group payload. Out of scope; worth a follow-up.
- **Not addressed here** (carried from the spec's out-of-scope list): content, AI, and submissions endpoints; the unused `sqlc.yaml` pointing at a nonexistent directory; health endpoint and graceful shutdown; `NewAuthHandler` taking the raw pgx pool.
