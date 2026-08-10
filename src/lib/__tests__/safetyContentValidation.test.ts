import fs from "fs";
import path from "path";
import { validateContent, SUBCATEGORIES } from "../../../scripts/contentValidate.mjs";
import { contentHash } from "../../../scripts/contentHash.mjs";

const CONTENT = path.resolve(__dirname, "../../data/safety-content.bundled.json");

const valid = () => ({
  slug: "hazard-cooking",
  category: "hazard",
  subcategory: "cooking",
  title: "Cooking Fire Safety",
  summary: "Kitchen fires start fast.",
  body: "Never leave cooking unattended.",
  steps: [],
  tags: ["cooking"],
  sources: [{ title: "Home Cooking Fires", publisher: "NFPA", year: "2024", url: "https://example.org" }],
  review: { state: "pending_review" },
});

describe("validateContent", () => {
  it("accepts a well-formed hazard item", () => {
    expect(validateContent([valid()])).toEqual([]);
  });

  it("rejects an item with no sources", () => {
    const item = { ...valid(), sources: [] };
    expect(validateContent([item]).join(" ")).toMatch(/at least one source/i);
  });

  it("rejects a first_aid item with no steps", () => {
    const item = { ...valid(), slug: "firstaid-burns", category: "first_aid", subcategory: "burns", steps: [] };
    expect(validateContent([item]).join(" ")).toMatch(/at least one step/i);
  });

  it("rejects a reviewed item with no reviewer", () => {
    const item = { ...valid(), review: { state: "reviewed" } };
    expect(validateContent([item]).join(" ")).toMatch(/reviewer/i);
  });

  it("rejects duplicate slugs", () => {
    expect(validateContent([valid(), valid()]).join(" ")).toMatch(/duplicate slug/i);
  });

  it("rejects an unknown subcategory", () => {
    const item = { ...valid(), subcategory: "plumbing" };
    expect(validateContent([item]).join(" ")).toMatch(/unknown subcategory/i);
  });

  it("rejects a subcategory whose tab disagrees with its category", () => {
    const item = { ...valid(), slug: "x", subcategory: "burns" };
    expect(validateContent([item]).join(" ")).toMatch(/belongs to/i);
  });

  // `!field` treats a source of empty strings as present, so an item can
  // look cited while citing nothing — exactly the failure this validator
  // exists to catch. A reviewer handed this source has nothing to check.
  it("rejects a source with all-empty fields", () => {
    const item = { ...valid(), sources: [{ title: "", publisher: "", year: "", url: "" }] };
    expect(validateContent([item]).join(" ")).toMatch(/has no title or publisher/i);
  });

  // Same failure mode as above but via a bare object with no fields at all,
  // rather than fields present-but-empty — both must be caught the same way.
  it("rejects sources: [{}]", () => {
    const item = { ...valid(), sources: [{}] };
    expect(validateContent([item]).join(" ")).toMatch(/has no title or publisher/i);
  });

  // A first-aid step with empty title/body still satisfies "at least one
  // step" on length alone, and renders as a bare "1." with nothing after
  // it — worse than no step at all, mid-emergency.
  it("rejects a first_aid step with empty title and body", () => {
    const item = {
      ...valid(),
      slug: "firstaid-burns",
      category: "first_aid",
      subcategory: "burns",
      steps: [{ title: "", body: "" }],
    };
    expect(validateContent([item]).join(" ")).toMatch(/has no title or body/i);
  });

  // `!"   "` is false, so a whitespace-only title passed every check before
  // blank() existed. A title of spaces is not a title.
  it("rejects a whitespace-only title", () => {
    const item = { ...valid(), title: "   " };
    expect(validateContent([item]).join(" ")).toMatch(/missing title/i);
  });

  // Guards against over-tightening in the other direction: a printed
  // GHS/GNFS/WHO standard may have no public URL, and requiring one would
  // push an author toward inventing a link, which the project forbids
  // outright. url must stay optional.
  it("accepts a valid item whose source has no url", () => {
    const item = {
      ...valid(),
      sources: [{ title: "Home Cooking Fires", publisher: "NFPA", year: "2024" }],
    };
    expect(validateContent([item])).toEqual([]);
  });
});

describe("the shipped content file", () => {
  const items = JSON.parse(fs.readFileSync(CONTENT, "utf8"));

  it("passes validation", () => {
    expect(validateContent(items)).toEqual([]);
  });

  // The validator deliberately tolerates an empty content_hash: it means
  // "the generator has not run yet", which is a legitimate state for a
  // freshly authored item. What it must never tolerate is a NON-empty hash
  // that disagrees with the text, because that is a stale hash masquerading
  // as a current one. Task 5 adds the stricter check, once the generator
  // guarantees every hash is populated.
  it("has no stale content_hash", () => {
    for (const item of items) {
      if (item.content_hash) {
        expect(item.content_hash).toBe(contentHash(item));
      }
    }
  });

  it("ships nothing claiming to be reviewed without provenance", () => {
    for (const item of items) {
      if (item.review.state === "reviewed") {
        expect(item.review.reviewer_name).toBeTruthy();
        expect(item.review.reviewed_at).toBeTruthy();
        expect(item.review.content_hash).toBeTruthy();
      }
    }
  });
});
