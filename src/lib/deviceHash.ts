import AsyncStorage from "@react-native-async-storage/async-storage";

export const DEVICE_HASH_KEY = "firereach.deviceHash.v1";

/**
 * An opaque, stable, per-install identifier for the submissions endpoint.
 *
 * The API requires `device_hash` on every submission and rate-limits on the
 * matching `X-Device-Hash` header. Per-device rather than per-IP because a
 * whole city behind one carrier NAT would otherwise share a single budget, and
 * one person spamming corrections would silence everyone else on that network.
 *
 * Deliberately NOT derived from anything about the device. No IMEI, no
 * advertising id, no hardware fingerprint — this app is used to report
 * emergencies, and a report that could be tied back to a handset is a report
 * some people will not file. A random value generated once and kept locally
 * gives the server exactly what it needs (two submissions from the same source
 * look the same) and nothing it does not.
 *
 * Not a secret and not a credential: it is a bucket key. `Math.random` is the
 * right tool for that, and pulling in a crypto dependency would imply
 * guarantees this does not make.
 */
function newDeviceHash(): string {
  const part = () => Math.floor(Math.random() * 1e12).toString(36);
  return `d_${Date.now().toString(36)}_${part()}${part()}`;
}

/**
 * In-flight and completed reads share one promise, so two screens submitting
 * at once cannot each generate a hash and race to persist it — which would
 * leave the loser's submissions keyed to an identifier that no longer exists
 * on disk, and split one device's rate limit across two buckets.
 */
let pending: Promise<string> | null = null;

async function load(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_HASH_KEY);
    if (stored) return stored;
  } catch (err) {
    // Fall through to generating one. A hash that cannot be read is the same
    // problem as no hash, and both are better solved by having one to send.
    console.warn("[deviceHash] could not read", err);
  }

  const fresh = newDeviceHash();
  try {
    await AsyncStorage.setItem(DEVICE_HASH_KEY, fresh);
  } catch (err) {
    // Returned anyway. A submission with a hash that will not persist still
    // reaches the queue; only the rate-limit bucket resets next launch, which
    // is a far smaller failure than refusing to send a correction to an
    // emergency phone number.
    console.warn("[deviceHash] could not persist", err);
  }
  return fresh;
}

/** Reads the stored hash, creating and persisting one on first use. */
export function getDeviceHash(): Promise<string> {
  if (!pending) {
    pending = load().catch((err) => {
      // Never cache a rejection: the next caller should get a fresh attempt
      // rather than inheriting a failure it had no part in.
      pending = null;
      throw err;
    });
  }
  return pending;
}

/** Test seam. Clears the memoised promise so a fresh read hits storage. */
export function resetDeviceHashCache(): void {
  pending = null;
}
