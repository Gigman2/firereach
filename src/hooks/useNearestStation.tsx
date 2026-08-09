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
import {
  readStationSnapshot,
  writeStationSnapshot,
  type StationSnapshot,
} from "../lib/stationSnapshot";

/**
 * A last-known fix older than this is not trusted to pick a station.
 *
 * Exported so LocationRequestScreen, which takes a fix of its own right after
 * the permission grant, applies the same definition of "recent enough" rather
 * than inventing a second one that could drift from this.
 */
export const MAX_LAST_KNOWN_AGE_MS = 10 * 60 * 1000;
/**
 * Metres. A coarser last-known fix is ignored in favour of a live one.
 * Tightened from 5000: the three closest bundled station pairs are 826 m,
 * 1320 m and 2126 m apart, and three stations sit within 5 km of Abelemkpe,
 * so a 5 km-accurate cell-tower fix can name the wrong one of several close
 * candidates in exactly the dense urban areas most calls come from. 2000 m
 * still admits instant GPS/wifi fixes; nothing is lost by rejecting coarser
 * ones now that an unbounded last-known tier exists below as a final resort.
 */
export const MAX_LAST_KNOWN_ACCURACY_M = 2000;
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

/**
 * What the station answer rests on — deliberately separate from
 * `PositionSource`, which describes only where a *measurement* came from.
 *
 * These were one fact for as long as stations were ranked from `position` and
 * nothing else, and that conflation is what made a single bad fix wipe out the
 * whole answer: lose the measurement, lose the station. They are two questions
 * — "where is this phone" and "who should this person call" — and only the
 * first of them needs a live fix to answer.
 *
 *  - `live`     — ranked from a position this session actually measured.
 *  - `snapshot` — ranked from where stations were last ranked successfully,
 *                 remembered across launches. See `stationSnapshot.ts`.
 *  - `none`     — nothing to rank from. 192 and nothing else.
 *
 * Both are measurements; the list is ordered by how recent, not by kind. A
 * saved place is deliberately NOT among them. It is a declaration about where
 * the caller is, and it answers a different question — what to say on the call
 * — through `whatToSay` and `WhatToSayCard`. Ranking stations from one would
 * let a guess ("they are probably at Home") outrank a real fix taken an hour
 * ago somewhere else, which is the wrong way round, and would put a station on
 * screen chosen by an assumption the caller was never asked to confirm.
 */
export type StationOrigin = "live" | "snapshot" | "none";

export type NearestStationState = {
  nearest: RankedStation | null;
  /** The next-nearest stations, for "other stations near you". */
  alternatives: RankedStation[];
  table: StationTable;
  position: ResolvedPosition | null;
  positionSource: PositionSource;
  stationOrigin: StationOrigin;
  /** When the snapshot was taken (ISO), when `stationOrigin` is `snapshot`. */
  stationsRankedAt: string | null;
  /**
   * The coordinates `nearest` and `alternatives` were actually ranked from,
   * whatever the origin. The one thing a screen needs to show its own
   * distances without re-deriving the precedence below and drifting from it.
   * Null only when nothing could be ranked at all.
   */
  rankFrom: ResolvedPosition | null;
  isResolving: boolean;
  hasError: boolean;
  refresh: () => Promise<void>;
};

/**
 * Resolves to `null` on timeout or rejection, never rejects. Exported for
 * LocationRequestScreen's own post-grant fix attempt, so both bound their
 * location calls the same way.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
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

/**
 * Whether a candidate fix is close enough to a known station to be worth
 * believing, by the same `MAX_PLAUSIBLE_DISTANCE_METERS` rule the render-time
 * guard applies to whatever position is being displayed.
 *
 * Used to decide whether to *accept* a fix, not merely how to present one. A
 * fix that puts the nearest station on another continent is worse evidence
 * than no fix at all, and `refresh` already declines to let "no fix" overwrite
 * a good position — so it must not let this overwrite one either.
 *
 * An empty table cannot refute anything, so it does not: with nothing to rank
 * against, the fix is accepted and the render-time guard (which also requires
 * a ranked station before declaring anything implausible) stays the single
 * place that decides what the user is told.
 */
