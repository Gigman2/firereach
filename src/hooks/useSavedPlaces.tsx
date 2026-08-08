import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  readSavedPlaces,
  writeSavedPlaces,
  MAX_SAVED_PLACES,
  type SavedPlace,
} from "../lib/savedPlaces";

type Ctx = {
  places: SavedPlace[];
  isLoading: boolean;
  addPlace: (p: SavedPlace) => Promise<void>;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await readSavedPlaces();
      if (cancelled) return;
      setPlaces(loaded);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Write-through, then set state from what was written, so what the screen
  // shows is what is on disk rather than what we hoped to put there.
  const commit = useCallback(async (next: SavedPlace[]) => {
    const capped = next.slice(0, MAX_SAVED_PLACES);
    await writeSavedPlaces(capped);
    setPlaces(await readSavedPlaces());
  }, []);

  const addPlace = useCallback(
    async (p: SavedPlace) => commit([...places, p]),
    [places, commit]
  );
  const updatePlace = useCallback(
    async (p: SavedPlace) => commit(places.map((x) => (x.id === p.id ? p : x))),
    [places, commit]
  );
  const removePlace = useCallback(
    async (id: string) => commit(places.filter((x) => x.id !== id)),
    [places, commit]
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
