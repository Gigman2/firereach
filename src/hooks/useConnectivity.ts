import { useEffect, useState } from "react";
import * as Network from "expo-network";

export type ConnectivityState = {
  isOnline: boolean | null; // null = unknown / not yet resolved
};

export function useConnectivity(): ConnectivityState {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (cancelled) return;
        setIsOnline(Boolean(state.isInternetReachable ?? state.isConnected));
      } catch {
        if (cancelled) return;
        setIsOnline(false);
      }
    };

    refresh();
    const subscription = Network.addNetworkStateListener((state) => {
      if (cancelled) return;
      setIsOnline(Boolean(state.isInternetReachable ?? state.isConnected));
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return { isOnline };
}
