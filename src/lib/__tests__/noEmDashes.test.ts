import fs from "fs";
import path from "path";

/**
 * No em dash in anything a user reads.
 *
 * A standing house rule from the project owner, pinned here because a
 * one-time cleanup does not survive the next guide someone writes. An em dash
 * is a punctuation mark most readers meet only in edited prose, and this app's
 * text is read on a small screen, often in a hurry, frequently by someone
 * reading English as a second or third language. The clause it introduces
 * almost always reads better as its own sentence, a colon, or a comma.
 *
 * Two places are deliberately exempt, and both are records rather than copy:
 *
 *   - `open_questions` in the content file. That text is addressed to the
 *     clinical reviewer, and `fromJson` in safetyContent.ts deliberately does
 *     not read it into the app (see the comment there). Rewriting a
 *     reviewer's own note about an ambiguity would be editing the wrong
 *     document.
 *   - `sources[].title`. These are the titles of external documents as
 *     published — "Control and Prevention of Bushfires Act, 1990
 *     (P.N.D.C.L. 229) — sections 1, 2, 6, 8, 11 and 12" is a citation, and
 *     silently altering a citation is worse than the punctuation. Nothing
 *     renders them anyway: badgeText cites `publisher`.
 */
const EM_DASH = "—";

const SRC = path.resolve(__dirname, "..", "..");
const CONTENT = path.resolve(SRC, "data", "safety-content.bundled.json");
const SELF = path.resolve(__dirname, "noEmDashes.test.ts");

type Item = {
  slug: string;
  title: string;
  summary: string;
  body: string;
  steps: { title: string; body: string }[];
};

describe("no em dashes in the safety content a reader sees", () => {
  const items: Item[] = JSON.parse(fs.readFileSync(CONTENT, "utf8"));

  it("has content to check", () => {
    expect(items.length).toBeGreaterThan(0);
  });

  it("finds none in any rendered field", () => {
    const offenses: string[] = [];
    for (const item of items) {
      const fields: [string, string][] = [
        ["title", item.title],
        ["summary", item.summary],
        ["body", item.body],
      ];
      item.steps.forEach((step, i) => {
        fields.push([`step ${i + 1} title`, step.title], [`step ${i + 1} body`, step.body]);
      });
      for (const [name, value] of fields) {
        if (typeof value === "string" && value.includes(EM_DASH)) {
          offenses.push(`${item.slug} → ${name}`);
        }
      }
    }
    if (offenses.length > 0) {
      throw new Error(
        `Em dash in rendered safety content. Recast the clause as its own ` +
          `sentence, a colon, or a comma:\n  ${offenses.join("\n  ")}`
      );
    }
  });
});

/**
 * The same rule for UI copy, which is read on the same screens by the same
 * person. Scanned as source text, so it cannot distinguish a string the user
 * sees from one they do not — comments are stripped first (they are where
 * this codebase does most of its explaining, and prose written for the next
 * engineer is not user-facing copy), and what is left is code, where a
 * literal em dash is almost always a sentence someone will read.
 */
describe("no em dashes in UI copy", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") walk(full, out);
      } else if (/\.tsx?$/.test(entry.name) && full !== SELF) {
        out.push(full);
      }
    }
    return out;
  }

  /**
   * Blanks out block comments, JSDoc and line comments, all of which may say
   * what they like.
   *
   * Blanks rather than deletes: a stripped comment still has to occupy its
   * lines, or every offence after the first comment in a file is reported at
   * the wrong line number and the message sends you hunting through a file
   * for text that is not there.
   */
  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, (block) => "\n".repeat((block.match(/\n/g) ?? []).length))
      .split("\n")
      .map((line) => (line.trim().startsWith("//") ? "" : line))
      .join("\n");
  }

  const files = walk(path.join(SRC, "screens")).concat(walk(path.join(SRC, "components")));

  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("finds none outside comments", () => {
    const offenses: string[] = [];
    for (const file of files) {
      stripComments(fs.readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          if (line.includes(EM_DASH)) {
            offenses.push(`${path.relative(SRC, file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
          }
        });
    }
    if (offenses.length > 0) {
      throw new Error(
        `Em dash in UI copy. Recast the clause as its own sentence, a colon, ` +
          `or a comma:\n  ${offenses.join("\n  ")}`
      );
    }
  });
});
