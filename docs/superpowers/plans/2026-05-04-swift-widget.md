# FireReach Swift Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `@expo/ui` TSX widget with a hand-written Swift WidgetKit extension, bundled with the offline-first nearest-station data layer it depends on.

**Architecture:** RN-side `useNearestStation` hook resolves the nearest station (via `expo-location` + the project API), persists to AsyncStorage, and pushes a JSON snapshot through a tiny Expo native module (`WidgetBridge`) into App Group `UserDefaults`. A new Swift WidgetKit extension (`FireReachWidget`) reads from the App Group and renders five widget families (small, medium, accessory rectangular/circular/inline). Tap behavior is hybrid: iOS 17+ uses `AppIntent` for direct dial; iOS 15.1–16.x deep-links into the app via `firereach://call?phone=...`.

**Tech Stack:** React Native 0.83.2, Expo SDK 55, TypeScript 5.9, Swift / SwiftUI / WidgetKit, AppIntents (iOS 17+), AsyncStorage, expo-location, expo-network, Expo Modules API.

**Spec:** `app/docs/superpowers/specs/2026-05-04-swift-widget-design.md`

---

## Pre-flight notes for the executor

Read these before starting any task.

- All paths are relative to `/Users/ericabbey/Desktop/Projects/firereach/app/` unless absolute. Run all commands from that directory unless stated otherwise.
- The `app/` directory is its own git repo on branch `main`. Commit after every task.
- **Testing approach:**
  - Swift / widget side: TDD with **XCTest** (built into Xcode, no setup). Add an `XCTest` target `FireReachWidgetTests` in Task 8.
  - TypeScript side: **no Jest setup.** Type safety + manual verification only. Where the spec calls for "unit tests" on TS code, this plan substitutes a `console.log`-driven manual check, called out per task. Adding Jest is out of scope for this plan.
- **iOS deployment target:** widget extension at iOS 15.1 (matches app). iOS 17 features gated by `@available(iOS 17, *)` and `if #available(iOS 17, *)`.
- **App Group:** `group.com.firereach.app` is **already configured** in both `FireReach.entitlements` and `ExpoWidgetsTarget.entitlements`. The new `FireReachWidget` target will reuse it.
- **Bundle identifiers:**
  - Main app: `com.firereach.app` (already)
  - Widget extension: `com.firereach.app.widget` (new)
- **xcodebuild commands:** Run from `app/ios/` and use the workspace, e.g. `xcodebuild -workspace FireReach.xcworkspace -scheme FireReachWidget -destination 'platform=iOS Simulator,name=iPhone 15' build`.
- **Pod install required after Xcode target additions** (Task 8). Run `npx pod-install` from `app/`.

---

## File structure (target state)

After all tasks complete, the new and modified files are:

```
app/
├── modules/                                # NEW — local Expo Module
│   └── widget-bridge/
│       ├── expo-module.config.json
│       ├── package.json
│       ├── ios/
│       │   ├── WidgetBridgeModule.swift
│       │   └── WidgetBridge.podspec
│       └── src/
│           ├── index.ts
│           └── types.ts
├── src/
│   ├── hooks/                              # NEW
│   │   ├── useConnectivity.ts
│   │   └── useNearestStation.ts
│   ├── lib/                                # NEW
│   │   ├── stationCache.ts                 # AsyncStorage helpers
│   │   ├── stationTypes.ts                 # Shared types
│   │   └── deepLinks.ts                    # firereach:// URL parsing
│   └── screens/
│       └── HomeScreen.tsx                  # MODIFIED
├── ios/
│   ├── FireReach/
│   │   ├── AppDelegate.swift               # UNCHANGED (URL forwarding already exists)
│   │   └── Info.plist                      # MODIFIED (CFBundleURLTypes adds firereach scheme)
│   ├── FireReachWidget/                    # NEW target
│   │   ├── FireReachWidget.swift
│   │   ├── Widgets/
│   │   │   ├── EmergencyHomeWidget.swift
│   │   │   └── EmergencyAccessoryWidget.swift
│   │   ├── Provider/
│   │   │   ├── StationTimelineProvider.swift
│   │   │   └── StationEntry.swift
│   │   ├── Model/
│   │   │   ├── StationSnapshot.swift
│   │   │   ├── AppGroupStore.swift
│   │   │   └── StaleFormatter.swift
│   │   ├── Intents/
│   │   │   └── CallStationIntent.swift
│   │   ├── Views/
│   │   │   ├── HomeSmallView.swift
│   │   │   ├── HomeMediumView.swift
│   │   │   ├── AccessoryRectangularView.swift
│   │   │   ├── AccessoryCircularView.swift
│   │   │   ├── AccessoryInlineView.swift
│   │   │   └── EmptyStateView.swift
│   │   ├── Resources/
│   │   │   └── Assets.xcassets             # BrandRed color set
│   │   ├── Info.plist
│   │   └── FireReachWidget.entitlements
│   └── FireReachWidgetTests/               # NEW XCTest target
│       ├── StationSnapshotTests.swift
│       ├── AppGroupStoreTests.swift
│       └── StaleFormatterTests.swift
├── widgets/                                # DELETED in Phase 4
│   └── emergency/index.tsx                 # DELETED in Phase 4
├── app.json                                # MODIFIED (remove expo-widgets plugin in Phase 4)
└── package.json                            # MODIFIED (add expo-network in Phase 1, remove expo-widgets in Phase 4)
```

---

# Phase 1 — RN-side offline-first data layer

Goal: replace `HomeScreen`'s hardcoded `NEAREST_STATION` with a real cache-backed hook. Existing TSX widget is unchanged this phase.

## Task 1: Shared types + AsyncStorage cache helper

**Files:**
- Create: `app/src/lib/stationTypes.ts`
- Create: `app/src/lib/stationCache.ts`

- [ ] **Step 1: Add expo-network dependency**

```bash
npx expo install expo-network
```

Expected: package added to `package.json` dependencies; lockfile updated.

- [ ] **Step 2: Create shared types file**

Create `app/src/lib/stationTypes.ts`:

```typescript
export const STATION_CACHE_VERSION = 1 as const;

export type StationLocation = {
  lat: number;
  lng: number;
};

export type Station = {
  id: string;
  name: string;
  region: string;
  distanceMeters: number;
  phone: string; // digits only, e.g. "192" or "+233302773906"
};

export type StationSnapshot = {
  schemaVersion: typeof STATION_CACHE_VERSION;
  fetchedAt: string; // ISO 8601
  userLocation: StationLocation;
  station: Station;
};
```

- [ ] **Step 3: Create AsyncStorage cache helper**

Create `app/src/lib/stationCache.ts`:

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  STATION_CACHE_VERSION,
  StationSnapshot,
} from "./stationTypes";

const CACHE_KEY = "firereach.nearestStation.v1";

export async function readStationCache(): Promise<StationSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StationSnapshot;
    if (parsed.schemaVersion !== STATION_CACHE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeStationCache(
  snapshot: StationSnapshot
): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
}

export async function clearStationCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
```

- [ ] **Step 4: Manual verification**

Add this temporary smoke check to `app/App.tsx` (top of the function body):

```typescript
import { readStationCache, writeStationCache } from "./src/lib/stationCache";
// ... inside the App component, in a useEffect:
React.useEffect(() => {
  (async () => {
    await writeStationCache({
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      userLocation: { lat: 0, lng: 0 },
      station: { id: "x", name: "Test", region: "Test", distanceMeters: 0, phone: "192" },
    });
    const got = await readStationCache();
    console.log("[stationCache smoke]", got);
  })();
}, []);
```

Run: `npm run ios`
Expected: Metro logs show `[stationCache smoke] { schemaVersion: 1, ... }`.

- [ ] **Step 5: Remove smoke check and commit**

Revert the `App.tsx` change, then:

```bash
cd /Users/ericabbey/Desktop/Projects/firereach/app
git add src/lib/stationTypes.ts src/lib/stationCache.ts package.json package-lock.json
git commit -m "feat(app): add station cache types and AsyncStorage helper

Adds shared StationSnapshot type and a typed AsyncStorage wrapper used by the
offline-first useNearestStation hook (next task) and the WidgetBridge native
module (Phase 2)."
```

---

## Task 2: useConnectivity hook

**Files:**
- Create: `app/src/hooks/useConnectivity.ts`

- [ ] **Step 1: Write the hook**

Create `app/src/hooks/useConnectivity.ts`:

```typescript
import { useEffect, useState } from "react";
import * as Network from "expo-network";

export type ConnectivityState = {
  isOnline: boolean | null; // null = unknown / not yet resolved
};

