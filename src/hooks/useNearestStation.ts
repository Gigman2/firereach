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
