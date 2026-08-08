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
 * These scan source text, because there are no component tests here. Scanning
 * text has a specific weakness worth naming: a rule expressed as "these two
 * properties must not appear in the same {} literal" cannot see
 * `style={[styles.row, isBold && { fontWeight: "bold" }]}`, which is this
 * codebase's dominant idiom and reproduces the exact bug. So the fontWeight
 * rule below is a blanket ban rather than a co-location check — nothing in
 * app code has any business setting fontWeight once each weight is its own
 * bundled family.
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
const read = (f: string) => fs.readFileSync(f, "utf8");

/**
 * theme/typography.ts is the definition table these rules are derived from,
 * not a consumer of them. Its `fontWeight` entries are the selector `Text`
 * reads to choose a family and then strips before styling.
 *
 * Scoped to the `sizes` map rather than exempting the whole file, so anything
 * else added there is still checked.
 */
const TABLE = "theme/typography.ts";
function scannable(f: string): string {
  const src = read(f);
  if (rel(f) !== TABLE) return src;
  return src.replace(/sizes:\s*\{[\s\S]*?\n {2}\},/, "sizes: {},");
}

/**
 * Styles that size a glyph rather than copy — an emoji has no text face to
 * pick, so demanding a fontFamily beside it would mean adding a meaningless
 * one. Marked explicitly at the call site instead of inferred from font size:
 * a size threshold waves through a genuine regression styled large (a hero
 * "192" set inline at 48) and trips on a small legitimate emoji.
 */
const EXEMPT = "font-exempt";

describe("font consistency", () => {
  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("names a real bundled family for every weight", () => {
    for (const [weight, family] of Object.entries(typography.fonts)) {
      expect(`${weight}:${family}`).toMatch(/:Inter_(400|500|600|700)\w+$/);
    }
  });

  it("never leaves a placeholder family name in the tree", () => {
    const bad = files.filter((f) => read(f).includes("system-font"));
    expect(bad.map(rel)).toEqual([]);
  });

  it("pairs every fontSize with a fontFamily", () => {
    // Per style block, not per line — the family usually sits on the next
    // line. A block declaring a size with no family is a surface that bypasses
    // the shared Text component: a TextInput, or a label a navigator draws
    // itself. Either give it a family or mark it font-exempt.
    const offenders: string[] = [];
    for (const f of files) {
      for (const m of scannable(f).matchAll(/\{[^{}]*\bfontSize\s*:[^{}]*\}/g)) {
        const block = m[0];
        if (block.includes("fontFamily") || block.includes(EXEMPT)) continue;
        offenders.push(`${rel(f)} → ${block.replace(/\s+/g, " ").trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never sets fontWeight in app code", () => {
    // Blanket, so it still fires when the weight is split into a conditional
    // style object away from the family it would fight with.
    const offenders: string[] = [];
    for (const f of files) {
      for (const line of scannable(f).split("\n")) {
        if (/\bfontWeight\s*:/.test(line) && !line.trim().startsWith("//")) {
          offenders.push(`${rel(f)} → ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("imports font faces by subpath, never from the package root", () => {
    // The root index.js require()s all 18 faces at module load and Metro does
    // not tree-shake them out: importing from it ships 6.0 MB of TTF to
    // register 1.3 MB. Verified against `expo export`, not assumed.
    const offenders = files.filter((f) =>
      /from\s+["']@expo-google-fonts\/inter["']/.test(read(f))
    );
    expect(offenders.map(rel)).toEqual([]);
  });
});
