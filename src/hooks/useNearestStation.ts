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
  }, [snapshot]);

  // Refresh on first mount (after cache load)
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { snapshot, isResolving, hasError, refresh };
}
