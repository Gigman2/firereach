/**
 * Expo SDK 55 inlines process.env.EXPO_PUBLIC_* at build time, so this reads
 * from app/.env (gitignored) with a localhost fallback for the simulator.
 *
 * Testing on a physical device: set EXPO_PUBLIC_API_URL to your machine's LAN
 * address (e.g. http://192.168.1.42:8080). iOS App Transport Security blocks
 * cleartext HTTP to a LAN IP unless NSAllowsLocalNetworking is added to the
 * iOS Info.plist; the simulator is exempt when talking to localhost.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

/** Emergency UX: fail fast to cached data rather than hang on a dead network. */
export const API_TIMEOUT_MS = 8000;
