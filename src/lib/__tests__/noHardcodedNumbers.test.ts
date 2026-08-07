import * as fs from "node:fs";
import * as path from "node:path";

// src/lib/__tests__ -> src/lib -> src
const SRC_DIR = path.resolve(__dirname, "..", "..");
const SELF = path.resolve(__dirname, "noHardcodedNumbers.test.ts");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * A previous review shipped `tel:192` as a hardcoded literal on two screens
 * and a plan-verification grep that only matched numbers starting with `0`
 * passed clean over both of them, because a bare `192` never starts with a
 * `0`. This test is the cheap mitigation: it inspects source text directly,
 * so it does not care what a screen imports or how a human enumerated the
 * dial sites — it only cares whether "tel:" is ever followed by a literal
 * digit instead of an interpolated expression.
 */
describe("no hardcoded tel: numbers", () => {
  it("requires every dial site to interpolate a variable", () => {
    const files = walk(SRC_DIR).filter((f) => f !== SELF);
    const offenses: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        // "tel:" followed immediately by a digit is a literal phone number.
        // "tel:${...}" is an interpolation and is never flagged, because the
        // character right after "tel:" there is "$", not a digit.
        if (/tel:\d/.test(line)) {
          offenses.push(
            `${path.relative(SRC_DIR, file)}:${index + 1}: ${line.trim()}`
          );
        }
      });
    }

    if (offenses.length > 0) {
      throw new Error(
        "Found hardcoded tel: phone number literal(s). Every dial site must " +
          "interpolate its number from dialTargets() or from " +
          "NATIONAL_EMERGENCY_PHONE (src/lib/stationTypes.ts) — never a " +
          "literal digit after \"tel:\". Offending line(s):\n" +
          offenses.join("\n")
      );
    }
  });
});