export function useConnectivity(): ConnectivityState {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (cancelled) return;
        setIsOnline(Boolean(state.isInternetReachable ?? state.isConnected));
      } catch {
        if (cancelled) return;
        setIsOnline(false);
      }
    };

    refresh();
    const subscription = Network.addNetworkStateListener((state) => {
      if (cancelled) return;
      setIsOnline(Boolean(state.isInternetReachable ?? state.isConnected));
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return { isOnline };
}
```

- [ ] **Step 2: Manual verification**

Add to `App.tsx` temporarily:

```typescript
import { useConnectivity } from "./src/hooks/useConnectivity";
// inside App component:
const conn = useConnectivity();
console.log("[connectivity]", conn);
```

Run: `npm run ios`. Toggle airplane mode in simulator (Hardware > Toggle Network or `xcrun simctl ... `). Expected: log flips between `{ isOnline: true }` and `{ isOnline: false }`.

- [ ] **Step 3: Remove smoke check and commit**

```bash
git add src/hooks/useConnectivity.ts
git commit -m "feat(app): add useConnectivity hook backed by expo-network"
```

---

## Task 3: useNearestStation hook

**Files:**
- Create: `app/src/hooks/useNearestStation.ts`

This hook is the heart of the offline-first behavior. It loads from AsyncStorage on mount, attempts a fresh resolve via GPS + API call, and updates state + cache on success. On failure, the cache value remains current.

**Note:** the API endpoint for station resolution is not yet defined in the codebase. This task uses a placeholder `resolveNearestStation(lat, lng)` function that the executor must wire to whatever endpoint exists or stub. If no endpoint exists, leave it returning a hardcoded fallback for now; it can be replaced when the API is ready. The widget pipeline does not depend on the API.

- [ ] **Step 1: Write the hook**

Create `app/src/hooks/useNearestStation.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import {
  STATION_CACHE_VERSION,
  Station,
  StationSnapshot,
} from "../lib/stationTypes";
import {
  readStationCache,
  writeStationCache,
} from "../lib/stationCache";

export type NearestStationState = {
  snapshot: StationSnapshot | null;
  isResolving: boolean;
  hasError: boolean;
  refresh: () => Promise<void>;
};

const FALLBACK_STATION: Station = {
  id: "stn_fallback_192",
  name: "National Fire Service",
  region: "Ghana",
  distanceMeters: 0,
  phone: "192",
};

async function resolveNearestStation(
  lat: number,
  lng: number
): Promise<Station> {
  // TODO: replace with real API call when /stations/nearest endpoint exists.
  // Returning hardcoded data so the pipeline works end-to-end.
  return {
    id: "stn_accra_central",
    name: "Accra Central Fire Station",
    region: "Greater Accra Region",
    distanceMeters: 2400,
    phone: "+233302773906",
  };
}

export function useNearestStation(): NearestStationState {
  const [snapshot, setSnapshot] = useState<StationSnapshot | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const inFlight = useRef(false);

  // Load from cache on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readStationCache();
      if (!cancelled && cached) setSnapshot(cached);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsResolving(true);
    setHasError(false);

    try {
      const { status } =
        await Location.getForegroundPermissionsAsync();
      let granted = status === "granted";
      if (!granted) {
        const ask = await Location.requestForegroundPermissionsAsync();
        granted = ask.status === "granted";
      }
      if (!granted) {
        // Fall back to last-known cache (already in state) and the
        // hardcoded national emergency contact if no cache.
        if (!snapshot) {
          const fb: StationSnapshot = {
            schemaVersion: STATION_CACHE_VERSION,
            fetchedAt: new Date().toISOString(),
            userLocation: { lat: 0, lng: 0 },
            station: FALLBACK_STATION,
          };
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

      const station = await resolveNearestStation(
        position.coords.latitude,
        position.coords.longitude
      );

      const fresh: StationSnapshot = {
        schemaVersion: STATION_CACHE_VERSION,
        fetchedAt: new Date().toISOString(),
        userLocation: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
        station,
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
  }, [snapshot]);

  // Refresh on first mount (after cache load)
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { snapshot, isResolving, hasError, refresh };
}
```

- [ ] **Step 2: Manual verification**

Add to `App.tsx` temporarily:

```typescript
import { useNearestStation } from "./src/hooks/useNearestStation";
// inside App component:
const ns = useNearestStation();
console.log("[nearestStation]", ns.snapshot, ns.isResolving, ns.hasError);
```

Run: `npm run ios`. Grant location permission when prompted.
Expected logs:
1. `[nearestStation] null false false` (cache empty on cold start)
2. `[nearestStation] null true false` (resolving)
3. `[nearestStation] { schemaVersion: 1, station: { name: 'Accra Central Fire Station', ... } } false false`
4. On reload: snapshot is non-null on first log (cache hit).

- [ ] **Step 3: Remove smoke check and commit**

```bash
git add src/hooks/useNearestStation.ts
git commit -m "feat(app): add useNearestStation offline-first hook"
```

---

## Task 4: Wire HomeScreen to useNearestStation

**Files:**
- Modify: `app/src/screens/HomeScreen.tsx`

Replace the hardcoded `NEAREST_STATION` constant with the hook. Keep the `NEARBY_STATIONS` chips hardcoded for now (out of scope for this plan).

- [ ] **Step 1: Apply the edit**

In `app/src/screens/HomeScreen.tsx`:

Replace lines 1–28 (imports + `NEAREST_STATION` constant) with:

```typescript
import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GearSixIcon,
  PhoneIcon,
  MapPinIcon,
  ShieldCheckIcon,
  ListBulletsIcon,
  PencilSimpleIcon,
  WifiSlashIcon,
} from "phosphor-react-native";
import { Text } from "../components/ui/Text";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { useConnectivity } from "../hooks/useConnectivity";
import { useNearestStation } from "../hooks/useNearestStation";

const NEARBY_STATIONS = [
  { name: "Tema Station", distance: "5.1 km" },
  { name: "Madina Station", distance: "6.3 km" },
];

function formatDistance(meters: number): string {
  if (meters <= 0) return "Distance unavailable";
  const km = meters / 1000;
  return `~${km.toFixed(1)} km away`;
}

function shortName(name: string): string {
  // "Accra Central Fire Station" -> "Accra Central"
  return name.replace(/\s+Fire Station$/i, "").trim();
}
```

Replace the `HomeScreen` function body up through the `handleCall` closure (lines 35–41) with:

```typescript
export const HomeScreen = () => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { isOnline } = useConnectivity();
  const { snapshot } = useNearestStation();

  const station = snapshot?.station ?? null;

  const handleCall = () => {
    if (!station) return;
    Linking.openURL(`tel:${station.phone}`);
  };
```

Replace the connectivity alert block (lines 71–86) with:

```typescript
        {/* Connectivity Alert */}
        {isOnline === false && (
          <View
            style={[
              styles.alert,
              {
                backgroundColor: theme.warningBg,
                borderColor: theme.warningBorder,
              },
            ]}
          >
            <WifiSlashIcon size={20} color={colors.warning} />
            <Text variant="caption" weight="medium" color={theme.warningText}>
              No internet — showing last known station
            </Text>
          </View>
        )}
```

Replace the `distanceBadge` and `stationInfo` blocks (lines 100–116) with:

```typescript
            <View style={styles.distanceBadge}>
              <Text variant="label" color="#FFFFFF">
                {station ? formatDistance(station.distanceMeters) : "Locating…"}
              </Text>
            </View>
          </View>
          <View style={styles.stationInfo}>
            <Text variant="heading2">
              {station?.name ?? "Finding nearest station…"}
            </Text>
            <Text
              variant="caption"
              weight="medium"
              color={theme.textSecondary}
              style={styles.stationRegion}
            >
              {station?.region ?? ""}
            </Text>
          </View>
```

Replace the call button label (line 127) — change "Call Accra Central" to a dynamic label:

```typescript
          <Text variant="bodyLarge" weight="bold" color="#FFFFFF">
            {station ? `Call ${shortName(station.name)}` : "Call Emergency"}
          </Text>
```

- [ ] **Step 2: Manual verification**

Run: `npm run ios`. Grant location permission.
Expected:
- Online: connectivity banner is hidden.
- Offline (toggle airplane mode): banner reads "No internet — showing last known station".
- Cold start: brief "Finding nearest station…" then "Accra Central Fire Station" + "~2.4 km away".
- Tap CALL: dialer opens with `+233302773906`.

- [ ] **Step 3: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat(app): wire HomeScreen to useNearestStation + useConnectivity

Replaces hardcoded NEAREST_STATION constant with the offline-first hook.
Connectivity banner now only shows when actually offline. Call button label
adapts to the resolved station."
```

---

# Phase 2 — Native bridge (local Expo Module)

Goal: build a tiny `WidgetBridge` Expo Module exposing two functions to JS — `writeStationCache(snapshot)` and `reloadWidgets()` — and wire it into `useNearestStation`. The existing TSX widget is still in place; it just won't read from the App Group, so visually nothing changes — but the call path is verified.

## Task 5: Scaffold the local Expo Module

**Files:**
- Create: `app/modules/widget-bridge/expo-module.config.json`
- Create: `app/modules/widget-bridge/package.json`
- Create: `app/modules/widget-bridge/ios/WidgetBridge.podspec`
- Create: `app/modules/widget-bridge/ios/WidgetBridgeModule.swift` (skeleton)
- Create: `app/modules/widget-bridge/src/index.ts`
- Create: `app/modules/widget-bridge/src/types.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p modules/widget-bridge/ios modules/widget-bridge/src
```

- [ ] **Step 2: Create `expo-module.config.json`**

Create `app/modules/widget-bridge/expo-module.config.json`:

```json
{
  "platforms": ["apple"],
  "apple": {
    "modules": ["WidgetBridgeModule"]
  }
}
```

- [ ] **Step 3: Create `package.json`**

Create `app/modules/widget-bridge/package.json`:

```json
{
  "name": "widget-bridge",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "private": true,
  "peerDependencies": {
    "expo": "*",
    "react": "*",
    "react-native": "*"
  }
}
```

- [ ] **Step 4: Create the podspec**

Create `app/modules/widget-bridge/ios/WidgetBridge.podspec`:

```ruby
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'WidgetBridge'
  s.version        = package['version']
  s.summary        = 'Bridge for writing widget cache to App Group and reloading widgets.'
  s.description    = package['name']
  s.author         = 'FireReach'
  s.homepage       = 'https://firereach.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
```

- [ ] **Step 5: Create the Swift skeleton**

Create `app/modules/widget-bridge/ios/WidgetBridgeModule.swift`:

```swift
import ExpoModulesCore

public class WidgetBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    AsyncFunction("writeStationCache") { (json: String) -> Void in
      // Implemented in Task 6
    }

    AsyncFunction("reloadWidgets") { () -> Void in
      // Implemented in Task 6
    }
  }
}
```

- [ ] **Step 6: Create the TS types**

Create `app/modules/widget-bridge/src/types.ts`:

```typescript
export type WidgetStation = {
  id: string;
  name: string;
  region: string;
  distanceMeters: number;
  phone: string;
};

export type WidgetSnapshot = {
  schemaVersion: 1;
  fetchedAt: string; // ISO 8601
  userLocation: { lat: number; lng: number };
  station: WidgetStation;
};
```

- [ ] **Step 7: Create the TS entry**

Create `app/modules/widget-bridge/src/index.ts`:

```typescript
import { requireNativeModule } from "expo-modules-core";
import { WidgetSnapshot } from "./types";

export type { WidgetSnapshot, WidgetStation } from "./types";

type NativeModule = {
  writeStationCache(json: string): Promise<void>;
  reloadWidgets(): Promise<void>;
};

const native = requireNativeModule<NativeModule>("WidgetBridge");

export async function writeStationCache(
  snapshot: WidgetSnapshot
): Promise<void> {
  await native.writeStationCache(JSON.stringify(snapshot));
}

export async function reloadWidgets(): Promise<void> {
  await native.reloadWidgets();
}
```

- [ ] **Step 8: Run pod install**

```bash
npx pod-install
```

Expected: `Installing WidgetBridge (0.1.0)` appears in the pod install output.

- [ ] **Step 9: Build the iOS app**

```bash
npm run ios
```

Expected: build succeeds, app launches. The module is registered but does nothing yet.

- [ ] **Step 10: Commit**

```bash
git add modules/widget-bridge ios/Podfile.lock
git commit -m "feat(widget-bridge): scaffold local Expo Module

Empty WidgetBridge module exposing writeStationCache and reloadWidgets stubs.
Implementation follows in next task."
```

---

## Task 6: Implement WidgetBridge Swift body

**Files:**
- Modify: `app/modules/widget-bridge/ios/WidgetBridgeModule.swift`

- [ ] **Step 1: Replace the skeleton with the implementation**

Overwrite `app/modules/widget-bridge/ios/WidgetBridgeModule.swift`:

```swift
import ExpoModulesCore
import WidgetKit

public class WidgetBridgeModule: Module {
  private static let appGroup = "group.com.firereach.app"
  private static let cacheKey = "nearestStation.v1"

  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    AsyncFunction("writeStationCache") { (json: String) -> Void in
      guard let defaults = UserDefaults(suiteName: Self.appGroup) else {
        throw Exception(name: "AppGroupUnavailable", description:
          "Could not open UserDefaults for suite \(Self.appGroup). " +
          "Verify the App Group entitlement is enabled on the main app target.")
      }
      defaults.set(json, forKey: Self.cacheKey)
    }

    AsyncFunction("reloadWidgets") { () -> Void in
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
}
```

- [ ] **Step 2: Manual verification**

Add to `App.tsx` temporarily, near the other smoke checks:

```typescript
import * as WidgetBridge from "../modules/widget-bridge/src";
React.useEffect(() => {
  (async () => {
    await WidgetBridge.writeStationCache({
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      userLocation: { lat: 5.6, lng: -0.18 },
      station: {
        id: "test",
        name: "Bridge Test Station",
        region: "Test Region",
        distanceMeters: 1234,
        phone: "192",
      },
    });
    await WidgetBridge.reloadWidgets();
    console.log("[WidgetBridge smoke] OK");
  })();
}, []);
```

Run: `npm run ios`.
Expected: console logs `[WidgetBridge smoke] OK`. Verify the App Group write by adding a temporary read-back in the existing `ExpoWidgetsTarget/index.swift` (or just inspect the simulator's shared container). Easier verification: in Xcode, breakpoint on the `defaults.set` line and confirm `defaults` is non-nil and the value is written.

- [ ] **Step 3: Remove smoke check and commit**

```bash
git add modules/widget-bridge/ios/WidgetBridgeModule.swift
git commit -m "feat(widget-bridge): implement App Group write and WidgetCenter reload

writeStationCache stores JSON under group.com.firereach.app:nearestStation.v1.
reloadWidgets calls WidgetCenter.shared.reloadAllTimelines so any installed
WidgetKit widget refreshes immediately."
```

---

## Task 7: Wire WidgetBridge into useNearestStation

**Files:**
- Modify: `app/src/hooks/useNearestStation.ts`

- [ ] **Step 1: Apply the edit**

In `app/src/hooks/useNearestStation.ts`, add the import (top of file, after the other imports):

```typescript
import * as WidgetBridge from "../../modules/widget-bridge/src";
```

In the `refresh` function, after `await writeStationCache(fresh);`, add:

```typescript
      try {
        await WidgetBridge.writeStationCache(fresh);
        await WidgetBridge.reloadWidgets();
      } catch (bridgeErr) {
        console.warn("[useNearestStation] WidgetBridge sync failed", bridgeErr);
      }
```

In the same function, after the `setSnapshot(fb); await writeStationCache(fb);` block (the no-permission fallback), add the same try/catch sync block (so the widget still gets a snapshot even when location is denied).

- [ ] **Step 2: Manual verification**

Run: `npm run ios`. Watch Xcode console (in Xcode, open `FireReach.xcworkspace`, select the running target, view console).
Expected: no warnings about `WidgetBridge sync failed`. The App Group write happens silently. (No visible UI change yet — TSX widget doesn't read from App Group.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNearestStation.ts
git commit -m "feat(app): sync resolved station to App Group via WidgetBridge

useNearestStation now writes each resolved snapshot into App Group UserDefaults
and triggers a WidgetCenter reload. The Swift widget extension (Phase 3) will
read this state."
```

---

# Phase 3 — Swift WidgetKit extension

Goal: add a hand-written `FireReachWidget` extension target alongside the existing `ExpoWidgetsTarget`. Both widgets coexist until Phase 4. By the end of this phase the new widget can be added from the gallery and renders real cached data.

## Task 8: Add FireReachWidget extension target in Xcode

**Files:**
- Create: `app/ios/FireReachWidget/Info.plist`
- Create: `app/ios/FireReachWidget/FireReachWidget.entitlements`
- Create: `app/ios/FireReachWidget/Resources/Assets.xcassets/Contents.json`
- Create: `app/ios/FireReachWidget/Resources/Assets.xcassets/BrandRed.colorset/Contents.json`
- Modifies: `app/ios/FireReach.xcodeproj/project.pbxproj` (via Xcode UI)

This is an Xcode-mediated change. Use the GUI; the resulting `project.pbxproj` diff is large but mechanical.

- [ ] **Step 1: Open the workspace**

```bash
open ios/FireReach.xcworkspace
```

- [ ] **Step 2: Add a Widget Extension target**

In Xcode:
1. File → New → Target…
2. Choose **iOS** → **Widget Extension** → Next.
3. Product Name: `FireReachWidget`
4. Team: (your team)
5. Organization Identifier: `com.firereach`
6. Bundle Identifier: should resolve to `com.firereach.app.widget`. Override if it doesn't.
7. Language: **Swift**
8. **Uncheck** "Include Live Activity".
9. **Uncheck** "Include Configuration App Intent".
10. Click Finish. When prompted to activate the new scheme, click **Activate**.

Xcode creates `app/ios/FireReachWidget/` with a default `FireReachWidget.swift`, `Info.plist`, and Assets. Discard the auto-generated `FireReachWidget.swift` content (it's a placeholder; we'll overwrite in later tasks).

- [ ] **Step 3: Set deployment target**

Select the `FireReachWidget` target → General → Minimum Deployments → set iOS to **15.1**. (The Widget Extension default is iOS 17; we lower it to match the app.)

- [ ] **Step 4: Add the App Group entitlement**

Select the `FireReachWidget` target → Signing & Capabilities → "+ Capability" → App Groups → click "+" under App Groups → enter `group.com.firereach.app`.

This creates `app/ios/FireReachWidget/FireReachWidget.entitlements`. Verify its contents are exactly:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.application-groups</key>
    <array>
      <string>group.com.firereach.app</string>
    </array>
  </dict>
</plist>
```

- [ ] **Step 5: Add the BrandRed color asset**

In Xcode, with `FireReachWidget` selected, navigate to its `Assets.xcassets`. Right-click → New Color Set → name it `BrandRed`. In the inspector:
- Universal: set RGB to `#CC1B1B` (R=204, G=27, B=27, A=100%) for both Any Appearance and Dark Appearance.

Verify the file `app/ios/FireReachWidget/Resources/Assets.xcassets/BrandRed.colorset/Contents.json` was created. (Path may be `Assets.xcassets` directly under `FireReachWidget/` depending on Xcode template; either is fine — record the actual location for later view code.)

- [ ] **Step 6: Add the XCTest target**

In Xcode: File → New → Target → **iOS** → **Unit Testing Bundle** → Next.
- Product Name: `FireReachWidgetTests`
- Target to be Tested: `FireReachWidget`
- Click Finish.

Xcode creates `app/ios/FireReachWidgetTests/` with a stub `FireReachWidgetTests.swift`. Delete the stub file (we'll add real test files in Task 9).

- [ ] **Step 7: Build the widget target**

```bash
xcodebuild -workspace ios/FireReach.xcworkspace -scheme FireReachWidget \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -configuration Debug \
  build | tail -20
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 8: Commit**

```bash
git add ios/FireReach.xcodeproj/project.pbxproj ios/FireReachWidget ios/FireReachWidgetTests
git commit -m "build(ios): add FireReachWidget extension and test targets

Adds an empty Swift WidgetKit extension target alongside the existing
ExpoWidgetsTarget. Configures App Group entitlement (group.com.firereach.app),
iOS 15.1 deployment target, and an XCTest unit test target. Real widget code
lands in the next task."
```

---

## Task 9: Station model + AppGroupStore + StaleFormatter (TDD with XCTest)

**Files:**
- Create: `app/ios/FireReachWidget/Model/StationSnapshot.swift`
- Create: `app/ios/FireReachWidget/Model/AppGroupStore.swift`
- Create: `app/ios/FireReachWidget/Model/StaleFormatter.swift`
- Create: `app/ios/FireReachWidgetTests/StationSnapshotTests.swift`
- Create: `app/ios/FireReachWidgetTests/AppGroupStoreTests.swift`
- Create: `app/ios/FireReachWidgetTests/StaleFormatterTests.swift`

In Xcode, create the `Model/` group inside `FireReachWidget` (right-click target → New Group).

For each file you create in the Xcode UI, ensure target membership: **`FireReachWidget`** for source files, **`FireReachWidgetTests`** for test files.

### Sub-step A — StationSnapshot

- [ ] **Step 1: Write failing test**

Create `app/ios/FireReachWidgetTests/StationSnapshotTests.swift`:

```swift
import XCTest
@testable import FireReachWidget

final class StationSnapshotTests: XCTestCase {
  func test_decodesValidJSON() throws {
    let json = """
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
    """.data(using: .utf8)!

    let snapshot = try JSONDecoder().decode(StationSnapshot.self, from: json)
    XCTAssertEqual(snapshot.schemaVersion, 1)
    XCTAssertEqual(snapshot.station.name, "Accra Central Fire Station")
    XCTAssertEqual(snapshot.station.distanceMeters, 2400)
    XCTAssertEqual(snapshot.station.phone, "192")
  }

  func test_rejectsUnknownSchemaVersion() {
    let json = """
    {
      "schemaVersion": 999,
      "fetchedAt": "2026-05-04T14:53:00Z",
      "userLocation": { "lat": 0, "lng": 0 },
      "station": { "id": "x", "name": "x", "region": "x", "distanceMeters": 0, "phone": "1" }
    }
    """.data(using: .utf8)!

    XCTAssertThrowsError(try JSONDecoder().decode(StationSnapshot.self, from: json))
  }

  func test_roundTripEncodeDecode() throws {
    let original = StationSnapshot(
      schemaVersion: 1,
      fetchedAt: "2026-05-04T14:53:00Z",
      userLocation: .init(lat: 1.0, lng: 2.0),
      station: .init(
        id: "id",
        name: "Name",
        region: "Region",
        distanceMeters: 100,
        phone: "192"
      )
    )
    let data = try JSONEncoder().encode(original)
    let decoded = try JSONDecoder().decode(StationSnapshot.self, from: data)
    XCTAssertEqual(decoded.station.name, "Name")
    XCTAssertEqual(decoded.station.distanceMeters, 100)
  }
}
```

- [ ] **Step 2: Run test, expect failure (no `StationSnapshot` type yet)**

In Xcode: Cmd+U on the `FireReachWidget` scheme.
Expected: build error "cannot find type 'StationSnapshot' in scope".

- [ ] **Step 3: Write minimal implementation**

Create `app/ios/FireReachWidget/Model/StationSnapshot.swift`:

```swift
import Foundation

struct StationSnapshot: Codable, Equatable {
  let schemaVersion: Int
  let fetchedAt: String
  let userLocation: Location
  let station: Station

  struct Location: Codable, Equatable {
    let lat: Double
    let lng: Double
  }

  struct Station: Codable, Equatable {
    let id: String
    let name: String
    let region: String
    let distanceMeters: Int
    let phone: String
  }

  init(
    schemaVersion: Int,
    fetchedAt: String,
    userLocation: Location,
    station: Station
  ) {
    self.schemaVersion = schemaVersion
    self.fetchedAt = fetchedAt
    self.userLocation = userLocation
    self.station = station
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let v = try c.decode(Int.self, forKey: .schemaVersion)
    guard v == 1 else {
      throw DecodingError.dataCorruptedError(
        forKey: .schemaVersion,
        in: c,
        debugDescription: "Unsupported schemaVersion \(v); widget supports only 1."
      )
    }
    self.schemaVersion = v
    self.fetchedAt = try c.decode(String.self, forKey: .fetchedAt)
    self.userLocation = try c.decode(Location.self, forKey: .userLocation)
    self.station = try c.decode(Station.self, forKey: .station)
  }

  enum CodingKeys: String, CodingKey {
    case schemaVersion, fetchedAt, userLocation, station
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Cmd+U. Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add ios/FireReachWidget/Model/StationSnapshot.swift \
        ios/FireReachWidgetTests/StationSnapshotTests.swift \
        ios/FireReach.xcodeproj/project.pbxproj
git commit -m "feat(widget): add StationSnapshot Codable model with schema check"
```

### Sub-step B — AppGroupStore

- [ ] **Step 1: Write failing test**

Create `app/ios/FireReachWidgetTests/AppGroupStoreTests.swift`:

```swift
import XCTest
@testable import FireReachWidget

final class AppGroupStoreTests: XCTestCase {
  let testSuite = "test.firereach.appgroup"

  override func setUp() {
    super.setUp()
    UserDefaults(suiteName: testSuite)?.removePersistentDomain(forName: testSuite)
  }

  func test_returnsNilWhenKeyAbsent() {
    let store = AppGroupStore(suiteName: testSuite)
    XCTAssertNil(store.readSnapshot())
  }

  func test_returnsNilOnMalformedJSON() {
    let defaults = UserDefaults(suiteName: testSuite)!
    defaults.set("not json", forKey: "nearestStation.v1")
    let store = AppGroupStore(suiteName: testSuite)
    XCTAssertNil(store.readSnapshot())
  }

  func test_returnsParsedSnapshotWhenPresent() {
    let defaults = UserDefaults(suiteName: testSuite)!
    let json = """
    {
      "schemaVersion": 1,
      "fetchedAt": "2026-05-04T14:53:00Z",
      "userLocation": { "lat": 5.6, "lng": -0.18 },
      "station": { "id": "x", "name": "Test Station", "region": "Test", "distanceMeters": 1234, "phone": "192" }
    }
    """
    defaults.set(json, forKey: "nearestStation.v1")
    let store = AppGroupStore(suiteName: testSuite)
    let snapshot = store.readSnapshot()
    XCTAssertEqual(snapshot?.station.name, "Test Station")
    XCTAssertEqual(snapshot?.station.distanceMeters, 1234)
  }

  func test_returnsNilOnUnsupportedSchemaVersion() {
    let defaults = UserDefaults(suiteName: testSuite)!
    defaults.set("""
      {"schemaVersion":99,"fetchedAt":"x","userLocation":{"lat":0,"lng":0},
       "station":{"id":"x","name":"x","region":"x","distanceMeters":0,"phone":"1"}}
    """, forKey: "nearestStation.v1")
    let store = AppGroupStore(suiteName: testSuite)
    XCTAssertNil(store.readSnapshot())
  }
}
```

- [ ] **Step 2: Run test, expect failure**

Cmd+U. Expected: "cannot find 'AppGroupStore' in scope".

- [ ] **Step 3: Write the implementation**

Create `app/ios/FireReachWidget/Model/AppGroupStore.swift`:

```swift
import Foundation

struct AppGroupStore {
  static let productionSuiteName = "group.com.firereach.app"
  static let cacheKey = "nearestStation.v1"

  let suiteName: String

  init(suiteName: String = AppGroupStore.productionSuiteName) {
    self.suiteName = suiteName
  }

  func readSnapshot() -> StationSnapshot? {
    guard let defaults = UserDefaults(suiteName: suiteName),
          let json = defaults.string(forKey: Self.cacheKey),
          let data = json.data(using: .utf8) else {
      return nil
    }
    return try? JSONDecoder().decode(StationSnapshot.self, from: data)
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Cmd+U. Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add ios/FireReachWidget/Model/AppGroupStore.swift \
        ios/FireReachWidgetTests/AppGroupStoreTests.swift \
        ios/FireReach.xcodeproj/project.pbxproj
git commit -m "feat(widget): add AppGroupStore for reading shared cache"
```

### Sub-step C — StaleFormatter

- [ ] **Step 1: Write failing test**

Create `app/ios/FireReachWidgetTests/StaleFormatterTests.swift`:

```swift
import XCTest
@testable import FireReachWidget

final class StaleFormatterTests: XCTestCase {
  let now = ISO8601DateFormatter().date(from: "2026-05-04T14:53:00Z")!
  let formatter = ISO8601DateFormatter()

  private func iso(_ s: String) -> String { s }

  func test_returnsNilWithin24Hours() {
    XCTAssertNil(StaleFormatter.text(fetchedAtISO: "2026-05-04T10:00:00Z", now: now))
    XCTAssertNil(StaleFormatter.text(fetchedAtISO: "2026-05-03T15:00:00Z", now: now))
  }

  func test_returnsYesterdayBetween24And48Hours() {
    XCTAssertEqual(
      StaleFormatter.text(fetchedAtISO: "2026-05-03T10:00:00Z", now: now),
      "updated yesterday"
    )
  }

  func test_returnsDaysAgoForOlder() {
    XCTAssertEqual(
      StaleFormatter.text(fetchedAtISO: "2026-05-01T14:53:00Z", now: now),
      "updated 3 days ago"
    )
    XCTAssertEqual(
      StaleFormatter.text(fetchedAtISO: "2026-04-27T14:53:00Z", now: now),
      "updated 7 days ago"
    )
  }

  func test_returnsNilForFutureDates() {
    XCTAssertNil(StaleFormatter.text(fetchedAtISO: "2026-05-05T14:53:00Z", now: now))
  }

  func test_returnsNilForUnparseable() {
    XCTAssertNil(StaleFormatter.text(fetchedAtISO: "not-a-date", now: now))
  }
}
```

- [ ] **Step 2: Run, expect failure**

Cmd+U. Expected: "cannot find 'StaleFormatter' in scope".

- [ ] **Step 3: Write the implementation**

Create `app/ios/FireReachWidget/Model/StaleFormatter.swift`:

```swift
import Foundation

enum StaleFormatter {
  static func text(fetchedAtISO: String, now: Date = Date()) -> String? {
    let parser = ISO8601DateFormatter()
    guard let fetched = parser.date(from: fetchedAtISO) else { return nil }
    let elapsed = now.timeIntervalSince(fetched)
    guard elapsed >= 24 * 3600 else { return nil }
    let days = Int(elapsed / (24 * 3600))
    if days == 1 {
      return "updated yesterday"
    }
    return "updated \(days) days ago"
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Cmd+U. Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add ios/FireReachWidget/Model/StaleFormatter.swift \
        ios/FireReachWidgetTests/StaleFormatterTests.swift \
        ios/FireReach.xcodeproj/project.pbxproj
git commit -m "feat(widget): add StaleFormatter for relative-age labels"
```

---

## Task 10: TimelineEntry + TimelineProvider

**Files:**
- Create: `app/ios/FireReachWidget/Provider/StationEntry.swift`
- Create: `app/ios/FireReachWidget/Provider/StationTimelineProvider.swift`

In Xcode, create the `Provider/` group with target membership `FireReachWidget`.

- [ ] **Step 1: Create the entry**

Create `app/ios/FireReachWidget/Provider/StationEntry.swift`:

```swift
import WidgetKit

struct StationEntry: TimelineEntry {
  let date: Date
  let snapshot: StationSnapshot?

  static let preview = StationEntry(
    date: Date(),
    snapshot: StationSnapshot(
      schemaVersion: 1,
      fetchedAt: ISO8601DateFormatter().string(from: Date()),
      userLocation: .init(lat: 5.6037, lng: -0.1870),
      station: .init(
        id: "stn_accra_central",
        name: "Accra Central Fire Station",
        region: "Greater Accra",
        distanceMeters: 2400,
        phone: "192"
      )
    )
  )

  static let stale = StationEntry(
    date: Date(),
    snapshot: StationSnapshot(
      schemaVersion: 1,
      fetchedAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-3 * 24 * 3600)),
      userLocation: .init(lat: 5.6037, lng: -0.1870),
      station: .init(
        id: "stn_accra_central",
        name: "Accra Central Fire Station",
        region: "Greater Accra",
        distanceMeters: 2400,
        phone: "192"
      )
    )
  )

  static let empty = StationEntry(date: Date(), snapshot: nil)
}
```

- [ ] **Step 2: Create the provider**

Create `app/ios/FireReachWidget/Provider/StationTimelineProvider.swift`:

```swift
import WidgetKit

struct StationTimelineProvider: TimelineProvider {
  let store: AppGroupStore

  init(store: AppGroupStore = AppGroupStore()) {
    self.store = store
  }

  func placeholder(in context: Context) -> StationEntry {
    .preview
  }

  func getSnapshot(in context: Context, completion: @escaping (StationEntry) -> Void) {
    if context.isPreview {
      completion(.preview)
    } else {
      let snapshot = store.readSnapshot()
      completion(StationEntry(date: Date(), snapshot: snapshot))
    }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<StationEntry>) -> Void) {
    let snapshot = store.readSnapshot()
    let entry = StationEntry(date: Date(), snapshot: snapshot)
    let nextRefresh = Date().addingTimeInterval(60 * 60)
    completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
  }
}
```

- [ ] **Step 3: Build to verify compilation**

```bash
xcodebuild -workspace ios/FireReach.xcworkspace -scheme FireReachWidget \
  -destination 'platform=iOS Simulator,name=iPhone 15' build | tail -10
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
git add ios/FireReachWidget/Provider \
        ios/FireReach.xcodeproj/project.pbxproj
git commit -m "feat(widget): add StationEntry and StationTimelineProvider

Provider reads from AppGroupStore and schedules a 1h reload cadence. Entry
exposes preview/stale/empty static fixtures used by SwiftUI Previews."
```

---

## Task 11: CallStationIntent (iOS 17+)

**Files:**
- Create: `app/ios/FireReachWidget/Intents/CallStationIntent.swift`

- [ ] **Step 1: Create the intent**

Create `app/ios/FireReachWidget/Intents/CallStationIntent.swift`:

```swift
import AppIntents
import Foundation

@available(iOS 17.0, *)
struct CallStationIntent: AppIntent {
  static var title: LocalizedStringResource = "Call Station"
  static var openAppWhenRun: Bool = false
  // openAppWhenRun=false + perform() returns OpenURLIntent(tel:...) → the
  // system routes the URL straight to the dialer. The FireReach app is NOT
  // opened. This is the iOS 17+ "direct dial" advantage over the iOS 15/16
  // path which goes Link → app → tel:.

  @Parameter(title: "Phone Number")
  var phone: String

  init() {
    self.phone = ""
  }

  init(phone: String) {
    self.phone = phone
  }

  func perform() async throws -> some IntentResult & OpensIntent {
    let sanitized = phone.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sanitized.isEmpty,
          let url = URL(string: "tel:\(sanitized)") else {
      // Fall back to opening the app at home if phone is missing/malformed.
      return .result(opensIntent: OpenURLIntent(URL(string: "firereach://")!))
    }
    return .result(opensIntent: OpenURLIntent(url))
  }
}
```

- [ ] **Step 2: Build**

```bash
xcodebuild -workspace ios/FireReach.xcworkspace -scheme FireReachWidget \
  -destination 'platform=iOS Simulator,name=iPhone 15' build | tail -10
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
git add ios/FireReachWidget/Intents \
        ios/FireReach.xcodeproj/project.pbxproj
git commit -m "feat(widget): add CallStationIntent for iOS 17+ direct-call"
```

---

## Task 12: Home Screen widget views (small + medium)

**Files:**
- Create: `app/ios/FireReachWidget/Views/HomeSmallView.swift`
- Create: `app/ios/FireReachWidget/Views/HomeMediumView.swift`

These views use the BrandRed asset added in Task 8.

- [ ] **Step 1: Create HomeSmallView**

Create `app/ios/FireReachWidget/Views/HomeSmallView.swift`:

```swift
import SwiftUI
import WidgetKit
import AppIntents

struct HomeSmallView: View {
  let entry: StationEntry

  var body: some View {
    if let snapshot = entry.snapshot {
      contentView(snapshot: snapshot)
    } else {
      EmptyStateView(family: .systemSmall)
    }
  }

  @ViewBuilder
  private func contentView(snapshot: StationSnapshot) -> some View {
    let station = snapshot.station
    let stale = StaleFormatter.text(fetchedAtISO: snapshot.fetchedAt)

    VStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 4) {
          Image(systemName: "flame.fill")
            .font(.system(size: 11))
            .foregroundStyle(.white)
          Text("FIREREACH")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.white)
        }
        Spacer(minLength: 0)
        Text(station.name)
          .font(.system(size: 14, weight: .bold))
          .foregroundStyle(.white)
          .lineLimit(2)
        Text(distanceLabel(meters: station.distanceMeters))
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(.white.opacity(0.9))
        if let stale {
          Text(stale)
            .font(.system(size: 9, weight: .regular))
            .foregroundStyle(.white.opacity(0.75))
        }
      }
      .padding(.horizontal, 14)
      .padding(.top, 14)
      .padding(.bottom, 8)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

      callBar(station: station)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color("BrandRed"))
  }

  @ViewBuilder
  private func callBar(station: StationSnapshot.Station) -> some View {
    let label = HStack(spacing: 6) {
      Image(systemName: "phone.fill")
        .font(.system(size: 14))
      Text("CALL")
        .font(.system(size: 13, weight: .bold))
    }
    .foregroundStyle(Color("BrandRed"))
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color.white)

    if #available(iOS 17.0, *) {
      Button(intent: CallStationIntent(phone: station.phone)) {
        label
      }
      .buttonStyle(.plain)
      .frame(height: 40)
    } else {
      Link(destination: URL(string: "firereach://call?phone=\(station.phone)")!) {
        label
      }
      .frame(height: 40)
    }
  }

  private func distanceLabel(meters: Int) -> String {
    guard meters > 0 else { return "Distance unavailable" }
    let km = Double(meters) / 1000.0
    return String(format: "approx. %.1f km away", km)
  }
}

#Preview(as: .systemSmall) {
  // Replaced by Widget definition in Task 15
  EmergencyHomeWidgetPlaceholder()
} timeline: {
  StationEntry.preview
  StationEntry.stale
  StationEntry.empty
}

private struct EmergencyHomeWidgetPlaceholder: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "preview-small", provider: StationTimelineProvider()) { entry in
      HomeSmallView(entry: entry)
    }
  }
}
```

- [ ] **Step 2: Create HomeMediumView**

Create `app/ios/FireReachWidget/Views/HomeMediumView.swift`:

```swift
import SwiftUI
import WidgetKit
import AppIntents

