import AsyncStorage from "@react-native-async-storage/async-storage";

export const SAVED_PLACES_VERSION = 1 as const;
export const SAVED_PLACES_KEY = "@firereach_saved_places";

/** Enough for a real life, small enough that the nearest-place scan is free. */
export const MAX_SAVED_PLACES = 10;

export const RADIUS_PRESETS = [100, 300, 1000, 2000] as const;
export const DEFAULT_RADIUS_METERS = 300;

/**
 * Cap on what the label inputs accept. The label is read aloud as a whole
 * sentence — "I'm at Mum's house." — so it wants to be a name, not a
 * paragraph. Not enforced on read: a longer label already on disk is the
 * user's own word for a place and truncating it would change what they say.
 */
export const MAX_LABEL_LENGTH = 24;

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
    // A blank label is not a place, it is the sentence "I'm at ." read to a
    // dispatcher. Both editors now require one, so this only ever catches a
    // file that was written before they did or corrupted since.
    typeof q.label === "string" &&
    q.label.trim().length > 0 &&
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
    // Trimmed here rather than at each input, so "Home " and "Home" cannot
    // become two entries and the spoken line never carries stray whitespace.
    label: p.label.trim(),
    note: typeof p.note === "string" ? p.note : "",
    radiusMeters:
      Number.isFinite(p.radiusMeters) && p.radiusMeters > 0
        ? p.radiusMeters
        : DEFAULT_RADIUS_METERS,
  };
}

/**
 * What `readSavedPlacesResult` returns. `ok` is the distinction the plain
 * array form cannot carry: whether `places` is *what is saved* or merely
 * *what we could recover*.
 */
export type SavedPlacesRead = { ok: boolean; places: SavedPlace[] };

/**
 * The full read: never throws and never rejects, but says whether it worked.
 *
 * `readSavedPlaces` collapses "there is nothing saved" and "storage would not
 * answer" into the same empty array, and anything performing a
 * read-modify-write on that array turns one transient `getItem` rejection
 * into permanent data loss — read fails, list looks empty, one `addPlace`
 * later the file holds a single place where ten used to be. Callers that go
 * on to *write* must use this form and leave their idea of the list alone
 * when `ok` is false.
 *
 * `ok: false` covers a rejecting `getItem` and unparseable JSON — storage
 * spoke but not in a language we know. A version mismatch or a non-array
 * payload is `ok: true` with nothing recovered: that file is genuinely not a
 * place list this build can carry forward, and it is the migration path's job
 * to replace it, not a reason to freeze writes forever.
 */
export async function readSavedPlacesResult(): Promise<SavedPlacesRead> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
    if (!raw) return { ok: true, places: [] };
    const parsed = JSON.parse(raw) as SavedPlacesFile;
    if (parsed?.schemaVersion !== SAVED_PLACES_VERSION) {
      return { ok: true, places: [] };
    }
    if (!Array.isArray(parsed.places)) return { ok: true, places: [] };
    return {
      ok: true,
      places: parsed.places
        .filter(usable)
        .slice(0, MAX_SAVED_PLACES)
        .map(sanitize),
    };
  } catch {
    return { ok: false, places: [] };
  }
}

/**
 * Never throws and never rejects. A place list that cannot be read is an empty
 * list: the card falls back to district and bearing, which is a degraded
 * answer rather than a crash on the screen someone opens during a fire.
 *
 * Read-only callers should keep using this. Anything that writes back what it
 * read wants `readSavedPlacesResult` instead — see the note there.
 */
export async function readSavedPlaces(): Promise<SavedPlace[]> {
  return (await readSavedPlacesResult()).places;
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
