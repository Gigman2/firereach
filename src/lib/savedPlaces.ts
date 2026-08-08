import AsyncStorage from "@react-native-async-storage/async-storage";

export const SAVED_PLACES_VERSION = 2 as const;
export const SAVED_PLACES_KEY = "@firereach_saved_places";

/** The version this build still knows how to migrate forward from. */
const SAVED_PLACES_VERSION_V1 = 1 as const;

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

/**
 * Cap on how many landmarks a place carries. A regional operator
 * triangulates off whichever one they happen to recognise, so this is "how
 * many chances to be recognised", not "how much text" — each individual
 * landmark is free text with no length cap of its own.
 */
export const MAX_LANDMARKS = 3;

export type SavedPlace = {
  id: string;
  /** The user's own word for it — "Home", "Shop", "Mum's house". */
  label: string;
  lat: number;
  lng: number;
  /**
   * Up to `MAX_LANDMARKS` of the user's own landmark sentences, read aloud
   * verbatim, one per line, in the order the user entered them. May be
   * empty — a place is still a place with none.
   */
  landmarks: string[];
  /** How close counts as being here. */
  radiusMeters: number;
};

export type SavedPlacesFile = {
  schemaVersion: typeof SAVED_PLACES_VERSION;
  places: SavedPlace[];
};

/**
 * The v1 shape on disk, kept only so a v1 file can be recognised and
 * migrated. v1 carried one free-text `note` instead of `landmarks`.
 */
type SavedPlaceV1 = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  note: string;
  radiusMeters: number;
};

/**
 * Converts one v1 place into v2 shape: its `note` becomes its one landmark,
 * trimmed, or no landmarks at all if the note was blank — never a blank line
 * for a caller to read aloud. Defensive about the input's actual shape
 * because it runs on parsed JSON before `usable` has had a chance to reject
 * anything malformed: a non-object entry is handed back unchanged so `usable`
 * can throw it out on its own terms, the same as it would for a v2 file.
 */
function migrateV1Place(p: unknown): unknown {
  if (!p || typeof p !== "object") return p;
  const q = p as Partial<SavedPlaceV1>;
  const note = typeof q.note === "string" ? q.note.trim() : "";
  return {
    id: q.id,
    label: q.label,
    lat: q.lat,
    lng: q.lng,
    radiusMeters: q.radiusMeters,
    landmarks: note ? [note] : [],
  };
}

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
 * Drops anything that is not a string, trims what remains, drops entries
 * that are empty or whitespace-only, preserves order and caps at
 * `MAX_LANDMARKS`. Applied on both read and write, like every other field
 * here, so disk and memory can never disagree about what "valid" means.
 */
function sanitizeLandmarks(landmarks: unknown): string[] {
  if (!Array.isArray(landmarks)) return [];
  const cleaned: string[] = [];
  for (const l of landmarks) {
    if (typeof l !== "string") continue;
    const trimmed = l.trim();
    if (!trimmed) continue;
    cleaned.push(trimmed);
    if (cleaned.length >= MAX_LANDMARKS) break;
  }
  return cleaned;
}

/**
 * Normalises the fields that are optional or easy to corrupt (missing
 * landmarks, a negative or absent radius) so a place is always valid the
 * moment it is persisted, not just after it happens to pass back through
 * `readSavedPlaces`. Shared by both directions so disk and memory can never
 * disagree about what "valid" means.
 */
function sanitize(p: SavedPlace): SavedPlace {
  return {
    ...p,
    // Trimmed here rather than at each input, so "Home " and "Home" cannot
    // become two entries and the spoken line never carries stray whitespace.
    label: p.label.trim(),
    landmarks: sanitizeLandmarks(p.landmarks),
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
 * spoke but not in a language we know. A version this build recognises but
 * cannot read forward from — anything other than the current version or the
 * one migration path below — is `ok: true` with nothing recovered: that file
 * is genuinely not a shape this build can guess at, and freezing writes
 * forever over an unreadable future format would be worse than starting
 * fresh.
 *
 * A v1 file (`note: string`) is not one of those: it is read and migrated
 * rather than discarded, because bumping `SAVED_PLACES_VERSION` without a
 * conversion would otherwise make every place anyone had already saved
 * disappear the moment this build first opens their storage, with no error
 * and nothing for a caller to catch.
 */
export async function readSavedPlacesResult(): Promise<SavedPlacesRead> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
    if (!raw) return { ok: true, places: [] };
    const parsed = JSON.parse(raw) as { schemaVersion?: unknown; places?: unknown };

    let rawPlaces: unknown[];
    if (parsed?.schemaVersion === SAVED_PLACES_VERSION) {
      rawPlaces = Array.isArray(parsed.places) ? parsed.places : [];
    } else if (parsed?.schemaVersion === SAVED_PLACES_VERSION_V1) {
      rawPlaces = Array.isArray(parsed.places)
        ? parsed.places.map(migrateV1Place)
        : [];
    } else {
      // Neither the current version nor the one we know how to migrate from —
      // including a version from the future, whose shape we cannot guess at.
      return { ok: true, places: [] };
    }

    return {
      ok: true,
      places: rawPlaces.filter(usable).slice(0, MAX_SAVED_PLACES).map(sanitize),
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