struct HomeMediumView: View {
  let entry: StationEntry

  var body: some View {
    if let snapshot = entry.snapshot {
      contentView(snapshot: snapshot)
    } else {
      EmptyStateView(family: .systemMedium)
    }
  }

  @ViewBuilder
  private func contentView(snapshot: StationSnapshot) -> some View {
    let station = snapshot.station
    let stale = StaleFormatter.text(fetchedAtISO: snapshot.fetchedAt)

    VStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 6) {
          Image(systemName: "flame.fill")
            .font(.system(size: 16))
            .foregroundStyle(.white)
          Text("FIREREACH")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(.white)
        }
        Spacer(minLength: 0)
        Text(station.name)
          .font(.system(size: 18, weight: .bold))
          .foregroundStyle(.white)
          .lineLimit(2)
        HStack(spacing: 8) {
          Text(distanceLabel(meters: station.distanceMeters))
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(.white.opacity(0.9))
          if let stale {
            Text("· \(stale)")
              .font(.system(size: 12, weight: .regular))
              .foregroundStyle(.white.opacity(0.75))
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 16)
      .padding(.bottom, 8)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

      callBar(station: station)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color("BrandRed"))
  }

  @ViewBuilder
  private func callBar(station: StationSnapshot.Station) -> some View {
    let label = HStack(spacing: 8) {
      Image(systemName: "phone.fill")
        .font(.system(size: 18))
      Text("CALL")
        .font(.system(size: 18, weight: .bold))
    }
    .foregroundStyle(Color("BrandRed"))
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color.white)

    if #available(iOS 17.0, *) {
      Button(intent: CallStationIntent(phone: station.phone)) {
        label
      }
      .buttonStyle(.plain)
      .frame(height: 56)
    } else {
      Link(destination: URL(string: "firereach://call?phone=\(station.phone)")!) {
        label
      }
      .frame(height: 56)
    }
  }

  private func distanceLabel(meters: Int) -> String {
    guard meters > 0 else { return "Distance unavailable" }
    let km = Double(meters) / 1000.0
    return String(format: "approx. %.1f km away", km)
  }
}

