// GuidesHubScreen pulls in ThemeContext, which reaches AsyncStorage's native
// module. Every other test file that imports it swaps in the official jest
// mock the same way (see guidesHubCategories.test.ts), so this stays
// consistent with the rest of the suite rather than adding a global
// moduleNameMapper.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { SUBCATEGORIES } from "../../../scripts/contentValidate.mjs";
import { SUBCATEGORY_TAB } from "../safetyContent";
import { SUBCATEGORY_META } from "../../screens/guides/GuidesHubScreen";

const SCRIPT_SOURCE = "app/scripts/contentValidate.mjs (SUBCATEGORIES)";
const LIB_SOURCE = "app/src/lib/safetyContent.ts (SUBCATEGORY_TAB)";
const HUB_SOURCE = "app/src/screens/guides/GuidesHubScreen.tsx (SUBCATEGORY_META)";

/**
 * The subcategory -> tab map is hand-copied in three places (see M5 in the
 * 2026-08-10 final review) because a shared module can't cleanly cross the
 * build-script (Node/.mjs) and app (React Native) boundary:
 *   - SCRIPT_SOURCE, consulted by the content build/validate pipeline.
 *   - LIB_SOURCE, consulted by isAcceptable() at the OTA boundary.
 *   - HUB_SOURCE, consulted for icon/label/accent metadata on the hub.
 *
 * Drift between them is silent and severe: a subcategory present in
 * SUBCATEGORIES but missing from SUBCATEGORY_TAB makes isAcceptable() false
 * for every item of that subcategory, and refreshContent()'s
 * items.every(isAcceptable) then rejects the *entire* OTA payload for one
 * bad item — OTA content updates die permanently with nothing but a single
 * console.warn. A subcategory in SUBCATEGORY_TAB but missing from
 * SUBCATEGORY_META silently drops that card from the hub (see M4). This
 * test is the only thing pinning the three together; it throws a message
 * naming the disagreeing sources rather than relying on a plain array diff.
 */
describe("subcategory map parity across the three hand-copied sources", () => {
  it("agrees on the set of subcategory keys", () => {
    const scriptKeys = Object.keys(SUBCATEGORIES).sort();
    const tabKeys = Object.keys(SUBCATEGORY_TAB).sort();
    const metaKeys = Object.keys(SUBCATEGORY_META).sort();

    if (JSON.stringify(scriptKeys) !== JSON.stringify(tabKeys)) {
      throw new Error(
        `Subcategory keys diverge between ${SCRIPT_SOURCE} (${JSON.stringify(
          scriptKeys
        )}) and ${LIB_SOURCE} (${JSON.stringify(tabKeys)}).`
      );
    }
    if (JSON.stringify(scriptKeys) !== JSON.stringify(metaKeys)) {
      throw new Error(
        `Subcategory keys diverge between ${SCRIPT_SOURCE} (${JSON.stringify(
          scriptKeys
        )}) and ${HUB_SOURCE} (${JSON.stringify(metaKeys)}).`
      );
    }
  });

  it("agrees on which tab each subcategory belongs to", () => {
    for (const key of Object.keys(SUBCATEGORIES)) {
      const scriptTab = (SUBCATEGORIES as Record<string, string>)[key];
      const libTab = SUBCATEGORY_TAB[key];
      if (scriptTab !== libTab) {
        throw new Error(
          `Subcategory "${key}" maps to "${scriptTab}" in ${SCRIPT_SOURCE} but "${libTab}" in ${LIB_SOURCE}.`
        );
      }
    }
  });
});
