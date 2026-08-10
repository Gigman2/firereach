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
    // React Native's real entry points — App.tsx, index.ts — live at the app
    // repo root, not under src/. An import added there would break the app
    // at runtime (React Native has no node:crypto) while sailing straight
    // past a scan that only descends from src/, which is exactly the
    // mistake this test exists to catch.
    const repoRoot = path.resolve(__dirname, "../../..");

    // Not just .tsx?: nothing under src/ is .js/.jsx/.mjs today, but the
    // guard should not depend on that staying true.
    const CODE_FILE = /\.(mjs|jsx?|tsx?)$/;
    const offenders: string[] = [];

    // Match real import/require specifiers, not any mention of the filename.
    // A whole-file substring scan flags comments that merely name the module —
    // which already forced one comment to be reworded — and that is how a guard
    // stops being trusted.
    const IMPORTS_HASH =
      /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'][^"']*contentHash\.mjs["']/;

    const checkFile = (full: string) => {
      if (IMPORTS_HASH.test(fs.readFileSync(full, "utf8"))) {
        offenders.push(full);
      }
    };

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (CODE_FILE.test(entry.name) && !full.includes("__tests__")) {
          checkFile(full);
        }
      }
    };

    walk(srcDir);

    // Root entry points only — not a recursive walk of repoRoot, which
    // would also have to dodge node_modules, android/, ios/, scripts/, etc.
    for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) continue;
      const full = path.join(repoRoot, entry.name);
      if (CODE_FILE.test(entry.name)) {
        checkFile(full);
      }
    }

    expect(offenders).toEqual([]);
  });
});
