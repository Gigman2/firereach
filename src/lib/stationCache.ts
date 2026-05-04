import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  STATION_CACHE_VERSION,
  StationSnapshot,
} from "./stationTypes";

const CACHE_KEY = "firereach.nearestStation.v1";

export async function readStationCache(): Promise<StationSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StationSnapshot;
    if (parsed.schemaVersion !== STATION_CACHE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeStationCache(
  snapshot: StationSnapshot
): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
}

export async function clearStationCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
