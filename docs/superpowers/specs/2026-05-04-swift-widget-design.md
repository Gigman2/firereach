# FireReach iOS Widget — Swift Port Design

**Status:** Draft
**Date:** 2026-05-04
**Scope:** iOS only (Android out of scope)

## Background

The current FireReach iOS widget at `app/widgets/emergency/index.tsx` is built with
the `expo-widgets` plugin and `@expo/ui/swift-ui` JSX bridge. We've already hit
deprecation churn there (`foregroundColor` → `foregroundStyle`) and the bridge
does not give us interactive widgets, Lock Screen accessory variants, or stable
access to newer SwiftUI APIs.

This spec ports the widget — and only the widget — to a hand-written Swift
WidgetKit extension. The React Native app remains as the iOS app frontend.

## Goals

- Native Swift WidgetKit extension with full control over the widget extension
  target, signing, and dependencies.
- Direct-call (`tel:`) on iOS 17+ via `AppIntent`; deep-link fallback on iOS
  15.1–16.x.
- Home Screen widgets (`systemSmall`, `systemMedium`) plus Lock Screen
  accessories (`accessoryRectangular`, `accessoryCircular`, `accessoryInline`).
- Widget data flows from the RN app's offline-first nearest-station cache
  through an App Group (`group.com.firereach.app`), already configured in both
  entitlements files.
- Bundle the RN-side cache + App Group write path with the widget so the
  feature ships end-to-end in one effort.

## Non-goals

- Live Activities (deferred).
- Android home-screen widget parity (deferred).
- Background location refresh from the widget itself (handled in the
  offline-first feature; the widget is purely a renderer).
- User-configurable widget (e.g. pinning a specific station).

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Extension target structure | **A.** Plain Swift WidgetKit extension; remove `expo-widgets` plugin. |
| 2 | Data source | **B.** Bundle the RN-side cache + App Group write path with the widget. |
| 3 | Tap behavior | **Hybrid.** iOS 17+ → direct dial via `AppIntent`; iOS 15.1–16.x → deep-link to app. |
| 4 | Widget families | **D.** `systemSmall` + `systemMedium` + Lock Screen accessories. (No `systemLarge`.) |
| 5 | Empty / stale states | **A1 + B1.** Empty state shows "Open FireReach to find your nearest fire station." Staleness shown as "updated N days ago" past 24h. No TTL — cached data always shown if present. |
| 6 | Native bridge shape | **3.** Tiny purpose-built Swift bridge in the main app (`writeStationCache`, `reloadWidgets`); cache logic stays in TypeScript. |

## Architecture

A new Swift WidgetKit extension target `FireReachWidget` replaces the existing
`ExpoWidgetsTarget`. The current TSX widget and the `expo-widgets` plugin entry
in `app.json` are removed.

The system has five pieces:

1. **`FireReachWidget` extension target.** Swift WidgetKit extension containing
   a `WidgetBundle` with two widgets:
   - `EmergencyHomeWidget` — supports `.systemSmall` and `.systemMedium`.
   - `EmergencyAccessoryWidget` — supports `.accessoryRectangular`,
     `.accessoryCircular`, `.accessoryInline`.
2. **`StationTimelineProvider`.** Reads station data from App Group
   `UserDefaults(suiteName: "group.com.firereach.app")` on each `getTimeline`
   call; never blocks on network.
3. **`CallStationIntent`** (iOS 17+ only). An `AppIntent` that opens the
   dialer for the station's emergency number. Triggered by `Button(intent:)`
   in interactive widget code paths.
4. **`WidgetBridge.swift`.** A small native module in the main app target.
   Two methods exposed to JS:
   - `writeStationCache(payload: object) -> void`
   - `reloadWidgets() -> void` (calls `WidgetCenter.shared.reloadAllTimelines()`)
