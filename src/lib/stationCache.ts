import AsyncStorage from "@react-native-async-storage/async-storage";
import bundled from "../data/stations.bundled.json";
import {
  CachedStation,
  STATION_TABLE_VERSION,
  StationTable,
} from "./stationTypes";

const TABLE_KEY = "firereach.stations.v2";
/** Written by the pre-bundle single-station cache. Removed, never read. */
const LEGACY_SNAPSHOT_KEY = "firereach.nearestStation.v1";

/**
 * Every key this module owns. SettingsScreen clears exactly these — never
 * AsyncStorage.clear(), which would also wipe onboarding and theme.
 */
export const STATION_CACHE_KEYS = [TABLE_KEY, LEGACY_SNAPSHOT_KEY];

export function bundledTable(): StationTable {
  return {
    schemaVersion: STATION_TABLE_VERSION,
    refreshedAt: null,
    source: "bundled",
    stations: bundled as CachedStation[],
  };
}

/**
 * Never returns null. A miss, a version mismatch, or corrupt JSON all fall
 * back to the table compiled into the binary, so there is no app state in
 * which the user has no stations at all.
 */
export async function readStationTable(): Promise<StationTable> {
  try {
    const raw = await AsyncStorage.getItem(TABLE_KEY);
    if (!raw) return bundledTable();
    const parsed = JSON.parse(raw) as StationTable;
    if (parsed.schemaVersion !== STATION_TABLE_VERSION) return bundledTable();
    if (!Array.isArray(parsed.stations) || parsed.stations.length === 0) {
      return bundledTable();
    }
    return parsed;
  } catch {
    return bundledTable();
  }
}

export async function writeStationTable(table: StationTable): Promise<void> {
  await AsyncStorage.setItem(TABLE_KEY, JSON.stringify(table));
}

/** Removes only this module's keys. Reads then degrade to the bundled table. */
export async function clearStationCache(): Promise<void> {
  await AsyncStorage.multiRemove(STATION_CACHE_KEYS);
}
