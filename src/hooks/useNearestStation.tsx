import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
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
/**
 * Metres. A coarser last-known fix is ignored in favour of a live one.
 * Tightened from 5000: the three closest bundled station pairs are 826 m,
 * 1320 m and 2126 m apart, and three stations sit within 5 km of Abelemkpe,
 * so a 5 km-accurate cell-tower fix can name the wrong one of several close
 * candidates in exactly the dense urban areas most calls come from. 2000 m
 * still admits instant GPS/wifi fixes; nothing is lost by rejecting coarser
 * ones now that an unbounded last-known tier exists below as a final resort.
 */
const MAX_LAST_KNOWN_ACCURACY_M = 2000;
/** Cold GPS on a low-end device can never lock. Settle rather than hang. */
const POSITION_TIMEOUT_MS = 6000;
/**
 * Bounds the whole of `resolvePosition()`, not just the GPS call inside it.
 * Permission-check/-request calls can throw on OEM quirks, or a dismissed
 * system dialog can simply never settle; either way this must not be able to
 * stall the network refresh that follows it.
 */
const POSITION_RESOLUTION_TIMEOUT_MS = 15000;
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
/**
 * `lastKnownStale` is an unbounded last-known fix — used only once a live fix
 * has failed, or retained from an earlier resolution that a later one could
 * not replace — and is distinct from `lastKnown` so the UI can be honest
 * about how stale the answer might be. `implausible` means we have a fix, but
 * it puts the user nowhere near Ghana.
 *
 * `denied` and `unavailable` are deliberately separate. Conflating them into
 * a single "none" made the app tell a user who had *already granted*
 * permission, and whose GPS simply could not lock indoors, to "turn on
 * location" — advice that is both wrong and unactionable. Permission not
 * granted is a thing the user can fix; no fix obtainable is not.
 *
 * `denied` means "not granted", which covers both a refusal and a permission
 * that has never been asked for — this provider checks but never prompts, so
 * it cannot tell those apart, and does not need to. Both are answered by the
 * same UI ("turn on location") and by the same two places that do prompt:
 * onboarding's LocationRequestScreen and the Location row in Settings.
 */
export type PositionSource =
  | "live"
  | "lastKnown"
  | "lastKnownStale"
  | "denied"
  | "unavailable"
  | "implausible";

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
 * Best available position, tried in three tiers. A bounded last-known fix is
 * preferred because it is instant; a live fix is raced against a timeout so
 * a device that can never lock still settles instead of hanging; and only
 * once both of those fail, an *unbounded* last-known fix is tried as a last
 * resort. That third tier is what makes the most common offline cold start —
 * indoors, no wifi, last fix older than 10 minutes, GPS unable to lock
 * within `POSITION_TIMEOUT_MS` with no network assist — still able to answer
 * with a station instead of nothing. An arbitrarily old fix would normally
 * be unsafe (a days-old fix from hundreds of kilometres away could be
 * mistaken for current), but it is safe here specifically because the
 * caller applies `MAX_PLAUSIBLE_DISTANCE_METERS` to whatever this returns:
 * anything that ranks nowhere near Ghana is reported as `"implausible"`
 * rather than acted on. Without that downstream guard, this tier would
 * reintroduce the original unbounded-fix defect.
 */
async function resolvePosition(): Promise<{
  position: ResolvedPosition | null;
  source: PositionSource;
}> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== "granted") {
    // Check only, never prompt. This provider mounts at the app root, before
    // onboarding has had a chance to explain why location is needed, and an
    // uncontextualised dialog that the user dismisses leaves them unable to
    // grant permission from anywhere in the app. LocationRequestScreen is the
    // only place a prompt may appear.
    return { position: null, source: "denied" };
  }

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

  // Last resort: no bound on age or accuracy. See the function doc comment
  // for why that is safe here — the plausibility guard downstream, not this
  // function, is what makes it safe.
  const stale = await Location.getLastKnownPositionAsync();
  if (stale) {
    return {
      position: { lat: stale.coords.latitude, lng: stale.coords.longitude },
      source: "lastKnownStale",
    };
  }

  // Permitted, but no tier produced a fix. Distinct from `denied`: there is
  // nothing for the user to switch on.
  return { position: null, source: "unavailable" };
}

function isStale(table: StationTable): boolean {
  if (!table.refreshedAt) return true;
  const age = Date.now() - Date.parse(table.refreshedAt);
  // A negative age means the device clock moved backwards. Treat it as stale
  // rather than trusting a timestamp from the future.
  return Number.isNaN(age) || age < 0 || age > REFRESH_INTERVAL_MS;
}

/**
 * One resolution for the whole app.
 *
 * This state was previously a plain hook, which meant every screen that
 * called it got its own GPS resolution, its own full-table fetch, and its own
 * `inFlight` ref that deduped nothing across screens. Two tabs could
 * therefore hold two different positions and name two *different* nearest
 * stations at the same time. There is exactly one caller and exactly one
 * emergency, so there is exactly one answer: it lives here.
 */
const NearestStationContext = createContext<NearestStationState | null>(null);

