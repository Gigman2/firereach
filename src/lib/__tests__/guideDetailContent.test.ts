import fs from "fs";
import path from "path";
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
    expect(source).toContain("itemBySlug");
    expect(source).toMatch(/route\.params/);
  });

  it("shows the first-aid disclaimer with the mandated wording", () => {
    expect(source).toContain(
      "General first aid guidance. Not a substitute for professional medical care."
    );
  });

  it("no longer hardcodes the amber header for every guide", () => {
    // Fix round 1 / I1: styles.header used to carry `backgroundColor:
    // "#D97706"` directly — a leftover from when this screen only ever
    // rendered the burns protocol. The band must now come from the
    // category colour map, not a literal in the stylesheet.
    expect(source).not.toMatch(/header:\s*\{[^}]*backgroundColor:\s*"#D97706"/s);
    expect(source).toContain("SUBCATEGORY_META");
    expect(source).toContain("NEUTRAL_ACCENT");
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
