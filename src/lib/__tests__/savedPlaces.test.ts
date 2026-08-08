import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import {
  readSavedPlaces,
  writeSavedPlaces,
  MAX_SAVED_PLACES,
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
  note: "near the blue kiosk",
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

  it("normalises radius and note on write, not just on read", async () => {
    await writeSavedPlaces([
      place({ id: "z", radiusMeters: -5, note: undefined as unknown as string }),
    ]);
    // Inspect what actually landed on disk, bypassing readSavedPlaces's own
    // normalisation, so this fails if only the read side were fixed.
    const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
    const persisted = JSON.parse(raw as string) as { places: SavedPlace[] };
    expect(persisted.places[0].radiusMeters).toBe(DEFAULT_RADIUS_METERS);
    expect(persisted.places[0].note).toBe("");
  });
});
