import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import {
  readSavedPlaces,
  readSavedPlacesResult,
  writeSavedPlaces,
  MAX_SAVED_PLACES,
  MAX_LANDMARKS,
  DEFAULT_RADIUS_METERS,
  SAVED_PLACES_KEY,
  SAVED_PLACES_VERSION,
  type SavedPlace,
} from "../savedPlaces";

const place = (over: Partial<SavedPlace> = {}): SavedPlace => ({
  id: "p1",
  label: "Home",
  lat: 5.6091,
  lng: -0.2112,
  landmarks: ["near the blue kiosk"],
  radiusMeters: DEFAULT_RADIUS_METERS,
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("savedPlaces", () => {
  it("returns an empty list before anything is saved, without ever parsing storage", async () => {
    // Pins the `if (!raw) return []` guard itself: without it, `raw` (null)
    // would be handed to JSON.parse. The result would still end up `[]`
    // (JSON.parse(null) parses the literal "null", which then fails the
    // schemaVersion check), so asserting only the return value can't tell
    // the guard apart from that accidental fallthrough — asserting JSON.parse
    // was never called can.
    const parseSpy = jest.spyOn(JSON, "parse");
    expect(await readSavedPlaces()).toEqual([]);
    expect(parseSpy).not.toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  it("round-trips a place", async () => {
    await writeSavedPlaces([place()]);
    expect(await readSavedPlaces()).toEqual([place()]);
  });

  it("returns empty rather than throwing on corrupt JSON", async () => {
    await AsyncStorage.setItem(SAVED_PLACES_KEY, "{ not json");
    expect(await readSavedPlaces()).toEqual([]);
  });

  it("resolves to an empty list rather than rejecting when AsyncStorage itself rejects", async () => {
    // Queue one rejection on the existing mock rather than jest.spyOn +
    // mockRestore. getItem is already a jest.fn backed by the official
    // in-memory mock; spying on it and then restoring does not put that
    // implementation back, it strips it, so every later getItem in the file
    // resolves undefined and every subsequent read silently returns [].
    // mockRejectedValueOnce falls back to the real mock on the next call.
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error("storage unavailable")
    );
    await expect(readSavedPlaces()).resolves.toEqual([]);

    // Prove the leak is gone: storage still works on the very next call.
    await writeSavedPlaces([place()]);
    expect(await readSavedPlaces()).toEqual([place()]);
  });

  it("returns empty on a version mismatch rather than guessing the shape", async () => {
    await AsyncStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify({ schemaVersion: 999, places: [place()] })
    );
    expect(await readSavedPlaces()).toEqual([]);
  });

  it("drops entries with unusable coordinates", async () => {
    await AsyncStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify({
        schemaVersion: SAVED_PLACES_VERSION,
        places: [place(), place({ id: "bad", lat: NaN }), place({ id: "b2", lng: 999 })],
      })
    );
    const got = await readSavedPlaces();
    expect(got.map((p) => p.id)).toEqual(["p1"]);
  });

  it("caps what it writes, keeping the newest entries rather than the oldest", async () => {
    const many = Array.from({ length: MAX_SAVED_PLACES + 5 }, (_, i) =>
      place({ id: `p${i}` })
    );
    await writeSavedPlaces(many);
    const got = await readSavedPlaces();
    expect(got.length).toBe(MAX_SAVED_PLACES);
    expect(got.map((p) => p.id)).toEqual(
      many.slice(-MAX_SAVED_PLACES).map((p) => p.id)
    );
  });

  it("keeps a freshly appended place when the list is already full", async () => {
    // The real read-modify-write shape every caller uses: read what's on
    // disk, append the new place, write the combined list back. At capacity
    // this is exactly the scenario a front-slice cap would silently eat.
    const initial = Array.from({ length: MAX_SAVED_PLACES }, (_, i) =>
      place({ id: `old${i}` })
    );
    await writeSavedPlaces(initial);
    const before = await readSavedPlaces();
    expect(before.length).toBe(MAX_SAVED_PLACES);

    await writeSavedPlaces([...before, place({ id: "new" })]);

    const after = await readSavedPlaces();
    expect(after.length).toBe(MAX_SAVED_PLACES);
    expect(after.map((p) => p.id)).toContain("new");
    expect(after.map((p) => p.id)).not.toContain("old0");
  });

  it("falls back to the default radius when one is missing or absurd", async () => {
    await AsyncStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify({
        schemaVersion: SAVED_PLACES_VERSION,
        places: [
          place({ id: "a", radiusMeters: undefined as unknown as number }),
          place({ id: "b", radiusMeters: -5 }),
        ],
      })
    );
    const got = await readSavedPlaces();
    expect(got.map((p) => p.radiusMeters)).toEqual([
      DEFAULT_RADIUS_METERS,
      DEFAULT_RADIUS_METERS,
    ]);
  });

  it("drops entries with no usable label", async () => {
    // "I'm at ." is not a sentence anyone can act on. Both editors now
    // require a label; this is the guard for a file written before they did.
    await AsyncStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify({
        schemaVersion: SAVED_PLACES_VERSION,
        places: [
          place(),
          place({ id: "blank", label: "" }),
          place({ id: "spaces", label: "   " }),
        ],
      })
    );
    const got = await readSavedPlaces();
    expect(got.map((p) => p.id)).toEqual(["p1"]);
  });

  it("trims the label, so 'Home ' and 'Home' are the same place", async () => {
    await writeSavedPlaces([place({ label: "  Home  " })]);
    const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
    const persisted = JSON.parse(raw as string) as { places: SavedPlace[] };
    expect(persisted.places[0].label).toBe("Home");
  });

  it("normalises radius and landmarks on write, not just on read", async () => {
    await writeSavedPlaces([
      place({
        id: "z",
        radiusMeters: -5,
        landmarks: [
          "  near the kiosk  ",
          "",
          "   ",
          "second one",
          "third",
          "fourth", // beyond MAX_LANDMARKS, must be dropped
        ],
      }),
    ]);
    // Inspect what actually landed on disk, bypassing readSavedPlaces's own
    // normalisation, so this fails if only the read side were fixed.
    const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
    const persisted = JSON.parse(raw as string) as { places: SavedPlace[] };
    expect(persisted.places[0].radiusMeters).toBe(DEFAULT_RADIUS_METERS);
    expect(persisted.places[0].landmarks).toEqual([
      "near the kiosk",
      "second one",
      "third",
    ]);
  });

  it("treats a missing landmarks array as no landmarks, on write", async () => {
    await writeSavedPlaces([
      place({ id: "z2", landmarks: undefined as unknown as string[] }),
    ]);
    const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
    const persisted = JSON.parse(raw as string) as { places: SavedPlace[] };
    expect(persisted.places[0].landmarks).toEqual([]);
  });
});

