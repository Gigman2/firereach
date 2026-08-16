/**
 * A guide's `body` is plain text carrying a consistent micro-format: an
 * opening paragraph, then headings ending in a colon, bullet lines opening
 * with "- ", and closing prose. This turns that into typed blocks so
 * GuideBody can set each one differently, instead of the screen pouring the
 * whole string into a single <Text> and rendering the source's dashes
 * literally.
 *
 * Nothing validates the format. contentValidate.mjs checks only that `body`
 * is non-blank and isAcceptable never inspects it, so an OTA payload can put
 * arbitrary text here. Every branch below therefore falls through to
 * `paragraph` rather than throwing: the worst outcome for unrecognised
 * content is that it reads as prose, which is exactly what all of it did
 * before this module existed.
 */
export type GuideBlock =
  | { kind: "lead"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string; crisis: boolean }
  | { kind: "bullet"; text: string; crisis: boolean };

/** "- " and any run of space after it. The dash never reaches the screen. */
const BULLET = /^-\s+/;

/**
 * A line that is nothing but dashes. Not a bullet (there is no text to carry)
 * and not prose (it would set a lone hyphen as a paragraph), so it is simply
 * dropped. Deliberately separate from BULLET rather than loosening BULLET's
 * `\s+` to `\s*`, which would swallow the leading hyphen off a genuine line
 * of prose that happens to start with one.
 */
const EMPTY_BULLET = /^-+$/;

/**
 * A section telling the reader what to do while it is happening, rather than
 * how to stop it happening. Anchored to the start on purpose: "Call an
 * electrician or your landlord if you notice any of these:" contains "if" and
 * is not one of these, while "If a pan catches fire:" is.
 *
 * This reads content the pipeline does not validate, so guideBody.test.ts
 * pins the exact set of headings it classifies across the shipped content —
 * a reworded heading fails there rather than silently losing its emphasis.
 */
const CRISIS = /^if\s/i;

export function parseGuideBody(body: string): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  let seenLead = false;
  let crisis = false;

  for (const raw of (body ?? "").split("\n")) {
    const line = raw.trim();
    if (!line || EMPTY_BULLET.test(line)) continue;

    if (BULLET.test(line)) {
      const text = line.replace(BULLET, "").trim();
      // "- " with nothing after it would render as a lone glyph.
      if (text) blocks.push({ kind: "bullet", text, crisis });
      continue;
    }

    if (line.endsWith(":")) {
      const text = line.slice(0, -1).trim();
      if (!text) continue;
      crisis = CRISIS.test(line);
      blocks.push({ kind: "heading", text, crisis });
      continue;
    }

    // Prose. Deliberately carries no `crisis`: every crisis section in the
    // shipped content is followed by trailing paragraphs that change the
    // subject — carbon monoxide after "If a pan catches fire", an
    // extinguisher caveat after "If fire breaks out", a scope disclaimer
    // after "If a bush or grass fire starts near you" — and emergency
    // emphasis must not bleed onto any of them.
    if (seenLead) {
      blocks.push({ kind: "paragraph", text: line });
    } else {
      seenLead = true;
      blocks.push({ kind: "lead", text: line });
    }
  }

  return blocks;
}
