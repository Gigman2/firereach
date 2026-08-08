import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  readSavedPlaces,
  writeSavedPlaces,
  MAX_SAVED_PLACES,
  type SavedPlace,
} from "../lib/savedPlaces";

export type AddPlaceResult = { ok: true } | { ok: false; reason: "full" };

type Ctx = {
  places: SavedPlace[];
  isLoading: boolean;
  addPlace: (p: SavedPlace) => Promise<AddPlaceResult>;
  updatePlace: (p: SavedPlace) => Promise<void>;
  removePlace: (id: string) => Promise<void>;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await readSavedPlaces();
      if (cancelled) return;
      placesRef.current = loaded;
      setPlaces(loaded);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Write-through, then set state from what was read back, so what the screen
  // shows is what is on disk rather than what we hoped to put there. No slice
  // here: writeSavedPlaces caps to the NEWEST entries, and a front-slice at
  // this layer would reintroduce exactly the bug that fix removed.
  const commit = useCallback(async (next: SavedPlace[]) => {
    await writeSavedPlaces(next);
    const fresh = await readSavedPlaces();
    placesRef.current = fresh;
    setPlaces(fresh);
  }, []);

  // Refuses rather than truncates: writeSavedPlaces would silently keep this
  // place and drop an old one instead, which is the right call when reading
  // a possibly-stale file, but the wrong one here, where we know exactly why
  // the list is full and can hand the caller a result instead of a surprise.
  const addPlace = useCallback(
    (p: SavedPlace): Promise<AddPlaceResult> =>
      enqueue(async () => {
        if (placesRef.current.length >= MAX_SAVED_PLACES) {
          return { ok: false, reason: "full" } as AddPlaceResult;
        }
        await commit([...placesRef.current, p]);
        return { ok: true } as AddPlaceResult;
      }),
    [commit, enqueue]
  );
  const updatePlace = useCallback(
    (p: SavedPlace): Promise<void> =>
      enqueue(async () => {
        await commit(placesRef.current.map((x) => (x.id === p.id ? p : x)));
      }),
    [commit, enqueue]
  );
  const removePlace = useCallback(
    (id: string): Promise<void> =>
      enqueue(async () => {
        await commit(placesRef.current.filter((x) => x.id !== id));
      }),
    [commit, enqueue]
  );

  return (
    <SavedPlacesContext.Provider
      value={{ places, isLoading, addPlace, updatePlace, removePlace }}
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
