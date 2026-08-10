import fs from "fs";
import path from "path";
import { toSql } from "../../../scripts/build-safety-content-seed.mjs";
import { contentHash } from "../../../scripts/contentHash.mjs";

const item = {
  slug: "hazard-cooking",
  category: "hazard",
  subcategory: "cooking",
  title: "Cooking Fire Safety",
  summary: "Kitchen fires start fast.",
  body: "Never leave cooking unattended. Ampe's rule: watch the pot.",
  steps: [],
  tags: ["cooking"],
  contextual_trigger: null,
  sources: [{ title: "S", publisher: "P", year: "2024", url: "https://example.org" }],
  // Authored items ship with content_hash: "" (see safety-content.bundled.json);
  // validateContent's stale-hash check only fires on a truthy, mismatched hash,
  // so a placeholder like "deadbeef" here would trip it for reasons unrelated
  // to what these tests are actually checking.
  content_hash: "",
  review: { state: "pending_review" },
};

describe("toSql", () => {
  it("escapes single quotes so apostrophes cannot break the statement", () => {
    const sql = toSql([item]);
    expect(sql).toContain("Ampe''s rule");
    expect(sql).not.toContain("Ampe's rule");
  });

  it("writes NULL, not an empty string, for an unreviewed item", () => {
    const sql = toSql([item]);
    expect(sql).toMatch(/NULL,\s*--\s*reviewer_name/);
  });

  it("is idempotent — safe to re-run against a seeded database", () => {
    expect(toSql([item])).toContain("ON CONFLICT (slug) DO UPDATE");
  });

  it("refuses to emit SQL for invalid content", () => {
    const bad = { ...item, sources: [] };
    expect(() => toSql([bad])).toThrow(/at least one source/i);
  });
});

describe("the shipped content file, after generation", () => {
  const items = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../data/safety-content.bundled.json"), "utf8")
  );

  // Task 4 could only assert "no STALE hash", because items are authored with
  // content_hash empty and the generator fills it. Once the generator has run,
  // the stronger property holds and is worth pinning: every item carries a
  // populated hash that matches its text. An empty hash here means someone
  // edited the JSON and skipped `npm run build:content-seed`.
  it("has a populated, correct content_hash on every item", () => {
    for (const item of items) {
      expect(item.content_hash).toBeTruthy();
      expect(item.content_hash).toBe(contentHash(item));
    }
  });
});
