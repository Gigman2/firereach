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
  it("returns an empty list before anything is saved", async () => {
    expect(await readSavedPlaces()).toEqual([]);
  });

  it("round-trips a place", async () => {
    await writeSavedPlaces([place()]);
    expect(await readSavedPlaces()).toEqual([place()]);
  });

  it("returns empty rather than throwing on corrupt JSON", async () => {
    await AsyncStorage.setItem(SAVED_PLACES_KEY, "{ not json");
    expect(await readSavedPlaces()).toEqual([]);
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

  it("caps what it writes", async () => {
    const many = Array.from({ length: MAX_SAVED_PLACES + 5 }, (_, i) =>
      place({ id: `p${i}` })
    );
    await writeSavedPlaces(many);
    expect((await readSavedPlaces()).length).toBe(MAX_SAVED_PLACES);
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
});