#Preview(as: .systemMedium) {
  EmergencyHomeMediumWidgetPlaceholder()
} timeline: {
  StationEntry.preview
  StationEntry.stale
  StationEntry.empty
}

private struct EmergencyHomeMediumWidgetPlaceholder: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "preview-medium", provider: StationTimelineProvider()) { entry in
      HomeMediumView(entry: entry)
    }
  }
}
```

- [ ] **Step 3: Build (will fail until EmptyStateView exists — expected)**

The views reference `EmptyStateView` which we create in Task 14. Skip the build verification for this task; it will pass after Task 14.

- [ ] **Step 4: Commit**

```bash
git add ios/FireReachWidget/Views/HomeSmallView.swift \
        ios/FireReachWidget/Views/HomeMediumView.swift \
        ios/FireReach.xcodeproj/project.pbxproj
git commit -m "feat(widget): add Home Screen small + medium views

Hybrid tap behavior: iOS 17+ uses Button(intent: CallStationIntent) for direct
dial; older iOS falls back to Link(firereach://call?phone=...). Views render
the empty state via EmptyStateView (added in a later task)."
```

---

## Task 13: Lock Screen accessory views

**Files:**
- Create: `app/ios/FireReachWidget/Views/AccessoryRectangularView.swift`
- Create: `app/ios/FireReachWidget/Views/AccessoryCircularView.swift`
- Create: `app/ios/FireReachWidget/Views/AccessoryInlineView.swift`

Lock-Screen accessories always use `Link` (no direct call), even on iOS 17+. See spec rationale.

- [ ] **Step 1: Create AccessoryRectangularView**

Create `app/ios/FireReachWidget/Views/AccessoryRectangularView.swift`:

```swift
import SwiftUI
import WidgetKit

struct AccessoryRectangularView: View {
  let entry: StationEntry

  var body: some View {
    if let snapshot = entry.snapshot {
      let phone = snapshot.station.phone
      Link(destination: URL(string: "firereach://call?phone=\(phone)")!) {
        VStack(alignment: .leading, spacing: 2) {
          Label(snapshot.station.name, systemImage: "flame.fill")
            .font(.system(size: 14, weight: .bold))
            .lineLimit(1)
          Text("\(distanceLabel(meters: snapshot.station.distanceMeters)) · Tap to call")
            .font(.system(size: 12))
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    } else {
      Link(destination: URL(string: "firereach://")!) {
        Label("Set up FireReach", systemImage: "flame.fill")
          .font(.system(size: 14, weight: .bold))
      }
    }
  }

  private func distanceLabel(meters: Int) -> String {
    guard meters > 0 else { return "—" }
    let km = Double(meters) / 1000.0
    return String(format: "%.1f km", km)
  }
}

#Preview(as: .accessoryRectangular) {
  AccessoryRectangularWidgetPlaceholder()
} timeline: {
  StationEntry.preview
  StationEntry.empty
}

private struct AccessoryRectangularWidgetPlaceholder: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "preview-rect", provider: StationTimelineProvider()) { entry in
      AccessoryRectangularView(entry: entry)
    }
  }
}
```

- [ ] **Step 2: Create AccessoryCircularView**

Create `app/ios/FireReachWidget/Views/AccessoryCircularView.swift`:

```swift
import SwiftUI
import WidgetKit

