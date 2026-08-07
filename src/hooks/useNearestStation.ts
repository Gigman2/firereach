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