function isPlausibleFix(
  position: ResolvedPosition,
  table: StationTable
): boolean {
  const ranked = nearestStations<CachedStation>(
    table.stations,
    position.lat,
    position.lng,
    1
  );
  if (ranked.length === 0) return true;
  return ranked[0].distanceMeters <= MAX_PLAUSIBLE_DISTANCE_METERS;
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

  // Read once on mount, below. Null until that read settles, and null again
  // for good once it comes back empty or expired.
  const [snapshot, setSnapshot] = useState<StationSnapshot | null>(null);

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

      // A real fix wins — but only a believable one. This used to accept any
      // fix at all, on the grounds that a real reading beats a remembered
      // one, and the plausibility rule was applied a hundred lines later at
      // render. That ordering meant a single garbage reading destroyed a good
      // position before anything had judged it: the guard below would decline
      // to let a *missing* fix blank out the answer on screen, while a fix
      // claiming the user was on another continent replaced it unchallenged.
      // The absurd reading is the weaker evidence of the two, so it is now
      // held to the same bar before it is allowed to overwrite anything.
      const usable =
        resolved.position && isPlausibleFix(resolved.position, localTable)
          ? resolved.position
          : null;

      if (usable) {
        positionRef.current = usable;
        setPosition(usable);
        setPositionSource(resolved.source);

        // Remember where this ranking was taken, for launches that cannot
        // produce a fix of their own. `isPlausibleFix` has already established
        // that this position ranks near a real station, which is the only
        // property the snapshot needs of the coordinates themselves.
        //
        // But only from a fix of KNOWN age. `lastKnownStale` is the unbounded
        // tier — it may be days and a city old — and stamping it with
        // `rankedAt: now` would relabel that as current. Worse, it would do so
        // on every foreground, so a phone that can never lock would refresh
        // its own expiry forever and SNAPSHOT_MAX_AGE_MS would never once
        // bite. The two tiers admitted here are bounded by construction: a
        // live fix is from seconds ago, and `lastKnown` by
        // MAX_LAST_KNOWN_AGE_MS.
        //
        // Deliberately not awaited — the answer is already on screen and a
        // write that has not landed yet must not hold up the network refresh
        // below. `writeStationSnapshot` swallows its own failures.
        if (resolved.source === "live" || resolved.source === "lastKnown") {
          void writeStationSnapshot(usable);
        }
      } else if (!positionRef.current) {
        // No usable fix now, and none before — report honestly. There is
        // nothing to protect: the visible answer was already "no position".
        //
        // An implausible fix is still stored here, with no earlier position
        // to prefer over it, so the render-time guard can distinguish "your
        // phone put you outside the country" from "your phone has no idea
        // where you are". Those read very differently to someone deciding
        // what to tell an operator, and this is the only branch where the
        // difference survives.
        if (resolved.position) {
          positionRef.current = resolved.position;
          setPosition(resolved.position);
        }
        setPositionSource(resolved.source);
      } else {
        // Had a usable fix, and this round produced none — either no fix at
        // all, or one rejected as implausible above. Both mean the same thing
        // here: what we hold is the best evidence available. Keep the
        // position — a slightly old position still names a real nearby
        // station, and neither a lost GPS lock nor one bad reading must blank
        // out an answer already on screen — but stop claiming
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

  // Read alongside the first resolution rather than after it. The whole point
  // of the snapshot is the cold start where no fix is coming, and waiting for
  // that resolution to fail — up to POSITION_RESOLUTION_TIMEOUT_MS — before
  // even looking would leave the screen empty for the entire wait.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await readStationSnapshot();
      if (cancelled) return;
      setSnapshot(stored);
    })();
    return () => {
      cancelled = true;
    };
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

  // Derived, never assigned — recomputed whenever the table, the position,
  // the saved places or the snapshot change, so a station never goes stale
  // behind the inputs it was built from.
  const rankAround = (from: ResolvedPosition): RankedStation[] =>
    nearestStations<CachedStation>(table.stations, from.lat, from.lng, 3);

  // A ranking whose own nearest station is beyond Ghana's extent is not an
  // answer, whichever input produced it. Applied to the fallbacks too: a place
  // saved while the caller was abroad would otherwise be presented with all
  // the confidence of one saved at home.
  const tooFar = (r: RankedStation[]) =>
    r.length > 0 && r[0].distanceMeters > MAX_PLAUSIBLE_DISTANCE_METERS;

  const liveRanked = position ? rankAround(position) : [];

  // Unchanged in meaning and still the thing that makes `positionSource`
  // report "implausible": this is a statement about the *fix*, and it stays
  // true and visible even when a fallback below goes on to supply a station.
  const implausible = tooFar(liveRanked);

  /**
   * Which input the station answer is built from. Most recent measurement
   * first; the first one that ranks to a real station wins.
   *
   *  1. The live fix. Nothing beats a measurement taken just now.
   *  2. The remembered ranking position — the last place a bounded-age fix
   *     put us. The only one of the two that survives a cold start, and so
   *     the only thing that can answer on a launch where no fix is coming.
   *
   * Saved places are not on this list, on purpose. See `StationOrigin`.
   */
  type Answer = {
    origin: StationOrigin;
    from: ResolvedPosition | null;
    ranked: RankedStation[];
    rankedAt: string | null;
  };

  const candidates: Answer[] = [];

  if (position && !implausible && liveRanked.length > 0) {
    candidates.push({
      origin: "live",
      from: position,
      ranked: liveRanked,
      rankedAt: null,
    });
  }

  if (snapshot) {
    const r = rankAround(snapshot.from);
    if (r.length > 0 && !tooFar(r)) {
      candidates.push({
        origin: "snapshot",
        from: snapshot.from,
        ranked: r,
        rankedAt: snapshot.rankedAt,
      });
    }
  }

  const answer: Answer = candidates[0] ?? {
    origin: "none",
    from: null,
    ranked: [],
    rankedAt: null,
  };

  const value: NearestStationState = {
    nearest: answer.ranked[0] ?? null,
    alternatives: answer.ranked.slice(1),
    table,
    position,
    positionSource: implausible ? "implausible" : positionSource,
    stationOrigin: answer.origin,
    stationsRankedAt: answer.rankedAt,
    rankFrom: answer.from,
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