/**
 * `readSavedPlaces` cannot tell "nothing is saved" from "storage would not
 * answer", and a caller that writes back what it read turns the second into
 * permanent loss: read fails, list looks empty, one append later the file
 * holds one place where ten used to be. These pin the distinction the result
 * form exists to carry.
 */
describe("readSavedPlacesResult", () => {
  it("reports ok with the places when storage answers", async () => {
    await writeSavedPlaces([place()]);
    const got = await readSavedPlacesResult();
    expect(got.ok).toBe(true);
    expect(got.places).toEqual([place()]);
  });

  it("reports ok with an empty list when nothing has been saved", async () => {
    // Genuinely empty is a successful read. Refusing to write after one would
    // mean a new install could never save its first place.
    expect(await readSavedPlacesResult()).toEqual({ ok: true, places: [] });
  });

  it("reports NOT ok when getItem rejects, so a write cannot build on it", async () => {
    // The exact failure behind the data-loss path: ten places on disk, one
    // transient rejection, and the empty array that comes back is
    // indistinguishable from the truth unless `ok` says otherwise.
    await writeSavedPlaces(
      Array.from({ length: MAX_SAVED_PLACES }, (_, i) => place({ id: `p${i}` }))
    );
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error("storage unavailable")
    );

    const failed = await readSavedPlacesResult();
    expect(failed.ok).toBe(false);
    expect(failed.places).toEqual([]);

    // And the data was never at risk — it is all still there on the next read.
    const recovered = await readSavedPlacesResult();
    expect(recovered.ok).toBe(true);
    expect(recovered.places).toHaveLength(MAX_SAVED_PLACES);
  });

  it("reports NOT ok for unparseable JSON — storage spoke, but not in a known language", async () => {
    await AsyncStorage.setItem(SAVED_PLACES_KEY, "{ not json");
    const got = await readSavedPlacesResult();
    expect(got.ok).toBe(false);
    expect(got.places).toEqual([]);
  });

  it("reports ok for a version this build cannot carry forward", async () => {
    // Not a storage failure: the file was read fine and simply is not a place
    // list this build understands. Freezing writes forever over it would
    // strand the user with a list they can neither see nor replace.
    await AsyncStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify({ schemaVersion: 999, places: [place()] })
    );
    expect(await readSavedPlacesResult()).toEqual({ ok: true, places: [] });
  });

  it("keeps readSavedPlaces's never-throws contract intact", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error("storage unavailable")
    );
    await expect(readSavedPlaces()).resolves.toEqual([]);
  });
});

