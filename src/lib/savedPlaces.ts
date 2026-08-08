import AsyncStorage from "@react-native-async-storage/async-storage";

export const SAVED_PLACES_VERSION = 1 as const;
export const SAVED_PLACES_KEY = "@firereach_saved_places";

/** Enough for a real life, small enough that the nearest-place scan is free. */
export const MAX_SAVED_PLACES = 10;

export const RADIUS_PRESETS = [100, 300, 1000, 2000] as const;
export const DEFAULT_RADIUS_METERS = 300;

export type SavedPlace = {
  id: string;
  /** The user's own word for it — "Home", "Shop", "Mum's house". */
  label: string;
  lat: number;
  lng: number;
  /** The user's own landmark sentence, read aloud verbatim. May be empty. */
  note: string;
  /** How close counts as being here. */
  radiusMeters: number;
};

export type SavedPlacesFile = {
  schemaVersion: typeof SAVED_PLACES_VERSION;
  places: SavedPlace[];
};

export function newPlaceId(): string {
  // Enough entropy for a device-local list capped at ten. Not a UUID, and not
  // pretending to be one.
  return `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function usable(p: unknown): p is SavedPlace {
  const q = p as SavedPlace;
  return (
    !!q &&
    typeof q.id === "string" &&
    typeof q.label === "string" &&
    Number.isFinite(q.lat) &&
    Number.isFinite(q.lng) &&
    q.lat >= -90 &&
    q.lat <= 90 &&
    q.lng >= -180 &&
    q.lng <= 180
  );
}

/**
 * Normalises the fields that are optional or easy to corrupt (a missing
 * note, a negative or absent radius) so a place is always valid the moment
 * it is persisted, not just after it happens to pass back through
 * `readSavedPlaces`. Shared by both directions so disk and memory can never
 * disagree about what "valid" means.
 */
function sanitize(p: SavedPlace): SavedPlace {
  return {
    ...p,
    note: typeof p.note === "string" ? p.note : "",
    radiusMeters:
      Number.isFinite(p.radiusMeters) && p.radiusMeters > 0
        ? p.radiusMeters
        : DEFAULT_RADIUS_METERS,
  };
}

/**
 * Never throws and never rejects. A place list that cannot be read is an empty
 * list: the card falls back to district and bearing, which is a degraded
 * answer rather than a crash on the screen someone opens during a fire.
 */
export async function readSavedPlaces(): Promise<SavedPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPlacesFile;
    if (parsed?.schemaVersion !== SAVED_PLACES_VERSION) return [];
    if (!Array.isArray(parsed.places)) return [];
    return parsed.places.filter(usable).slice(0, MAX_SAVED_PLACES).map(sanitize);
  } catch {
    return [];
  }
}

export async function writeSavedPlaces(places: SavedPlace[]): Promise<void> {
  const file: SavedPlacesFile = {
    schemaVersion: SAVED_PLACES_VERSION,
    // Keep the newest entries, not the oldest. The only way to add a place is
    // read-modify-write — read the current list, append the new one, write it
    // back — so a just-added place always sits at the end of the array. A
    // front slice (`slice(0, MAX)`) would silently discard exactly that place
    // the instant the list is full, with no error and nothing for a caller to
    // catch, since this function returns void. Slicing from the back instead
    // guarantees an appended place always survives, and the place that ages
    // out is the oldest one — which is also the behaviour `addPlace` in
    // `useSavedPlaces` now refuses to reach, since it stops the write before
    // the list would grow past `MAX_SAVED_PLACES` in the first place.
    places: places.filter(usable).map(sanitize).slice(-MAX_SAVED_PLACES),
  };
  await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(file));
}
