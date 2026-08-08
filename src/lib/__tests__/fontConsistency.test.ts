import fs from "fs";
import path from "path";
import { typography } from "../../theme/typography";

/**
 * Font drift is silent. A new TextInput, or a label a navigator renders
 * itself, simply inherits whatever font the device is set to — nothing throws,
 * nothing fails to compile, and it only shows up if someone happens to open
 * the app on a handset with a replaced system font. That is how the whole app
 * came to render in a handwriting face on Android.
 *
 * These scan the source instead of the render tree, because there are no
 * component tests here.
 */

const SRC = path.join(__dirname, "..", "..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

const files = walk(SRC);
const rel = (f: string) => path.relative(SRC, f);

/**
 * theme/typography.ts is the definition table these rules are derived from,
 * not a consumer of them. Its `fontWeight` entries are the selector that
 * `Text` reads to choose a family and then strips before styling, so they are
 * the one legitimate place the two appear without a family beside them.
 */
const consumers = files.filter((f) => rel(f) !== "theme/typography.ts");

describe("font consistency", () => {
  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("names a real bundled family for every weight", () => {
    // 'system-font' is not a family on either platform. It was here for months
    // behind a comment claiming it resolved to San Francisco and Roboto.
    for (const [weight, family] of Object.entries(typography.fonts)) {
      expect(`${weight}:${family}`).toMatch(/:Inter_(400|500|600|700)\w+$/);
    }
  });

  it("never leaves 'system-font' in the tree", () => {
    const bad = files.filter((f) =>
      fs.readFileSync(f, "utf8").includes("system-font")
    );
    expect(bad.map(rel)).toEqual([]);
  });

  it("pairs every fontSize with a fontFamily", () => {
    // A style block declaring fontSize but no fontFamily is a surface that
    // bypasses the styled Text component — a TextInput, or a navigator label.
    // Emoji-only styles are exempt: they have no text face to pick.
    const offenders: string[] = [];
    for (const f of consumers) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/\{[^{}]*\bfontSize\s*:[^{}]*\}/g)) {
        const block = m[0];
        if (block.includes("fontFamily")) continue;
        const size = Number(block.match(/fontSize:\s*(\d+)/)?.[1] ?? 0);
        if (size >= 40) continue; // emoji glyph sizing, not copy
        offenders.push(`${rel(f)} → ${block.replace(/\s+/g, " ").trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not set fontWeight beside a bundled family", () => {
    // Each Inter weight is its own family. Declaring both makes Android
    // synthesise a faux-bold over the real bold face.
    const offenders: string[] = [];
    for (const f of consumers) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/\{[^{}]*\bfontFamily\s*:[^{}]*\}/g)) {
        if (/\bfontWeight\s*:/.test(m[0])) {
          offenders.push(`${rel(f)} → ${m[0].replace(/\s+/g, " ").trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