struct AccessoryCircularView: View {
  let entry: StationEntry

  var body: some View {
    let phoneURL: URL = {
      if let snap = entry.snapshot {
        return URL(string: "firereach://call?phone=\(snap.station.phone)")!
      }
      return URL(string: "firereach://")!
    }()

    Link(destination: phoneURL) {
      Image(systemName: "flame.fill")
        .font(.system(size: 22, weight: .bold))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}

#Preview(as: .accessoryCircular) {
  AccessoryCircularWidgetPlaceholder()
} timeline: {
  StationEntry.preview
  StationEntry.empty
}

private struct AccessoryCircularWidgetPlaceholder: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "preview-circ", provider: StationTimelineProvider()) { entry in
      AccessoryCircularView(entry: entry)
    }
  }
}
```

- [ ] **Step 3: Create AccessoryInlineView**

Create `app/ios/FireReachWidget/Views/AccessoryInlineView.swift`:

```swift
import SwiftUI
import WidgetKit

struct AccessoryInlineView: View {
  let entry: StationEntry

  var body: some View {
    if let snap = entry.snapshot {
      Link(destination: URL(string: "firereach://call?phone=\(snap.station.phone)")!) {
        Label("\(snap.station.phone) · \(shortName(snap.station.name)) \(distanceLabel(meters: snap.station.distanceMeters))",
              systemImage: "flame.fill")
      }
    } else {
      Link(destination: URL(string: "firereach://")!) {
        Label("Set up FireReach", systemImage: "flame.fill")
      }
    }
  }