5. **RN integration.** The `useNearestStation` hook calls
   `WidgetBridge.writeStationCache(...)` then `reloadWidgets()` whenever its
   in-memory cache changes. Deep-link handler `firereach://call?phone=192`
   registers in `AppDelegate` to handle the iOS 15/16 fallback path that opens
   the app and dials.

### Data flow on a cache update

```
RN useNearestStation resolves
  → AsyncStorage write (existing offline-first cache)
  → WidgetBridge.writeStationCache(json)
  → App Group UserDefaults write
  → WidgetBridge.reloadWidgets()
  → WidgetCenter.shared.reloadAllTimelines()
  → WidgetKit re-renders all widgets
```

### Data flow on widget tap

- **iOS 17+:** tap `Button(intent: CallStationIntent(...))` → opens dialer
  directly.
- **iOS 15.1–16.x:** tap `Link(destination: URL("firereach://call?phone=..."))`
  → opens RN app → `AppDelegate` parses → calls `Linking.openURL("tel:...")`
  → dialer.

### Lock Screen accessories — tap behavior

Lock Screen accessory widgets always open the app on tap (no direct dial),
even on iOS 17+. Reasons:

- Apple's lock-screen interactive intent constraints around dial actions are
  stricter and less predictable than home-screen interactive widgets.
- "Tap → unlock → confirm dial" is a more predictable safety pattern from a
  locked phone.

## App Group data schema

A single key holds a JSON blob. One key, one source of truth — easy to evolve
via `schemaVersion`.

- **Suite:** `group.com.firereach.app`
- **Key:** `nearestStation.v1`

### Payload

```json
{
  "schemaVersion": 1,
  "fetchedAt": "2026-05-04T14:53:00Z",
  "userLocation": { "lat": 5.6037, "lng": -0.1870 },
  "station": {
    "id": "stn_accra_central",
    "name": "Accra Central Fire Station",
    "region": "Greater Accra",
    "distanceMeters": 2400,
    "phone": "192"
  }
}
```

### Field rationale

- `schemaVersion` — number; widget refuses to render entries it doesn't
  recognize and falls back to the empty state.
- `fetchedAt` — ISO 8601. Drives the "updated N days ago" indicator via simple
  `Date` math at render time.
- `userLocation` — kept for debugging/audit; not rendered.
- `station.distanceMeters` — integer meters. Widget formats per family
  (`"2.4 km"` for small/medium, `"2.4 km away"` for accessoryRectangular).
- `station.phone` — dialable string. Used by `CallStationIntent` and the
  deep-link fallback.
- `station.id` — useful for telemetry/dedup; not rendered.

### Empty-state detection

Widget reads key. If the key is absent, JSON parse fails, or `schemaVersion`
mismatches → render the empty state.

### Concurrency

`UserDefaults` reads/writes are atomic per key. Single-key JSON means no torn
reads. RN writes the whole blob each time the cache updates.

### Encoding on the Swift side

`Codable` struct `StationSnapshot` mirrors the JSON; `JSONDecoder` parses on
read.

## File layout

### Removed

- `app/widgets/emergency/index.tsx`
- `app/widgets/` directory once empty
- The `expo-widgets` plugin entry in `app/app.json`
- `app/ios/ExpoWidgetsTarget/` (entire target deleted from
  `FireReach.xcodeproj` and from disk)
- `expo-widgets` from `package.json` dependencies

### New — Swift widget extension (`app/ios/FireReachWidget/`)

