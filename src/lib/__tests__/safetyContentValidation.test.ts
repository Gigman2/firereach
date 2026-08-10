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
});

describe("the shipped content file", () => {
  const items = JSON.parse(fs.readFileSync(CONTENT, "utf8"));

  it("passes validation", () => {
    expect(validateContent(items)).toEqual([]);
  });

  it("has a correct content_hash on every item", () => {
    for (const item of items) {
      expect(item.content_hash).toBe(contentHash(item));
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