  private func shortName(_ name: String) -> String {
    name.replacingOccurrences(of: " Fire Station", with: "")
  }

  private func distanceLabel(meters: Int) -> String {
    guard meters > 0 else { return "" }
    let km = Double(meters) / 1000.0
    return String(format: "%.1f km", km)
  }
}

#Preview(as: .accessoryInline) {
  AccessoryInlineWidgetPlaceholder()
} timeline: {
  StationEntry.preview
  StationEntry.empty
}

private struct AccessoryInlineWidgetPlaceholder: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "preview-inline", provider: StationTimelineProvider()) { entry in
      AccessoryInlineView(entry: entry)
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add ios/FireReachWidget/Views/AccessoryRectangularView.swift \
        ios/FireReachWidget/Views/AccessoryCircularView.swift \
        ios/FireReachWidget/Views/AccessoryInlineView.swift \
        ios/FireReach.xcodeproj/project.pbxproj
git commit -m "feat(widget): add lock-screen accessory views

All three accessory variants use Link (deep-link to app), not direct dial,
per spec rationale. Empty state shows 'Set up FireReach' across variants."
```

---

## Task 14: EmptyStateView

**Files:**
- Create: `app/ios/FireReachWidget/Views/EmptyStateView.swift`

- [ ] **Step 1: Create the view**

Create `app/ios/FireReachWidget/Views/EmptyStateView.swift`:

```swift
import SwiftUI
import WidgetKit

struct EmptyStateView: View {
  let family: WidgetFamily

