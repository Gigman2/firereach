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
  phone: NATIONAL_EMERGENCY_PHONE,
};

function fallbackSnapshot(): StationSnapshot {
  return {
    schemaVersion: STATION_CACHE_VERSION,
    fetchedAt: new Date().toISOString(),
    userLocation: { lat: 0, lng: 0 },
    station: FALLBACK_STATION,
  };
}

export function useNearestStation(): NearestStationState {
  const [snapshot, setSnapshot] = useState<StationSnapshot | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const inFlight = useRef(false);

  // Mirrors `snapshot` synchronously. `refresh` reads this instead of the
  // `snapshot` state value so its `!snapshotRef.current` guards always see
  // the latest data — not whatever was in scope when the callback was
  // created. That matters because the mount effect below captures `refresh`
  // once with an empty dependency array; without the ref, that callback's
  // closed-over `snapshot` would be frozen at its initial value (`null`)
  // forever, making every "keep cached data" guard permanently true-as-empty.
  const snapshotRef = useRef<StationSnapshot | null>(null);

  const applySnapshot = useCallback((s: StationSnapshot) => {
    snapshotRef.current = s;
    setSnapshot(s);
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    setIsResolving(true);
    setHasError(false);

    try {
      // Set the guard as the first thing inside `try` (not before it) so a
      // throw from the `setState` calls above can never leave it stuck
      // `true` without a matching `finally` to reset it.
      inFlight.current = true;

      const { status } = await Location.getForegroundPermissionsAsync();
      let granted = status === "granted";
      if (!granted) {
        const ask = await Location.requestForegroundPermissionsAsync();
        granted = ask.status === "granted";
      }
      if (!granted) {
        // Fall back to last-known cache (already in state) and the national
        // emergency contact if there is no cache. State only — deliberately
        // never persisted. Persisting it would let a fallback permanently
        // overwrite a real cached station; if there's still no data next
        // launch, this regenerates for free. Do not add writeStationCache
        // here.
        if (!snapshotRef.current) {
          applySnapshot(fallbackSnapshot());
        }
        return;
      }

      // Offline: the cached snapshot is the best available answer, and there
      // is no point burning the full request timeout to rediscover that.
      // Both fields are optional in expo-network's types; if neither is
      // reported, fail OPEN (attempt the request, let the timeout decide)
      // rather than closed — this app exists to hand back a phone number,
      // and silently skipping the fetch on unknown connectivity is worse
      // than a slow failure.
      const netState = await Network.getNetworkStateAsync();
      const online =
        netState.isInternetReachable ?? netState.isConnected ?? true;
      if (!online) {
        // State only — never persisted. See permission-denied branch above.
        if (!snapshotRef.current) {
          applySnapshot(fallbackSnapshot());
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
        // snapshot; otherwise seed the national fallback in state only —
        // never persisted. See permission-denied branch above.
        if (!snapshotRef.current) {
          applySnapshot(fallbackSnapshot());
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

      applySnapshot(fresh);
      await writeStationCache(fresh);
    } catch (err) {
      console.warn("[useNearestStation] refresh failed", err);
      setHasError(true);
      // Keep an existing snapshot — stale data beats no data. But with no cache
      // at all, leaving snapshot null makes the call button inert, so seed the
      // national fallback. Still never persisted: see the early-return branches.
      if (!snapshotRef.current) {
        applySnapshot(fallbackSnapshot());
      }
    } finally {
      inFlight.current = false;
      setIsResolving(false);
    }
  }, [applySnapshot]);

  // Load from cache, then refresh — sequenced in one effect so the cached
  // snapshot (if any) is applied to `snapshotRef`/state before the first
  // `refresh` call runs. This prevents a fallback flash on cold start and
  // ensures `refresh`'s "keep cached data" guards see real cached data
  // immediately, not after a second, later effect fires.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readStationCache();
      if (cancelled) return;
      if (cached) applySnapshot(cached);
      refresh();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { snapshot, isResolving, hasError, refresh };
}