```
FireReachWidget/
├── FireReachWidget.swift              # @main WidgetBundle entry
├── Widgets/
│   ├── EmergencyHomeWidget.swift      # systemSmall / systemMedium
│   └── EmergencyAccessoryWidget.swift # accessoryRectangular / Circular / Inline
├── Provider/
│   ├── StationTimelineProvider.swift  # TimelineProvider impl
│   └── StationEntry.swift             # TimelineEntry struct
├── Model/
│   ├── StationSnapshot.swift          # Codable matching the App Group JSON
│   └── AppGroupStore.swift            # read helper for "nearestStation.v1"
├── Intents/
│   └── CallStationIntent.swift        # iOS 17+ AppIntent (gated by @available)
├── Views/
│   ├── HomeSmallView.swift
│   ├── HomeMediumView.swift
│   ├── AccessoryRectangularView.swift
│   ├── AccessoryCircularView.swift
│   ├── AccessoryInlineView.swift
│   └── EmptyStateView.swift           # cold-install CTA (A1)
├── Resources/
│   └── Assets.xcassets                # widget-only colors/images (BrandRed, flame glyph)
├── Info.plist
└── FireReachWidget.entitlements       # App Group: group.com.firereach.app
```

**Deployment target:** widget extension at iOS 15.1 (matches app). iOS 17
features gated by `if #available(iOS 17, *)` and `@available` on
`CallStationIntent`.

### New — main app native bridge (`app/ios/FireReach/`)

```
FireReach/
└── WidgetBridge/
    ├── WidgetBridge.swift             # exposes writeStationCache + reloadWidgets to JS
    └── WidgetBridge.m                 # RCT_EXTERN_MODULE bridge header
```

(Or as an Expo Module — same code, slightly different boilerplate. Pick at
implementation time.)

### Modified — main app

- `app/ios/FireReach/AppDelegate.swift` — add `application(_:open:options:)`
  handler for `firereach://call?phone=...` URL scheme.
- `app/ios/FireReach/Info.plist` — register `firereach` URL scheme under
  `CFBundleURLTypes`.

### RN / TypeScript side

- `app/src/native/WidgetBridge.ts` — typed wrapper around the native module:
  `writeStationCache(snapshot)`, `reloadWidgets()`.
- `app/src/hooks/useNearestStation.ts` — calls the bridge after each
  successful resolve.
- `app/src/hooks/useConnectivity.ts` — unchanged by widget work but bundled
  in this spec.
- `app/src/screens/HomeScreen.tsx` — replace hardcoded `NEARBY_STATIONS` with
  `useNearestStation`; add deep-link handler that pulls `phone` from URL and
  triggers `Linking.openURL("tel:${phone}")`.

### Xcode project changes

- Delete `ExpoWidgetsTarget`.
- Add `FireReachWidget` extension target (Widget Extension template).
- Embed `FireReachWidget.appex` in the main app.
- Both targets keep App Group `group.com.firereach.app` in Signing &
  Capabilities.

## Widget views per family

### `systemSmall` (2×2)

Full red card.

- Top: flame glyph + "FIREREACH" wordmark.
- Middle: station name (bold) + distance line ("2.4 km away").
- Staleness footnote ("updated 2 days ago") if `now - fetchedAt > 24h`.
- Bottom: white "📞 CALL" bar.
- Tap target: whole white CALL bar.
  - iOS 17+: `Button(intent: CallStationIntent(phone: ..., stationId: ...))`
    → direct dial.
  - iOS 15.1–16.x: `Link(destination: firereach://call?phone=...)` → opens
    app → app dials.
- Tap on station-info area: deep-links to the app's HomeScreen on both iOS
  versions.

### `systemMedium` (4×2)

Same structure as small with larger type and more horizontal room.

- Same components as small, scaled up.
- Staleness shown inline next to distance instead of as a footnote.
- Tap behavior: identical hybrid split (CALL bar = call, info area = open
  app).

### `accessoryRectangular` (Lock Screen, iOS 16+)

Tinted/monochrome only (system enforces).

- Line 1: flame glyph + station name (truncates with `lineLimit(1)`).
- Line 2: "2.4 km · Tap to call".
- Whole tile is a single `Link` → `firereach://call?phone=...`.
- Always opens app on tap, even on iOS 17+ (see Lock Screen rationale above).

### `accessoryCircular`

- Just the flame glyph in a circular gauge frame (no text room).
- Single `Link` → opens app.
- Used as an at-a-glance "FireReach is set up" affordance.