/**
 * `SAVED_PLACES_VERSION` moved from 1 to 2 when `note: string` became
 * `landmarks: string[]`. Bumping the constant with no conversion would make
 * every one of these v1 files fail the version check and come back as
 * `{ ok: true, places: [] }` — a silent wipe of everyone's saved places, with
 * no error and nothing for a caller to catch. These pin the migration that
 * makes that not true: a v1 file must still be read, and its `note` carried
 * forward as the place's one landmark.
 *
 * The payloads below are written by hand rather than through `place()`,
 * because that factory produces today's (v2) shape — it could never stand in
 * for a genuine file from before landmarks existed.
 */
describe("migrating a v1 file forward", () => {
  const v1Payload = (overrides: { note?: string } = {}) => ({
    schemaVersion: 1,
    places: [
      {
        id: "v1home",
        label: "Home",
        lat: 5.6091,
        lng: -0.2112,
        note: "near the blue kiosk",
        radiusMeters: 300,
        ...overrides,
      },
    ],
  });

  it("carries a v1 place's note into a single landmark", async () => {
    await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(v1Payload()));

    const got = await readSavedPlaces();
    expect(got).toEqual([
      {
        id: "v1home",
        label: "Home",
        lat: 5.6091,
        lng: -0.2112,
        landmarks: ["near the blue kiosk"],
        radiusMeters: 300,
      },
    ]);
  });

  it("reports ok:true with the migrated place via readSavedPlacesResult", async () => {
    // The read-modify-write callers use — a caller that saw `ok: false` here
    // would refuse to write on top of a v1 file it could not migrate.
    await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(v1Payload()));

    const got = await readSavedPlacesResult();
    expect(got.ok).toBe(true);
    expect(got.places).toHaveLength(1);
    expect(got.places[0].landmarks).toEqual(["near the blue kiosk"]);
  });

  it("drops an empty v1 note rather than inventing a blank landmark", async () => {
    await AsyncStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify(v1Payload({ note: "   " }))
    );

    const got = await readSavedPlaces();
    expect(got).toHaveLength(1);
    expect(got[0].landmarks).toEqual([]);
  });

  it("still yields nothing for a version from the future, whose shape it cannot guess", async () => {
    // Not a storage failure and not the v1 shape this build knows how to
    // migrate — a version ahead of this build is exactly as unreadable as
    // one behind it that changed shape twice over.
    await AsyncStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify({ schemaVersion: 999, places: [place()] })
    );
    expect(await readSavedPlaces()).toEqual([]);
  });

  it("a place surviving migration round-trips through a write as v2", async () => {
    // The full lifecycle a real upgrade goes through: read (and migrate) a
    // v1 file, then let a normal write persist it — the file on disk must
    // come back out as v2, not silently stay v1 forever.
    await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(v1Payload()));
    const migrated = await readSavedPlaces();
    await writeSavedPlaces(migrated);

    const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
    const persisted = JSON.parse(raw as string) as {
      schemaVersion: number;
      places: SavedPlace[];
    };
    expect(persisted.schemaVersion).toBe(SAVED_PLACES_VERSION);
    expect(persisted.places[0].landmarks).toEqual(["near the blue kiosk"]);
  });
});
