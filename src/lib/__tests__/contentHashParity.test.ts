import fs from "fs";
import path from "path";

// Build-time module: Node-only, uses node:crypto. Never imported by app source.
import { contentHash } from "../../../scripts/contentHash.mjs";

// The fixtures are canonical in the sibling api repo. app must still build
// and test on its own, so a missing sibling skips the parity block loudly
// rather than failing the suite.
const FIXTURES = path.resolve(__dirname, "../../../../api/testdata/content-hash-fixtures.json");
const HAS_FIXTURES = fs.existsSync(FIXTURES);

type Fixture = {
  name: string;
  input: Record<string, unknown>;
  expected: string;
};

const fixtures: Fixture[] = HAS_FIXTURES
  ? JSON.parse(fs.readFileSync(FIXTURES, "utf8"))
  : [];

if (!HAS_FIXTURES) {
  console.warn(
    `[contentHashParity] SKIPPED — no fixtures at ${FIXTURES}. ` +
      `Go/Node hash parity is UNVERIFIED in this run. Clone the api repo alongside app to check it.`
  );
}

const describeParity = HAS_FIXTURES ? describe : describe.skip;

describeParity("content hash parity with the Go implementation", () => {
  it("loads fixtures", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  // it.each throws on an empty table, so guard the table itself.
  it.each(HAS_FIXTURES ? fixtures.map((f) => [f.name, f] as const) : [["skipped", null] as const])(
    "%s",
    (_name, f) => {
      if (!f) return;
      expect(contentHash(f.input)).toBe(f.expected);
    }
  );

  // These two codepoints are where Go's unicode.IsSpace and JavaScript's \s
  // disagree. Both must be preserved as content, not collapsed.
  it("preserves U+0085 and U+FEFF as content", () => {
    const plain = contentHash({ title: "a b" });
    expect(contentHash({ title: "ab" })).not.toBe(plain);
    expect(contentHash({ title: "a﻿b" })).not.toBe(plain);
  });

  it("treats absent and empty fields identically", () => {
    expect(contentHash({})).toBe(
      contentHash({ slug: "", title: "", summary: "", body: "", steps: [], sources: [] })
    );
  });
});

describe("build-time boundary", () => {
  it("is not imported by any app source file", () => {
    const srcDir = path.resolve(__dirname, "../..");
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.tsx?$/.test(entry.name) && !full.includes("__tests__")) {
          if (fs.readFileSync(full, "utf8").includes("contentHash.mjs")) {
            offenders.push(full);
          }
        }
      }
    };

    walk(srcDir);
    expect(offenders).toEqual([]);
  });
});