export function NearestStationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [table, setTable] = useState<StationTable>(bundledTable);
  const [position, setPosition] = useState<ResolvedPosition | null>(null);
  // Not "denied": nothing has been refused yet. Before the first resolution
  // settles there simply is no fix, and `isResolving` — true from the first
  // render, because the mount effect below always starts a resolution — is
  // what the UI uses to say "finding your location" rather than accusing the
  // user of having location switched off.
  const [positionSource, setPositionSource] =
    useState<PositionSource>("unavailable");
  const [isResolving, setIsResolving] = useState(true);
  const [hasError, setHasError] = useState(false);
  const inFlight = useRef(false);

  // Mirrors `position` synchronously. `refresh` is a `useCallback` with `[]`
  // deps, so its closed-over `position` is frozen at `null` forever — the ref
  // is what lets the "keep the last good fix" guard below see the latest
  // value instead of that frozen one.
  const positionRef = useRef<ResolvedPosition | null>(null);

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
      //    so being offline changes nothing about this step. Bounded as a
      //    whole (not just the GPS call inside it) so a throw from the
      //    permissions API, or a system dialog that never settles on some
      //    OEMs, degrades to "no position" instead of aborting the network
      //    refresh in step 3 or latching `inFlight` forever.
      const resolved = await withTimeout(
        resolvePosition(),
        POSITION_RESOLUTION_TIMEOUT_MS
      ).then(
        (r) => r ?? { position: null, source: "unavailable" as PositionSource }
      );

      if (resolved.position) {
        // A real fix always wins and becomes the new answer.
        positionRef.current = resolved.position;
        setPosition(resolved.position);
        setPositionSource(resolved.source);
      } else if (!positionRef.current) {
        // No fix now, and none before — report honestly. There is nothing
        // to protect: the visible answer was already "no position".
        setPositionSource(resolved.source);
      } else {
        // Had a fix, lost it this round. Keep the position — a slightly old
        // position still names a real nearby station, and a lost GPS lock
        // must not blank out an answer already on screen — but stop claiming
        // it is current. Whatever it was when obtained, what it is *now* is a
        // last-known fix of unknown age, and reporting it as `live` kept the
        // status pill green over a position that was quietly ageing. This is
        // also what makes the stale-position warning fire in both screens.
        setPositionSource("lastKnownStale");
      }

      // 3. Network refresh, strictly an upgrade of the inputs. Never gates
      //    the answer. Both expo-network fields are optional; if neither is
      //    reported, fail OPEN and let the request timeout decide.
      const netState = await Network.getNetworkStateAsync();
      const online =
        netState.isInternetReachable ?? netState.isConnected ?? true;
      if (!online || !isStale(localTable)) return;

      const fresh = await fetchAllStations();
      if (fresh.length === 0) return; // Never replace real data with nothing.

      // A response far smaller than the table shipped in the binary is a
      // degraded server — a partially-seeded database, a half-finished
      // migration, a filter regression — not a legitimate shrink. Accepting
      // it would both replace the in-memory table and persist over good data
      // on disk, permanently shadowing the bundled table with a crippled one.
      // A degraded response is a failed refresh, and a failed refresh must
      // never overwrite good cached data.
      //
      // Reject a response far smaller than what we already trust. Measured
      // against whichever is larger — the bundled table or the current cache —
      // so the floor can neither ratchet downward as bad responses land, nor
      // fall behind a dataset that has legitimately grown.
      //
      // Against the cache alone it ratcheted: 57 accepted 29, which accepted
      // 15, then 8, then 4, then 1, each bad response lowering the bar for the
      // next. Against the bundled count alone it would freeze: a table grown
      // to 200 would still accept a 40-station response, because 40 clears
      // half of 57. And 0.8 rather than 0.5 because half was never a
      // meaningful bar — a response holding 30 of 57 stations has dropped 27,
      // any one of which may be the caller's nearest, and accepting it also
      // stamps `refreshedAt`, which pins the crippled table for the full
      // 24-hour refresh interval.
      const bundledCount = bundledTable().stations.length;
      const cachedCount = localTable.stations.length;
      const floor = 0.8 * Math.max(bundledCount, cachedCount);
      if (fresh.length < floor) {
        console.warn(
          `[useNearestStation] refresh returned ${fresh.length} stations, ` +
            `below the floor of ${floor} (80% of ${Math.max(
              bundledCount,
              cachedCount
            )}: ${bundledCount} bundled with the app, ${cachedCount} ` +
            `currently cached) — response ignored as degraded`
        );
        return;
      }

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

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      // Re-resolve on foreground. A user who travelled while the app was
      // backgrounded would otherwise keep seeing the station nearest to where
      // they launched it, under a healthy-looking status.
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

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

  const value: NearestStationState = {
    nearest: ranked[0] ?? null,
    alternatives: ranked.slice(1),
    table,
    position,
    positionSource: implausible ? "implausible" : positionSource,
    isResolving,
    hasError,
    refresh,
  };

  return (
    <NearestStationContext.Provider value={value}>
      {children}
    </NearestStationContext.Provider>
  );
}

/**
 * The single shared resolution. Shape is unchanged from when this was a
 * standalone hook, so call sites are untouched — but every caller now reads
 * the same answer.
 */
export function useNearestStation(): NearestStationState {
  const value = useContext(NearestStationContext);
  if (!value) {
    throw new Error(
      "useNearestStation must be used within a <NearestStationProvider>. " +
        "Wrap the app (see App.tsx) so every screen reads one shared position."
    );
  }
  return value;
}