  var body: some View {
    Link(destination: URL(string: "firereach://")!) {
      content
    }
  }

  @ViewBuilder
  private var content: some View {
    switch family {
    case .systemSmall:
      smallContent
    case .systemMedium:
      mediumContent
    default:
      smallContent
    }
  }

  private var smallContent: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 4) {
        Image(systemName: "flame.fill")
          .font(.system(size: 11))
          .foregroundStyle(.white)
        Text("FIREREACH")
          .font(.system(size: 9, weight: .bold))
          .foregroundStyle(.white)
      }
      Spacer()
      Text("Open FireReach to find your nearest fire station")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(.white)
      Text("TAP TO OPEN")
        .font(.system(size: 9, weight: .bold))
        .foregroundStyle(.white.opacity(0.85))
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Color("BrandRed"))
  }

  private var mediumContent: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 6) {
        Image(systemName: "flame.fill")
          .font(.system(size: 16))
          .foregroundStyle(.white)
        Text("FIREREACH")
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(.white)
      }
      Spacer()
      Text("Open FireReach to find your nearest fire station")
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(.white)
      Text("TAP TO OPEN")
        .font(.system(size: 10, weight: .bold))
        .foregroundStyle(.white.opacity(0.85))
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Color("BrandRed"))
  }
}
```

- [ ] **Step 2: Build to verify**

```bash
xcodebuild -workspace ios/FireReach.xcworkspace -scheme FireReachWidget \
  -destination 'platform=iOS Simulator,name=iPhone 15' build | tail -10
```

Expected: `** BUILD SUCCEEDED **` (the home views from Task 12 now compile).

- [ ] **Step 3: Commit**

```bash
git add ios/FireReachWidget/Views/EmptyStateView.swift \
        ios/FireReach.xcodeproj/project.pbxproj
git commit -m "feat(widget): add EmptyStateView for cold-install / no-cache state"
```

---

## Task 15: Widget definitions + WidgetBundle entry

**Files:**
- Create: `app/ios/FireReachWidget/Widgets/EmergencyHomeWidget.swift`
- Create: `app/ios/FireReachWidget/Widgets/EmergencyAccessoryWidget.swift`
- Modify (overwrite): `app/ios/FireReachWidget/FireReachWidget.swift`

In Xcode, create the `Widgets/` group with target membership `FireReachWidget`.

- [ ] **Step 1: Create EmergencyHomeWidget**

Create `app/ios/FireReachWidget/Widgets/EmergencyHomeWidget.swift`:

```swift
import WidgetKit
import SwiftUI

struct EmergencyHomeWidget: Widget {
  let kind: String = "EmergencyHomeWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: StationTimelineProvider()) { entry in
      EmergencyHomeWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Nearest Fire Station")
    .description("Quick access to your nearest fire station for emergency calls.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct EmergencyHomeWidgetEntryView: View {
  @Environment(\.widgetFamily) var family
  let entry: StationEntry

  var body: some View {
    switch family {
    case .systemSmall:
      HomeSmallView(entry: entry)
    case .systemMedium:
      HomeMediumView(entry: entry)
    default:
      HomeSmallView(entry: entry)
    }
  }
}
```

- [ ] **Step 2: Create EmergencyAccessoryWidget**

Create `app/ios/FireReachWidget/Widgets/EmergencyAccessoryWidget.swift`:

```swift
import WidgetKit
import SwiftUI

struct EmergencyAccessoryWidget: Widget {
  let kind: String = "EmergencyAccessoryWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: StationTimelineProvider()) { entry in
      EmergencyAccessoryWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("FireReach Lock Screen")
    .description("Glanceable nearest fire station from your Lock Screen.")
    .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
  }
}

struct EmergencyAccessoryWidgetEntryView: View {
  @Environment(\.widgetFamily) var family
  let entry: StationEntry

  var body: some View {
    switch family {
    case .accessoryRectangular:
      AccessoryRectangularView(entry: entry)
    case .accessoryCircular:
      AccessoryCircularView(entry: entry)
    case .accessoryInline:
      AccessoryInlineView(entry: entry)
    default:
      AccessoryRectangularView(entry: entry)
    }
  }
}
```

- [ ] **Step 3: Overwrite the auto-generated FireReachWidget.swift**

Overwrite `app/ios/FireReachWidget/FireReachWidget.swift`:

```swift
import WidgetKit
import SwiftUI

@main
struct FireReachWidgetBundle: WidgetBundle {
  var body: some Widget {
    EmergencyHomeWidget()
    EmergencyAccessoryWidget()
  }
}
```

- [ ] **Step 4: Build**

```bash
xcodebuild -workspace ios/FireReach.xcworkspace -scheme FireReachWidget \
  -destination 'platform=iOS Simulator,name=iPhone 15' build | tail -10
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Run the full app and verify the new widget appears in the gallery**

```bash
npm run ios
```

Then in the simulator:
1. Long-press an empty Home Screen area → tap "+" → search "FireReach"
2. Two FireReach entries should appear: the old one (`Emergency`) from `ExpoWidgetsTarget` and the new one (`Nearest Fire Station`).
3. Add the new "Nearest Fire Station" small widget.
4. Open the FireReach app, grant location → return to home.
5. Within ~5 seconds the new widget should show "Accra Central Fire Station, ~2.4 km away".

Expected: rendered correctly. If it shows the empty state, force-quit the app and re-open to ensure `useNearestStation` runs and writes to the App Group.

- [ ] **Step 6: Commit**

```bash
git add ios/FireReachWidget/Widgets ios/FireReachWidget/FireReachWidget.swift \
        ios/FireReach.xcodeproj/project.pbxproj
git commit -m "feat(widget): wire up WidgetBundle with home + accessory widgets

Bundle exposes two widgets to the gallery:
- EmergencyHomeWidget (small + medium)
- EmergencyAccessoryWidget (rectangular + circular + inline)

End-to-end pipeline now functional: app writes App Group → widget renders."
```

---

## Task 16: URL scheme + RN deep-link handler

**Files:**
- Modify: `app/ios/FireReach/Info.plist`
- Create: `app/src/lib/deepLinks.ts`
- Modify: `app/App.tsx`

The existing `AppDelegate.swift` already forwards `application(_:open:options:)` to `RCTLinkingManager`, so the URL reaches RN's `Linking` module without code changes.

- [ ] **Step 1: Register the URL scheme**

In `app/ios/FireReach/Info.plist`, add the `CFBundleURLTypes` block. Open the file and add the following inside the top-level `<dict>` (alongside other root-level keys):

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.firereach.app</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>firereach</string>
    </array>
  </dict>
</array>
```

- [ ] **Step 2: Create the deep-link parser**

Create `app/src/lib/deepLinks.ts`:

```typescript
export type ParsedDeepLink =
  | { kind: "call"; phone: string }
  | { kind: "open" }
  | { kind: "unknown" };

export function parseFireReachUrl(url: string): ParsedDeepLink {
  if (!url.startsWith("firereach://")) return { kind: "unknown" };
  const withoutScheme = url.replace("firereach://", "");
  const [path, query = ""] = withoutScheme.split("?");

  if (path === "" || path === "/") return { kind: "open" };

  if (path === "call") {
    const params = new URLSearchParams(query);
    const phone = params.get("phone")?.trim();
    if (phone && phone.length > 0) return { kind: "call", phone };
    return { kind: "open" };
  }

  return { kind: "unknown" };
}
```

- [ ] **Step 3: Wire the handler into App.tsx**

In `app/App.tsx`, add at the top:

```typescript
import { Linking } from "react-native";
import { parseFireReachUrl } from "./src/lib/deepLinks";
```

Inside the App component (or wherever the root mounts), add:

```typescript
React.useEffect(() => {
  const handle = (urlIn: string | null) => {
    if (!urlIn) return;
    const parsed = parseFireReachUrl(urlIn);
    if (parsed.kind === "call") {
      Linking.openURL(`tel:${parsed.phone}`).catch(() => {
        /* swallow — dialer may not be available in simulator */
      });
    }
    // "open" / "unknown" → no extra action; the app is already open.
  };

  Linking.getInitialURL().then(handle);
  const sub = Linking.addEventListener("url", (event) => handle(event.url));
  return () => sub.remove();
}, []);
```

(If `App.tsx` doesn't already import React, add `import React from "react";`.)

- [ ] **Step 4: Manual verification — iOS 17+ simulator (direct call path)**

```bash
npm run ios
```

In the simulator with the new widget added:
- iOS 17+ simulator: tap CALL bar → dialer opens directly with the station number.
- Verify by inspecting the simulator's phone screen (it doesn't actually dial in simulator, but you'll see the dialer attempt).

- [ ] **Step 5: Manual verification — deep-link path**

From a terminal:

```bash
xcrun simctl openurl booted "firereach://call?phone=192"
```

Expected: FireReach app opens, then immediately attempts `tel:192` (dialer). On simulator, `tel:` URLs are silently ignored — the verification is that no error is thrown and the Metro logs (or Xcode console) show no warnings.

To test on a real device set to iOS 16: tap CALL bar on the widget → app opens → dialer launches.

- [ ] **Step 6: Commit**

```bash
git add ios/FireReach/Info.plist src/lib/deepLinks.ts App.tsx
git commit -m "feat(app): register firereach:// URL scheme and call deep-link handler