### `accessoryInline`

- One line of monochrome text:
  `🔥 192 · Accra Central, 2.4 km`
- Order by importance: emergency number first, then station, then distance.
- Single `Link` → opens app.

### Empty state (A1)

Applied to all families when no cache:

- `systemSmall` / `systemMedium`: red panel, flame + "FIREREACH", body
  "Open FireReach to find your nearest fire station" + small "TAP TO OPEN"
  line. Tap opens app.
- Accessories: flame glyph + "Set up FireReach" (rectangular) / flame only
  (circular) / "Set up FireReach" (inline). All tap → open app.

### Branding tokens

Declared once, referenced everywhere:

- `BrandRed` = `#CC1B1B`
- `OnRed` = `#FFFFFF`
- `OnRedMuted` = `rgba(255,255,255,0.9)`

## Refresh strategy

The widget is a passive renderer of App Group state. Refreshes are driven from
two sides.

### 1. Push refresh (primary) — RN initiates

Whenever `useNearestStation` resolves a new station (or fails over to
fallback), it:

1. Persists to AsyncStorage (existing offline-first cache).
2. Calls `WidgetBridge.writeStationCache(snapshot)` → writes JSON to App Group.
3. Calls `WidgetBridge.reloadWidgets()` → invokes
   `WidgetCenter.shared.reloadAllTimelines()`.

This is what makes the widget feel "live" — within seconds of the user
opening the app and resolving a station, the widget rebuilds.

### 2. Pull refresh (secondary) — TimelineProvider self-schedules

`StationTimelineProvider.getTimeline(in:completion:)`:

- Reads App Group → parses `StationSnapshot`.
- Returns a single `StationEntry(date: now, snapshot: snapshot)`.
- Schedules next reload via `.after(Date().addingTimeInterval(60 * 60))` —
  1 hour.
- 1h cadence keeps the staleness footnote text accurate; we don't need
  minute precision.

If the App Group key is missing or malformed, `getTimeline` returns a single
`StationEntry(date: now, snapshot: nil)` and reschedules normally — the views
render the empty state.

### 3. Snapshot & placeholder

- `placeholder(in:)` — returns a hardcoded sample
  (`"Accra Central Fire Station", 2.4 km, 192`) for the widget gallery
  preview. Never reads the App Group.
- `getSnapshot(in:completion:)` — when `context.isPreview == true` returns
  the same sample; otherwise returns the real cached entry.

### 4. Reload budget

WidgetKit imposes a daily reload budget per widget. Our pattern is
conservative:

- 1 push reload per app foreground / GPS resolve (rare on a per-day basis).
- 24 pull reloads per day from the 1h timeline schedule.
- Well within Apple's typical budget; no special handling needed.

### 5. No background fetching from the widget

The widget never fetches network or GPS itself. All fresh data comes from the
RN app's normal `useNearestStation` lifecycle. Background location refresh —
if added later — lives in the offline-first feature, not here.

## Testing

### Swift / widget side

- **SwiftUI Previews.** Every view file ships with `#Preview` blocks for
  fresh data, stale data (>24h), and empty state. Previews are the primary
  feedback loop.
- **Unit tests** (target: `FireReachWidgetTests`):
  - `StationSnapshotTests` — Codable round-trip; rejects unknown
    `schemaVersion`; rejects missing required fields.
  - `StaleFormatterTests` — given `(fetchedAt, now)` produces expected text
    ("updated 2 days ago", "updated yesterday", no text within 24h).
  - `AppGroupStoreTests` — writes a sample blob, reads it back, returns nil
    on absent/malformed keys (uses an in-memory `UserDefaults(suiteName:)`
    instance).
- **Manual device matrix:**
  - iOS 17+ device: tap CALL bar on small + medium → dialer opens directly.
  - iOS 16 device: tap CALL bar → app opens via
    `firereach://call?phone=...`, dials.
  - Lock screen accessories: install via "Customize" on the lock screen,
    verify rendering and tap-to-open across rectangular/circular/inline.
  - Empty state: fresh install → all families show A1.

