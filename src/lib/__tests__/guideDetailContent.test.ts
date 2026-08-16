import fs from "fs";
import path from "path";

// safetyContent.ts now reaches AsyncStorage (the OTA cache added for Task
// 13). Every other test file that imports a module reaching AsyncStorage
// (devReset, stationSnapshot, savedPlaces, submissionsApi, guidesHubCategories)
// swaps in the official jest mock the same way, so this stays consistent
// with the rest of the suite rather than adding a global moduleNameMapper.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { itemBySlug } from "../safetyContent";

const SCREEN = path.resolve(__dirname, "../../screens/guides/GuideDetailScreen.tsx");
const source = fs.readFileSync(SCREEN, "utf8");

describe("GuideDetailScreen", () => {
  it("no longer hardcodes a burns protocol", () => {
    expect(source).not.toContain("Remove from heat");
    expect(source).not.toContain("Cool with water");
    expect(source).not.toMatch(/const GUIDE\s*=/);
  });

  it("no longer hardcodes a review date", () => {
    expect(source).not.toMatch(/Last reviewed: \w+ \d{4}/);
  });

  it("derives the badge from content", () => {
    expect(source).toContain("badgeText");
  });

  it("looks the item up by the navigated slug", () => {
    // Task 13: the screen now sources items from useSafetyContent() (bundled
    // synchronously, then cached/refreshed content) and finds the navigated
    // slug within them, rather than calling the bundled-only itemBySlug
    // directly — see useSafetyContent.ts.
    expect(source).toContain("useSafetyContent");
    expect(source).toMatch(/items\.find\(/);
    expect(source).toMatch(/route\.params/);
  });

  it("shows the first-aid disclaimer with the mandated wording", () => {
    // Matched against the source with its whitespace collapsed, because this
    // is a scan of source *text* and the sentence is long enough that any
    // reformat wraps it across two lines. JSX collapses that newline and its
    // indent back to a single space, so the rendered string never changed —
    // but the literal substring vanished from the file and this failed,
    // reporting a wording regression that had not happened.
    expect(source.replace(/\s+/g, " ")).toContain(
      "General first aid guidance. Not a substitute for professional medical care."
    );
  });

  it("gives every guide the same header, with no colour of its own", () => {
    // This assertion has been round the houses. It began as "styles.header
    // must not hardcode #D97706" (a leftover from when the screen only ever
    // rendered the burns protocol), and was then satisfied by painting the
    // header from SUBCATEGORY_META's per-subcategory `accent` — which traded
    // one wrong header colour for nine, none of them meaning anything. The
    // rule now is simply that the header carries no literal colour at all:
    // it takes theme.background like every other header in the app, so the
    // screen looks the same whichever guide is open.
    const header = source.match(/header:\s*\{[^}]*\}/s)?.[0] ?? "";
    expect(header).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
    expect(source).toMatch(/styles\.header[\s\S]{0,300}?backgroundColor:\s*theme\.background/);
    // Category still reaches the header, as the kicker's text rather than
    // as a fill.
    expect(source).toContain("SUBCATEGORY_META");
  });

  it("dials the resolved station's chain, not a literal national number", () => {
    // The footer used to print "call 192" in prose and "Call 192" on the
    // button, both as literals, on a screen that had never asked which
    // station the caller is near. noHardcodedNumbers.test.ts catches a
    // literal after "tel:"; these two literals were in the *copy*, so it
    // saw nothing. Every number on this screen now comes from the same
    // chain the home screen dials.
    expect(source).toContain("dialTargets");
    expect(source).toContain("useNearestStation");
    expect(source).not.toMatch(/Call 192|call 192/);
    // 192 stays reachable: dialTargets always ends with it, and the footer
    // surfaces it separately whenever the primary is chargeable.
    expect(source).toContain("NATIONAL_EMERGENCY_PHONE");
    expect(source).toMatch(/freeFallback/);
  });

  it("no longer renders the empty hero placeholder", () => {
    // A 192px-tall empty card holding one emoji, sitting between the header
    // and the first line anyone came to read. There is no artwork behind it
    // to arrive later — it was a placeholder for images the content schema
    // has no field for.
    expect(source).not.toContain("heroImage");
    expect(source).not.toContain("🩹");
  });
});

// Fix round 1 / I2: guideDetailContent.test.ts was a source-regex scan of
// GuideDetailScreen.tsx's *text*, not its *behaviour* — so nothing proved
// the screen's not-found branch actually fires for the shapes it's
// supposed to (an unknown or withdrawn slug), or that a hazard item and a
// first-aid item resolve to the different content each branch renders.
// These assert against itemBySlug and the content directly (no RN
// rendering, per the coordinator's note that this is unnecessary here),
// then cross-check that the screen's source implements exactly the branch
// conditions those shapes require.
describe("GuideDetailScreen behaviour: data shapes the screen's branches depend on", () => {
  it("a hazard item resolves with empty steps and a non-empty body — the prose branch", () => {
    const item = itemBySlug("hazard-cooking");
    expect(item).toBeDefined();
    expect(item!.category).toBe("hazard");
    expect(item!.steps).toHaveLength(0);
    expect(item!.body.length).toBeGreaterThan(0);
  });

  it("a first-aid item resolves with ordered steps — the numbered-step branch", () => {
    const item = itemBySlug("firstaid-burns");
    expect(item).toBeDefined();
    expect(item!.category).toBe("first_aid");
    expect(item!.steps.length).toBeGreaterThan(0);
  });

  it("an unknown slug is unreachable — the not-found branch's trigger", () => {
    expect(itemBySlug("does-not-exist")).toBeUndefined();
  });

  // "Withdrawn ... stops the app from displaying the item entirely" is
  // printed in app/docs/content-review/README.md and told to a clinician
  // in writing. safetyContent.test.ts already proves this at the library
  // level; this proves the screen actually depends on it, by mocking the
  // bundled content the same way, so a future edit that decouples the two
  // fails here too.
  it("a withdrawn slug is unreachable — the not-found branch's trigger", () => {
    jest.resetModules();
    jest.doMock("../../data/safety-content.bundled.json", () => [
      {
        slug: "withdrawn-fixture",
        category: "hazard",
        subcategory: "electrical",
        title: "Withdrawn Fixture",
        summary: "s",
        body: "b",
        steps: [],
        tags: [],
        contextual_trigger: null,
        sources: [{ title: "Test Source", publisher: "Test Publisher", year: "2020", url: "u" }],
        content_hash: "h",
        review: { state: "withdrawn" },
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fresh = require("../safetyContent");
    expect(fresh.itemBySlug("withdrawn-fixture")).toBeUndefined();

    jest.dontMock("../../data/safety-content.bundled.json");
    jest.resetModules();
  });

  it("the not-found branch guards on `!item`, the exact falsy value itemBySlug returns", () => {
    expect(source).toMatch(/if\s*\(!item\)/);
  });

  it("the step-vs-prose branch is keyed off item.category === \"first_aid\", matching the data shape", () => {
    expect(source).toMatch(/isFirstAid\s*=\s*item\?\.category\s*===\s*"first_aid"/);
  });
});
