import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { resetAllAppData, setAppRemountHandler } from "../devReset";
import { SAFETY_CONTENT_CACHE_KEY } from "../safetyContent";

/**
 * Every key the app is known to write today. The point of the test below is
 * that this list is evidence, not a specification — `resetAllAppData` is not
 * given it, and a key nobody added here still has to go.
 */
const KNOWN_KEYS = [
  "@firereach_onboarding_complete",
  "@firereach_saved_places",
  "@firereach_theme",
  "firereach.stations.v2",
  "firereach.nearestStation.v1",
  SAFETY_CONTENT_CACHE_KEY,
];

let unregister: (() => void) | null = null;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

afterEach(() => {
  unregister?.();
  unregister = null;
});

const seed = (keys: string[]) =>
  AsyncStorage.multiSet(keys.map((k) => [k, "seeded"]));

it("removes every key the app has written", async () => {
  await seed(KNOWN_KEYS);

  await resetAllAppData();

  expect(await AsyncStorage.getAllKeys()).toEqual([]);
});

it("removes keys it was never told about", async () => {
  // Stands in for whatever the next feature persists. A reset that clears
  // only today's keys would pass the test above and still strand this one.
  await seed([...KNOWN_KEYS, "@firereach_some_key_added_later"]);

  await resetAllAppData();

  expect(await AsyncStorage.getAllKeys()).toEqual([]);
});

it("remounts the app only once storage is already empty", async () => {
  await seed(KNOWN_KEYS);

  // `clear` is already a jest.fn in the async-storage mock, so spying on it
  // hands back that same function rather than a wrapper around it — capture
  // the implementation and put it back by hand.
  const clearMock = AsyncStorage.clear as unknown as jest.Mock;
  const originalImpl = clearMock.getMockImplementation()!;
  let cleared = false;
  clearMock.mockImplementation(async (cb?: unknown) => {
    await originalImpl(cb);
    cleared = true;
  });

  // A remount that ran first would re-read the old data and put the user
  // straight back where they started, which is the whole failure this
  // ordering exists to prevent.
  let clearedWhenRemounted: boolean | null = null;
  unregister = setAppRemountHandler(() => {
    clearedWhenRemounted = cleared;
  });

  try {
    await resetAllAppData();
  } finally {
    clearMock.mockImplementation(originalImpl);
  }

  expect(clearedWhenRemounted).toBe(true);
});

it("wipes storage even with no remount handler registered", async () => {
  await seed(KNOWN_KEYS);

  await expect(resetAllAppData()).resolves.toBeUndefined();

  expect(await AsyncStorage.getAllKeys()).toEqual([]);
});

it("refuses to touch storage outside development", async () => {
  await seed(KNOWN_KEYS);
  jest.spyOn(console, "warn").mockImplementation(() => {});

  const globals = globalThis as unknown as { __DEV__: boolean };
  const dev = globals.__DEV__;
  globals.__DEV__ = false;
  try {
    await resetAllAppData();
  } finally {
    globals.__DEV__ = dev;
  }

  expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual(
    [...KNOWN_KEYS].sort()
  );
});