Adds CFBundleURLTypes for firereach scheme. parseFireReachUrl extracts call
phone numbers and triggers tel: dialer via Linking. Used by widget extension
on iOS 15.1-16.x as the call path; on iOS 17+ Button(intent: CallStationIntent)
opens the same firereach://call URL via OpenURLIntent."
```

---

## Task 17: Manual device matrix verification

No code changes — this is a verification gate before Phase 4.

- [ ] **Step 1: iOS 17+ device — small + medium**

On a physical iOS 17+ device or iOS 17 simulator:
1. Install build, open app, grant location.
2. Add `Nearest Fire Station` widget — small.
3. Tap CALL bar → expect dialer to open directly.
4. Repeat for medium size.

Record any failures in this checklist.

- [ ] **Step 2: iOS 16 device — small + medium**

If a physical iOS 16 device or iOS 16 simulator is available:
1. Install build, open app, grant location.
2. Add small widget.
3. Tap CALL bar → expect FireReach app to open, then dialer.

If no iOS 16 device available, document this gap in the commit.

- [ ] **Step 3: Lock Screen accessories**

On any iOS 16+ device:
1. Lock the device → long-press lock screen → Customize.
2. Add the FireReach `accessoryRectangular` widget.
3. Verify station name renders.
4. Tap → expect device to unlock and FireReach to open at HomeScreen.
5. Repeat for circular and inline variants.

- [ ] **Step 4: Empty state**

1. Reset simulator (`xcrun simctl erase booted`) or uninstall + reinstall on device.
2. Add a Home Screen widget BEFORE opening the app.
3. Expect empty state: "Open FireReach to find your nearest fire station" with TAP TO OPEN footer.
4. Tap → app opens. After cache resolves, widget rebuilds with real station within ~5 s.

- [ ] **Step 5: Stale state**

1. With the widget showing real data, force the device clock forward 3 days (Settings → General → Date & Time).
2. From a terminal: `xcrun simctl reload-widgets` (or wait up to 1h for the timeline to refresh).
3. Expect "updated 3 days ago" footnote on small/medium variants.
4. Restore clock.

- [ ] **Step 6: Document results in a commit (no code change)**

```bash
git commit --allow-empty -m "chore(verify): manual device matrix passes

- iOS 17+ small/medium: direct dial works
- iOS 16 small/medium: deep-link path works (or: untested, no device)
- Lock screen accessories: tap-to-open works
- Empty state: shows correct cold-install CTA
- Stale state: '3 days ago' footnote renders correctly"
```

---

# Phase 4 — Cutover

Goal: remove `expo-widgets`, the TSX widget, and the `ExpoWidgetsTarget`. The new Swift widget is the only one shipped.

## Task 18: Remove ExpoWidgetsTarget from Xcode project

**Files:**
- Modifies: `app/ios/FireReach.xcodeproj/project.pbxproj` (via Xcode UI)
- Deletes: `app/ios/ExpoWidgetsTarget/` (entire directory)

- [ ] **Step 1: Remove the target in Xcode**

```bash
open ios/FireReach.xcworkspace
```

In Xcode:
1. Select the `FireReach` project in the navigator.
2. In the Targets list, right-click `ExpoWidgetsTarget` → Delete → "Move to Trash" (this also removes the embed-extension reference from the main app's "Frameworks, Libraries, and Embedded Content" build phase).
3. Verify the directory `ios/ExpoWidgetsTarget/` was moved to trash. If it remains, delete it from disk:

```bash
rm -rf ios/ExpoWidgetsTarget
```

4. Verify the main app target's "Frameworks, Libraries, and Embedded Content" no longer lists `ExpoWidgetsTarget.appex`. Add only `FireReachWidget.appex` if not already present.

- [ ] **Step 2: Build to verify**

```bash
xcodebuild -workspace ios/FireReach.xcworkspace -scheme FireReach \
  -destination 'platform=iOS Simulator,name=iPhone 15' build | tail -10
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
git add ios/FireReach.xcodeproj/project.pbxproj
git rm -r ios/ExpoWidgetsTarget
git commit -m "build(ios): remove ExpoWidgetsTarget extension

The new FireReachWidget extension fully replaces it. The Live Activity
placeholder was unused (useLiveActivities: false in app.json)."
```

---

## Task 19: Remove expo-widgets dependency, plugin entry, and TSX widget

**Files:**
- Modify: `app/app.json`
- Modify: `app/package.json`
- Delete: `app/widgets/`

- [ ] **Step 1: Remove the plugin entry**

In `app/app.json`, delete the entire `expo-widgets` block from the `plugins` array. The result:

```json
"plugins": []
```

(or remove the whole `plugins` key if it leaves an empty array).

- [ ] **Step 2: Remove the dependency**

```bash
npm uninstall expo-widgets
```

Expected: `expo-widgets` removed from `package.json` and `package-lock.json`.

- [ ] **Step 3: Delete the TSX widget**

```bash
rm -rf widgets/
```

- [ ] **Step 4: Re-run pod install (clears expo-widgets pods)**

```bash
npx pod-install
```

- [ ] **Step 5: Build to verify**

```bash
npm run ios
```

Expected: app launches normally; no compile errors related to expo-widgets.

- [ ] **Step 6: Commit**

```bash
git add app.json package.json package-lock.json ios/Podfile.lock
git rm -r widgets
git commit -m "chore: remove expo-widgets dependency, plugin, and TSX widget

The FireReachWidget Swift extension fully replaces the previous TSX widget.
This commit removes the now-unused expo-widgets npm package, its app.json
plugin entry, and the widgets/ directory containing the old TSX source."
```

---

## Task 20: Re-add-widget banner + version bump + final verification

**Files:**
- Create: `app/src/components/WidgetReAddBanner.tsx`
- Modify: `app/src/screens/HomeScreen.tsx`
- Modify: `app/app.json`

After Phase 4 ships, users with the old widget on their Home Screen will see a placeholder until they re-add the new one. A one-time in-app banner explains this.

- [ ] **Step 1: Create the banner component**

Create `app/src/components/WidgetReAddBanner.tsx`:

```typescript
import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "./ui/Text";

const KEY = "firereach.widgetReAddBanner.dismissed.v1";

export const WidgetReAddBanner: React.FC = () => {
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setShown(v !== "1"));
  }, []);

  const dismiss = () => {
    AsyncStorage.setItem(KEY, "1").then(() => setShown(false));
  };

  if (!shown) return null;

  return (
    <View style={styles.container}>
      <Text variant="caption" weight="medium" color="#FFFFFF">
        Widget updated — re-add it from your Home Screen for direct-call support.
      </Text>
      <TouchableOpacity onPress={dismiss} style={styles.dismiss}>
        <Text variant="label" color="#FFFFFF">DISMISS</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#CC1B1B",
    padding: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dismiss: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
```

- [ ] **Step 2: Mount the banner in HomeScreen**

In `app/src/screens/HomeScreen.tsx`, add the import:

```typescript
import { WidgetReAddBanner } from "../components/WidgetReAddBanner";
```

Inside the `ScrollView`, immediately above the existing connectivity alert, add:

```typescript
        <WidgetReAddBanner />
```

- [ ] **Step 3: Bump app version**

In `app/app.json`, change:

```json
"version": "1.0.0"
```

to:

```json
"version": "1.1.0"
```

- [ ] **Step 4: Final verification**

```bash
npm run ios
```

Expected:
1. App launches.
2. HomeScreen shows the red "Widget updated — re-add it…" banner.
3. Tap DISMISS → banner disappears, does not return on next launch.
4. Add `Nearest Fire Station` widget from the gallery — only one FireReach entry now appears (`ExpoWidgetsTarget`'s "Emergency" widget is gone).
5. Widget renders cached station after first app open.
6. Tap CALL on iOS 17+ → dialer opens directly.

- [ ] **Step 5: Commit**

```bash
git add src/components/WidgetReAddBanner.tsx src/screens/HomeScreen.tsx app.json
git commit -m "feat(app): add widget re-add banner and bump to v1.1.0

Phase 4 ships the new Swift widget and removes the old TSX widget. Users
with the old widget on their Home Screen will see an iOS placeholder until
they add the new widget. The banner is shown once on HomeScreen, dismissable,
and never returns after dismissal."
```

- [ ] **Step 6: Tag the release**

```bash
git tag v1.1.0
```

(Push tag separately when ready to release.)

---

## Self-review summary (executor: skim before starting)

- All 20 tasks have file paths, exact code, and verification commands.
- TDD applied to Swift model code (Task 9). Swift view code uses `#Preview` for development feedback rather than image-snapshot tests, per spec.
- TS code uses TypeScript + manual smoke checks (no Jest setup added).
- Each task ends in a commit; phases are independently revertible.
- Spec sections covered:
  - Architecture & components → Tasks 5–7, 8, 10, 11, 15
  - App Group data schema → Tasks 1 (TS), 9 (Swift)
  - File layout → matches the plan's "target state" tree
  - Widget views per family → Tasks 12, 13, 14
  - Refresh strategy → Task 10 (TimelineProvider 1h cadence) + Task 7 (push reload from RN)
  - Migration & cutover order → Phases 1→2→3→4

## Open items the executor will resolve at implementation time

- **API endpoint for `resolveNearestStation`** (Task 3): currently a hardcoded fallback. Replace with the real endpoint when defined.
- **Exact wording of the re-add banner** (Task 20 Step 1): tweakable per copywriting review.
