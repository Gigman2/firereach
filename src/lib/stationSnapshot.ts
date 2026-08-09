import AsyncStorage from "@react-native-async-storage/async-storage";

export const STATION_SNAPSHOT_VERSION = 1 as const;
export const STATION_SNAPSHOT_KEY = "firereach.stationSnapshot.v1";

/**
 * How long a remembered ranking stays on offer.
 *
 * This is the one knob that decides how wrong the app is allowed to be for
 * someone who has moved. Seven days is chosen against the way this app is
 * actually used: it exists for people with poor connectivity who may not open
 * it for weeks, and the moment it is needed is the worst possible moment to
 * answer "I don't know". A week covers ordinary life — the same house, the
 * same city — while being short enough that a relocation ages out on its own
 * rather than being wrong indefinitely.
 *
 * Someone who travels abroad within the window sees Ghanaian stations until it
 * expires. That is accepted deliberately: the alternative on that screen is
 * 192, which is also a Ghanaian number, so nothing is actually gained by
 * refusing to answer.
 */
export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Where the app last ranked stations from, remembered across launches.
 *
 * Stores the *position* the ranking was taken at rather than the stations it
 * produced. The table is persisted separately and `readStationTable` never
 * fails — it degrades to the table compiled into the binary — so re-ranking
 * from this at read time yields the same nearest stations while staying
 * consistent with whatever table the app now holds. Frozen station ids would
 * instead pin an answer to a table version that may no longer exist.
 *
 * This is NOT a position in the sense `useNearestStation` means it. It never
 * becomes `position`, is never spoken by `whatToSay`, and cannot be presented
 * as where the caller is. It answers one question — which stations were near
 * them last time we genuinely knew — and the provider labels every answer
 * built from it as such.
 */
export type StationSnapshot = {
  schemaVersion: typeof STATION_SNAPSHOT_VERSION;
  /** ISO 8601, stamped when the ranking was taken. */
  rankedAt: string;
  from: { lat: number; lng: number };
};

function isUsable(value: unknown): value is StationSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<StationSnapshot>;
  if (s.schemaVersion !== STATION_SNAPSHOT_VERSION) return false;
  if (typeof s.rankedAt !== "string") return false;
  if (typeof s.from !== "object" || s.from === null) return false;
  // Coordinates that are not finite numbers would rank every station at NaN
  // metres and sort into an arbitrary order, which reads exactly like a real
  // answer. Rejected here rather than defended against at every use.
  return Number.isFinite(s.from.lat) && Number.isFinite(s.from.lng);
}

/**
 * Returns `null` rather than throwing for every failure — a miss, corrupt
 * JSON, a version this build does not know, unusable coordinates, or an age
 * outside the window. Every one of them means the same thing to the caller:
 * there is no remembered ranking to offer, so carry on without one.
 *
 * A negative age means the device clock moved backwards, so `rankedAt` is
 * from the future and its real age is unknowable. Treated as expired, the
 * same call `isStale` makes about a table timestamp in `useNearestStation`.
 */
export async function readStationSnapshot(): Promise<StationSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(STATION_SNAPSHOT_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isUsable(parsed)) return null;

    const age = Date.now() - Date.parse(parsed.rankedAt);
    if (!Number.isFinite(age) || age < 0 || age > SNAPSHOT_MAX_AGE_MS) {
      return null;
    }

    return parsed;
  } catch (err) {
    console.warn("[stationSnapshot] could not read", err);
    return null;
  }
}

/**
 * Records a ranking position. Never throws: this runs inside a resolution
 * that has already produced a usable answer on screen, and failing to
 * remember it for next time is not worth failing that resolution over.
 */
export async function writeStationSnapshot(from: {
  lat: number;
  lng: number;
}): Promise<void> {
  const snapshot: StationSnapshot = {
    schemaVersion: STATION_SNAPSHOT_VERSION,
    // Via `Date.now` rather than a bare `new Date()`, so writing and the
    // expiry check in `readStationSnapshot` read the same clock — one place
    // to control when testing an age window, and one thing to be wrong if the
    // device clock is.
    rankedAt: new Date(Date.now()).toISOString(),
    from: { lat: from.lat, lng: from.lng },
  };

  try {
    await AsyncStorage.setItem(STATION_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn("[stationSnapshot] could not write", err);
  }
}