### RN / TS side

- **Unit test** `app/src/native/WidgetBridge.ts` — mocks
  `NativeModules.WidgetBridge`, asserts `writeStationCache` is called with
  the expected JSON shape and `reloadWidgets` fires after.
- **Hook test** for `useNearestStation` — when resolve succeeds, asserts
  `WidgetBridge.writeStationCache` is called with the right snapshot.
- **Manual cutover smoke test** — install build, open app, confirm widget
  renders updated station within ~5 s of foregrounding.

### Out of scope

- Snapshot-image testing of widget views (`swift-snapshot-testing` etc.) —
  Previews + manual device check is enough for v1.
- Automated tap/intent simulation — XCUITest on widget extensions is brittle;
  the manual matrix is more reliable.

## Migration & cutover order

Each phase is independently shippable and revertible. The existing TSX widget
keeps working until the final cutover.

### Phase 1 — RN-side data layer (no native, no widget changes)

- Build `useConnectivity`, `useNearestStation` with AsyncStorage cache
  `{ station, fetchedAt, userLat, userLng }`.
- Replace hardcoded `NEARBY_STATIONS` in `HomeScreen.tsx` with
  `useNearestStation`.
- Verify offline-first behavior end-to-end in the RN app.
- Existing TSX widget unchanged.
- Mergeable on its own.

### Phase 2 — Native bridge (no widget changes yet)

- Add `WidgetBridge.swift` + `.m` (or Expo Module) to `app/ios/FireReach/`.
- Add `app/src/native/WidgetBridge.ts` wrapper.
- `useNearestStation` calls `writeStationCache(...)` after each resolve.
- Verify writes land in App Group via Xcode debug print or temporary Swift
  snippet.
- `reloadWidgets()` is implemented but reloads the *existing* TSX widget
  (which doesn't read the App Group) — the call path is verified even if
  visually nothing changes.
- Mergeable on its own.

### Phase 3 — New Swift widget extension (parallel, not yet replacing)

- Add `FireReachWidget` extension target alongside `ExpoWidgetsTarget`.
- Implement `StationSnapshot`, `AppGroupStore`,
  `StationTimelineProvider`, all views, `CallStationIntent`, and the
  deep-link `firereach://call?phone=...` handler in `AppDelegate`.
- Register `firereach` URL scheme in `Info.plist`.
- Build to device. Both old and new widgets appear in the gallery.
- Verify hybrid tap behavior on iOS 17+ and iOS 16 devices.
- Verify all five family variants render correctly with fresh / stale /
  empty data.
- Mergeable on its own.

### Phase 4 — Cutover

- Remove `ExpoWidgetsTarget` from `FireReach.xcodeproj` and delete
  `app/ios/ExpoWidgetsTarget/`.
- Remove `expo-widgets` plugin block from `app.json`.
- Remove `expo-widgets` from `package.json` (lockfile update).
- Delete `app/widgets/emergency/index.tsx` and the empty `app/widgets/`
  directory.
- Bump app `version` (Phase 4 is a user-facing breaking change for anyone
  with the old widget on their home screen — they'll see a placeholder until
  they re-add).
- Add a one-time in-app banner / Settings note: "Widget updated — re-add it
  from your Home Screen for direct-call support".
- Mergeable as the final cutover commit.

### Rollback plan

If Phase 4 hits a problem post-release, revert the Phase 4 commit and ship a
hotfix; Phases 1–3 remain stable because they don't remove the existing
widget.

## Open questions

None at design time. Implementation choices left intentionally open:

- Whether `WidgetBridge` ships as an `RCT_EXTERN_MODULE` or an Expo Module —
  decide at implementation time based on whichever fits the existing
  RN/Expo bridge style in the repo.
- Exact wording of the in-app "re-add the widget" banner shipped in Phase 4.
