// GuidesHubScreen pulls in ThemeContext, which reaches AsyncStorage's native
// module. Every other test file that imports a module reaching AsyncStorage
// (devReset, stationSnapshot, savedPlaces, submissionsApi) swaps in the
// official jest mock the same way, so this stays consistent with the rest of
// the suite rather than adding a global moduleNameMapper (which recurses
// against those files' own jest.mock calls).
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { visibleItems } from "../safetyContent";
import { SUBCATEGORY_META } from "../../screens/guides/GuidesHubScreen";

describe("hub categorization", () => {
  it("puts smoke, evacuation, and extinguisher under First Aid", () => {
    // UI Requirements §S5. The screen previously tagged all three as Hazards,
    // so every first-aid topic except Burns was filed under the wrong tab.
    const byTab = Object.fromEntries(visibleItems().map((i) => [i.subcategory, i.category]));
    expect(byTab.smoke).toBe("first_aid");
    expect(byTab.evacuation).toBe("first_aid");
    expect(byTab.extinguisher).toBe("first_aid");
    expect(byTab.burns).toBe("first_aid");
  });

  it("has exactly five hazard and four first-aid topics", () => {
    const items = visibleItems();
    expect(items.filter((i) => i.category === "hazard")).toHaveLength(5);
    expect(items.filter((i) => i.category === "first_aid")).toHaveLength(4);
  });

  it("has icon metadata for every shipped subcategory and no orphans", () => {
    const shipped = new Set(visibleItems().map((i) => i.subcategory));
    const known = new Set(Object.keys(SUBCATEGORY_META));
    expect([...shipped].filter((s) => !known.has(s))).toEqual([]);
    expect([...known].filter((s) => !shipped.has(s))).toEqual([]);
  });
});
