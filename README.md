# FireReach App

Expo / React Native client for FireReach: find the nearest fire station, get
its number, and reach fire-safety guidance that still works with no signal.

> **Station data is development seed data and is NOT verified for emergency
> use.** Bundled contact numbers are regional GNFS command lines archived on
> 2022-08-09, not per-station direct lines. Confirm every number with the
> Ghana National Fire Service before any production or emergency-facing
> release.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Expo SDK 55, React Native 0.83, React 19 |
| Language | TypeScript |
| Navigation | React Navigation 7 (native stack + bottom tabs) |
| Storage | AsyncStorage |
| Device | expo-location, expo-network |
| Icons | phosphor-react-native |
| Type | Inter via @expo-google-fonts |
| Widgets | expo-widgets with @expo/ui SwiftUI |
| Tests | Jest via jest-expo |

## Quick start

```bash
npm install
cp .env.example .env
npm start          # then i / a, or scan the QR
```

Or build straight onto a device or simulator:

```bash
npm run ios
npm run android
```

The app needs the FireReach API running. Start it from the `api` repo
(`make docker-up`), which serves `http://localhost:9000`.

### Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `http://localhost:9000` | Inlined into the JS bundle at build time |

`EXPO_PUBLIC_*` variables are compiled into the bundle, so never put a secret
in `.env`.

Testing on a physical device means pointing this at your machine's LAN address
(`http://192.168.1.42:9000`). iOS App Transport Security blocks cleartext HTTP
to a LAN IP unless `NSAllowsLocalNetworking` is added to the iOS `Info.plist`.
The simulator is exempt when talking to localhost.

## Structure

```
src/
  screens/
    HomeScreen           nearest station, distance, call control
    StationsScreen       list, detail, community report
    SafetyScreen         guides hub, guide detail, AI chat
    SettingsScreen       saved places, theme
    onboarding/          splash through location permission to ready
  navigation/            root stack, tab navigator, param types
  hooks/
    useNearestStation    the offline-first ranking pipeline
    useConnectivity      network state
    useSafetyContent     bundled guides plus over-the-air refresh
    useSavedPlaces       user-pinned addresses
  lib/                   API clients, geo maths, caching, parsers
  data/                  bundled stations and safety content
  components/            shared UI
  theme/                 colours, typography, light and dark
widgets/emergency/       iOS home-screen widget (SwiftUI via @expo/ui)
scripts/                 data pipeline generators
```

Onboarding runs once. `AppNavigator` reads the completion flag on mount and
picks `Splash` or `MainTabs` as the initial route.

## Offline first

An emergency is exactly when the network is worst, so nothing on the critical
path waits on it.

- **Stations ship in the bundle.** `src/data/stations.bundled.json` carries 57
  stations and 165 contacts, so a cold install with no signal still resolves a
  nearest station.
- **Fresh data is cached, not required.** A successful fetch writes the station
  table to AsyncStorage. Reads fall back to that cache, then to the bundle.
- **Requests fail fast.** `API_TIMEOUT_MS` is 8 seconds. Falling back to cached
  data beats hanging on a dead network.
- **Location degrades in tiers.** A live GPS fix is preferred. A last-known fix
  is accepted if it is under 10 minutes old and accurate to 2000 m, tightened
  from 5000 m because three bundled stations sit within 5 km of Abelemkpe and a
  coarse cell-tower fix can name the wrong one in exactly the dense urban areas
  most calls come from. Cold GPS gets 6 seconds before the app settles rather
  than hangs.

Station ranking is great-circle distance computed on device (`src/lib/geo.ts`),
so it needs no server round trip.

## Data pipeline

Two bundled files, with opposite editing rules. Each has a `NOTICE.md` beside
it that states which it is.

**`stations.bundled.json` is generated. Never hand-edit it.** It is built from
the API repo's committed seed (`api/seeds/dev_stations.sql`), and regenerates
its own `NOTICE.md` on every run so the two cannot drift:

```bash
npm run build:stations                    # defaults to ../../api/seeds/dev_stations.sql
npm run build:stations -- /path/to.sql    # or point it elsewhere
```

**`safety-content.bundled.json` is authored, and is the source of truth.** The
Postgres seed and the reviewer packet are both generated from it:

```bash
npm run build:content-seed    # refreshes content_hash, writes api/seeds/safety_content.sql
npm run build:review-packet   # renders docs/content-review/*.md for a reviewer
```

After any content edit, run `build:content-seed`. A stale hash fails CI.

### Content review

Safety guidance is not self-authored. Product Scope §9 requires review by a
qualified source (Ghana Health Service, GNFS, or WHO guidelines).

Each item carries a `content_hash` of the exact words a reviewer approved.
Editing the title, summary, body, steps, or sources of a `reviewed` item
invalidates that review: the hash stops matching and the app demotes the badge
to "awaiting review" on its own. That is intended, since the reviewer approved
specific words. Never set `review.state` to `reviewed` by hand without a real
reviewer name, date, and the hash they actually read. Never invent a source; if
a citation cannot be verified against its publisher, mark it
`"unverified": true`.

## Content rules enforced by tests

Two conventions are guard tests rather than review notes, because both had
already slipped through a human read.

- **No em dashes in anything a user reads.** Guide content and UI copy are read
  on a small screen, often in a hurry, and often by someone reading English as
  a second or third language. Recast the clause as its own sentence, a colon,
  or a comma. `noEmDashes.test.ts` enforces it. Deliberate exemptions are
  `open_questions` (addressed to the clinical reviewer, never read into the
  app) and `sources[].title` (external titles as published, since altering a
  citation is worse than the punctuation). Code comments are stripped before
  scanning.
- **No hardcoded `tel:` numbers.** Every dial site must interpolate a variable
  so the number stays station-aware. `noHardcodedNumbers.test.ts` inspects
  source text directly, because an earlier plan-verification grep only matched
  numbers starting with `0` and passed clean over two screens shipping
  `tel:192`.

## AI answers

The guides chat calls `POST /v1/ai/ask` and renders by response kind:
`text`, `emergency`, `steps`, `emergency_number`, `warning`, `out_of_scope`.
Conversation history is sent so follow-up questions keep context.

No kind carries a phone number. The app owns every number and every dial
control, which is what keeps a hallucinated digit away from a call button. Any
unrecognised kind renders as plain body text, the same fail-safe the guide-body
parser uses.

## Testing

```bash
npm test
```

28 test files under `src/lib/__tests__`. Jest is scoped to that directory, so
tests live there rather than beside components. Beyond ordinary unit tests, the
suite includes structural guards: font consistency, onboarding navigation,
content hash parity with the generated seed, subcategory map parity, and the
two content rules above.

`jest.config.js` adds a `.mjs` transform so the pure-logic script modules under
`scripts/` can be imported by tests. The CLI entrypoints that use
`import.meta` are never imported, only run via `node`.

## iOS widget

`widgets/emergency/index.tsx` is a SwiftUI home-screen widget declared with
`"use widget"` and built through the `expo-widgets` config plugin, showing
station name, distance, and the emergency number.

The `feature/swift-widget` branch carries in-progress work on the native
bridge: an App Group write plus `WidgetCenter` reload, so the resolved station
syncs from the app to the widget. It is unmerged and paused at a manual Xcode
step. See `docs/superpowers/plans/2026-05-04-swift-widget.md`.

## Relationship to the API repo

The app is the source of truth for safety content; the API is the source of
truth for stations. `npm run build:content-seed` writes into the API repo's
`seeds/`, and `npm run build:stations` reads from it. Both repos need to be
checked out as siblings for those scripts to resolve their paths.
