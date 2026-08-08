import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  readSavedPlacesResult,
  writeSavedPlaces,
  MAX_SAVED_PLACES,
  type SavedPlace,
} from "../lib/savedPlaces";

/**
 * Every mutation reports the same three outcomes, so no screen has to guess
 * why nothing happened.
 *
 * `"storage"` was added because the alternative was worse than silence: the
 * only failure a screen could previously distinguish was `"full"`, so a
 * device that had run out of space showed "Your saved places are full" — a
 * confident, wrong explanation that sends the user off deleting places that
 * are not the problem. `AddPlaceResult` keeps its name for the callers that
 * import it and is now just this type.
 */
export type MutationResult =
  | { ok: true }
  | { ok: false; reason: "full" | "storage" };
export type AddPlaceResult = MutationResult;

type Ctx = {
  places: SavedPlace[];
  isLoading: boolean;
  /**
   * True when the initial read of storage failed. `places` is then empty
   * because nothing could be recovered, NOT because nothing is saved, and a
   * screen must not tell the user they have no places on the strength of it.
   */
  loadFailed: boolean;
  addPlace: (p: SavedPlace) => Promise<AddPlaceResult>;
  updatePlace: (p: SavedPlace) => Promise<MutationResult>;
  removePlace: (id: string) => Promise<MutationResult>;
};

const SavedPlacesContext = createContext<Ctx | null>(null);

/**
 * One in-memory place list for the whole app, mirroring
 * `NearestStationProvider` in `useNearestStation.tsx`: mounted once in
 * `App.tsx` so navigation cannot create a second instance and two screens
 * cannot disagree about what is saved.
 */
export function SavedPlacesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  /**
   * The authority for what is currently saved, as opposed to `places`, which
   * is whatever the last render captured.
   *
   * Mutations used to close over the `places` snapshot from their render. Two
   * fired before React re-rendered — a double-tapped Save, or two screens
   * sharing this single instance — both computed from the same stale list and
   * the second overwrote the first, losing a place with no error and an
   * `{ok:true}` returned to the caller who lost it. That is the same
   * "the place I just added vanished" symptom the store-level cap fix closed,
   * arriving by a different road. `useNearestStation` solves its own version
   * of this with a ref for the same reason.
   */
  const placesRef = useRef<SavedPlace[]>([]);

  /**
   * Whether `placesRef.current` is known to reflect storage, as opposed to
   * being the `[]` this provider starts life with.
   *
   * Not overwriting the ref on a failed read is only half the guard, and on
   * its own it is no guard at all: at mount the ref is already `[]`, so a
   * failed first read leaves it holding exactly the wrong answer that the
   * failed read would have written. The read-modify-write that follows then
   * saves one place over ten. So mutations refuse to build on a baseline that
   * was never confirmed — they retry the read first, and give up rather than
   * write on top of a list they cannot see.
   */
  const baselineKnown = useRef(false);

  /**
   * Mutations run one at a time. The ref alone is not enough: between reading
   * it and the `await` inside `commit`, another mutation can interleave and
   * both would still race on the write. Chaining serialises them, so each one
   * reads a ref that already reflects its predecessor.
   */
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    // Swallow the predecessor's rejection for sequencing purposes only — the
    // original caller still receives it from its own promise.
    const run = queue.current.catch(() => undefined).then(work);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  /**
   * Pulls storage into the ref and into state. Returns whether the list can
   * now be trusted as a baseline for a write.
   */
  const load = useCallback(async (): Promise<boolean> => {
    const read = await readSavedPlacesResult();
    if (!read.ok) return false;
    placesRef.current = read.places;
    setPlaces(read.places);
    baselineKnown.current = true;
    setLoadFailed(false);
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const read = await readSavedPlacesResult();
      if (cancelled) return;
      // On a failed read `places` stays empty — there is nothing to show —
      // but the ref is left alone and `loadFailed` says why it is empty, so
      // no screen claims the user has saved nothing and no write treats the
      // emptiness as fact.
      if (read.ok) {
        placesRef.current = read.places;
        setPlaces(read.places);
        baselineKnown.current = true;
      }
      setLoadFailed(!read.ok);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Write-through, then set state from what was read back, so what the screen
   * shows is what is on disk rather than what we hoped to put there. No slice
   * here: writeSavedPlaces caps to the NEWEST entries, and a front-slice at
   * this layer would reintroduce exactly the bug that fix removed.
   *
   * Returns a result instead of rejecting. A rejected `setItem` used to
   * propagate out through `commit` and `addPlace` to a screen that had set a
   * busy flag and never cleared it, leaving Save spinning and disabled for
   * the rest of the session. `placesRef.current` is untouched on failure, so
   * the next attempt still starts from the last list we know landed.
   */
  const commit = useCallback(async (next: SavedPlace[]): Promise<MutationResult> => {
    try {
      await writeSavedPlaces(next);
    } catch (err) {
      console.warn("[useSavedPlaces] write failed", err);
      return { ok: false, reason: "storage" };
    }

    const fresh = await readSavedPlacesResult();
    if (!fresh.ok) {
      // The write landed and the read-back did not. `next` is the closest
      // honest account of what is on disk — blanking the list to the `[]`
      // that a failed read carries would hide places that are saved.
      placesRef.current = next;
      setPlaces(next);
      return { ok: true };
    }

    placesRef.current = fresh.places;
    setPlaces(fresh.places);
    baselineKnown.current = true;
    setLoadFailed(false);
    return { ok: true };
  }, []);

  /** Every mutation runs this first: never write on top of an unread list. */
  const withBaseline = useCallback(
    async (work: () => Promise<MutationResult>): Promise<MutationResult> => {
      if (!baselineKnown.current && !(await load())) {
        return { ok: false, reason: "storage" };
      }
      return work();
    },
    [load]
  );

  // Refuses rather than truncates: writeSavedPlaces would silently keep this
  // place and drop an old one instead, which is the right call when reading
  // a possibly-stale file, but the wrong one here, where we know exactly why
  // the list is full and can hand the caller a result instead of a surprise.
  const addPlace = useCallback(
    (p: SavedPlace): Promise<AddPlaceResult> =>
      enqueue(() =>
        withBaseline(async () => {
          if (placesRef.current.length >= MAX_SAVED_PLACES) {
            return { ok: false, reason: "full" };
          }
          return commit([...placesRef.current, p]);
        })
      ),
    [commit, enqueue, withBaseline]
  );
  const updatePlace = useCallback(
    (p: SavedPlace): Promise<MutationResult> =>
      enqueue(() =>
        withBaseline(() =>
          commit(placesRef.current.map((x) => (x.id === p.id ? p : x)))
        )
      ),
    [commit, enqueue, withBaseline]
  );
  const removePlace = useCallback(
    (id: string): Promise<MutationResult> =>
      enqueue(() =>
        withBaseline(() =>
          commit(placesRef.current.filter((x) => x.id !== id))
        )
      ),
    [commit, enqueue, withBaseline]
  );

  return (
    <SavedPlacesContext.Provider
      value={{ places, isLoading, loadFailed, addPlace, updatePlace, removePlace }}
    >
      {children}
    </SavedPlacesContext.Provider>
  );
}

export function useSavedPlaces(): Ctx {
  const ctx = useContext(SavedPlacesContext);
  if (!ctx) {
    throw new Error(
      "useSavedPlaces must be used within a <SavedPlacesProvider>. " +
        "Wrap the app (see App.tsx) so every screen reads the same saved places."
    );
  }
  return ctx;
}
