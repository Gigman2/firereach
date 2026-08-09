import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import {
  readStationSnapshot,
  writeStationSnapshot,
  SNAPSHOT_MAX_AGE_MS,
  STATION_SNAPSHOT_KEY,
  STATION_SNAPSHOT_VERSION,
  type StationSnapshot,
} from "../stationSnapshot";

const ACCRA = { lat: 5.6091, lng: -0.2112 };

/** Fixed so age arithmetic in these tests is exact. */
const NOW = Date.parse("2026-08-09T12:00:00.000Z");

const snapshot = (over: Partial<StationSnapshot> = {}): StationSnapshot => ({
  schemaVersion: STATION_SNAPSHOT_VERSION,
  rankedAt: new Date(NOW).toISOString(),
  from: ACCRA,
  ...over,
});

const seed = (value: unknown) =>
  AsyncStorage.setItem(
    STATION_SNAPSHOT_KEY,
    typeof value === "string" ? value : JSON.stringify(value)
  );

/** Places "now" at `NOW + offset`, so a seeded snapshot has age `offset`. */
const clockAt = (offset: number) =>
  jest.spyOn(Date, "now").mockReturnValue(NOW + offset);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

it("round-trips a snapshot", async () => {
  clockAt(0);

  await writeStationSnapshot(ACCRA);

  expect(await readStationSnapshot()).toEqual({
    schemaVersion: STATION_SNAPSHOT_VERSION,
    rankedAt: new Date(NOW).toISOString(),
    from: ACCRA,
  });
});

it("returns null when nothing has been written", async () => {
  expect(await readStationSnapshot()).toBeNull();
});

it("offers a snapshot that is just inside the window", async () => {
  await seed(snapshot());
  clockAt(SNAPSHOT_MAX_AGE_MS - 1);

  expect(await readStationSnapshot()).not.toBeNull();
});

it("drops a snapshot past the window", async () => {
  await seed(snapshot());
  clockAt(SNAPSHOT_MAX_AGE_MS + 1);

  expect(await readStationSnapshot()).toBeNull();
});

it("drops a snapshot stamped in the future", async () => {
  // A device clock that moved backwards. The age is unknowable rather than
  // small, so it must not be treated as fresh.
  await seed(snapshot());
  clockAt(-60_000);

  expect(await readStationSnapshot()).toBeNull();
});

it("drops a snapshot written by a schema this build does not know", async () => {
  await seed({ ...snapshot(), schemaVersion: 99 });
  clockAt(0);

  expect(await readStationSnapshot()).toBeNull();
});

it("drops corrupt JSON without throwing", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await seed("{not json");

  await expect(readStationSnapshot()).resolves.toBeNull();
});

it("drops coordinates that are not finite numbers", async () => {
  // JSON has no NaN or Infinity literals, so this is what non-finite
  // coordinates actually look like once they have been through storage.
  await seed({ ...snapshot(), from: { lat: null, lng: -0.2112 } });
  clockAt(0);

  expect(await readStationSnapshot()).toBeNull();
});

it("drops a snapshot with an unparseable timestamp", async () => {
  await seed({ ...snapshot(), rankedAt: "not a date" });
  clockAt(0);

  expect(await readStationSnapshot()).toBeNull();
});

it("overwrites rather than accumulating", async () => {
  clockAt(0);
  await writeStationSnapshot(ACCRA);
  const kumasi = { lat: 6.6885, lng: -1.6244 };
  await writeStationSnapshot(kumasi);

  expect((await readStationSnapshot())?.from).toEqual(kumasi);
  expect(await AsyncStorage.getAllKeys()).toEqual([STATION_SNAPSHOT_KEY]);
});
