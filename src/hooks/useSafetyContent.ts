import { useEffect, useState } from "react";
import { loadContent, refreshContent, visibleItems, type SafetyItem } from "../lib/safetyContent";

/**
 * Starts from bundled content synchronously so the first frame is never empty
 * — this screen has to work in a fire — then swaps in the cached or refreshed
 * set once it resolves.
 */
export function useSafetyContent(): SafetyItem[] {
  const [items, setItems] = useState<SafetyItem[]>(() => visibleItems());

  useEffect(() => {
    let active = true;

    loadContent().then((loaded) => {
      if (active) setItems(loaded);
    });

    refreshContent().then(() =>
      loadContent().then((loaded) => {
        if (active) setItems(loaded);
      })
    );

    return () => {
      active = false;
    };
  }, []);

  return items;
}
