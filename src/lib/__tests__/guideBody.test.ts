import { parseGuideBody, type GuideBlock } from "../guideBody";
import bundled from "../../data/safety-content.bundled.json";

type Bullet = Extract<GuideBlock, { kind: "bullet" }>;
type Heading = Extract<GuideBlock, { kind: "heading" }>;

const isBullet = (b: GuideBlock): b is Bullet => b.kind === "bullet";
const isHeading = (b: GuideBlock): b is Heading => b.kind === "heading";

const BODY = [
  "Fire spreads fast. Once it takes hold you may have a minute or two.",
  "",
  "Reduce the risk:",
  "",
  "- Keep your space clear of waste paper.",
  "- Let a qualified electrician do all electrical work.",
  "",
  "If a pan catches fire:",
  "",
  "- Turn off the heat and slide the lid over the pan.",
  "",
  "Charcoal gives off carbon monoxide as it burns.",
].join("\n");

describe("parseGuideBody", () => {
  it("reads the opening paragraph as the lead, and later ones as paragraphs", () => {
    const blocks = parseGuideBody(BODY);
    expect(blocks[0]).toEqual({
      kind: "lead",
      text: "Fire spreads fast. Once it takes hold you may have a minute or two.",
    });
    expect(blocks[blocks.length - 1]).toEqual({
      kind: "paragraph",
      text: "Charcoal gives off carbon monoxide as it burns.",
    });
  });

  it("strips the trailing colon from a heading", () => {
    expect(parseGuideBody(BODY)[1]).toEqual({
      kind: "heading",
      text: "Reduce the risk",
      crisis: false,
    });
  });

  it("strips the dash from a bullet", () => {
    const blocks = parseGuideBody(BODY);
    expect(blocks[2]).toEqual({
      kind: "bullet",
      text: "Keep your space clear of waste paper.",
      crisis: false,
    });
    // The literal "- " must never reach the renderer.
    expect(blocks.every((b) => !b.text.startsWith("- "))).toBe(true);
  });

  it('marks a heading that opens with "If " as crisis', () => {
    expect(
      parseGuideBody(BODY).find((b) => isHeading(b) && b.text === "If a pan catches fire")
    ).toEqual({
      kind: "heading",
      text: "If a pan catches fire",
      crisis: true,
    });
  });

  it("propagates crisis from a heading onto its own bullets only", () => {
    const bullets = parseGuideBody(BODY).filter(isBullet);
    expect(bullets.map((b) => b.crisis)).toEqual([false, false, true]);
  });

  it("does not tint the prose that follows a crisis section", () => {
    // Every crisis section in the shipped content is followed by trailing
    // prose that changes the subject (carbon monoxide, extinguisher caveats,
    // scope disclaimers). Emergency emphasis must not bleed onto it.
    const last = parseGuideBody(BODY).pop()!;
    expect(last.kind).toBe("paragraph");
    expect(last).not.toHaveProperty("crisis");
  });

  it('does not treat a heading that merely contains "if" as crisis', () => {
    expect(
      parseGuideBody("Call an electrician or your landlord if you notice any of these:")[0]
    ).toEqual({
      kind: "heading",
      text: "Call an electrician or your landlord if you notice any of these",
      crisis: false,
    });
  });

  it("resets crisis at the next ordinary heading", () => {
    const blocks = parseGuideBody(
      ["If fire breaks out:", "- Never use the lift.", "Prevent it:", "- Keep exits clear."].join(
        "\n"
      )
    );
    expect(blocks.filter(isBullet).map((b) => b.crisis)).toEqual([true, false]);
  });
});

describe("parseGuideBody degradation", () => {
  // The body format is validated nowhere: contentValidate.mjs checks only that
  // it is non-blank, and isAcceptable never inspects it. OTA content can be
  // anything, so every unrecognised shape has to land somewhere sensible.

  it("renders an unstructured body as a lead and paragraphs", () => {
    expect(parseGuideBody("One line.\n\nTwo lines.")).toEqual([
      { kind: "lead", text: "One line." },
      { kind: "paragraph", text: "Two lines." },
    ]);
  });

  it("returns nothing for an empty body", () => {
    expect(parseGuideBody("")).toEqual([]);
    expect(parseGuideBody("   \n\n  ")).toEqual([]);
  });

  it("drops a dash with no text after it", () => {
    expect(parseGuideBody("Intro.\n- \n-")).toEqual([{ kind: "lead", text: "Intro." }]);
  });

  it("drops a bare colon rather than emitting an empty heading", () => {
    expect(parseGuideBody("Intro.\n:")).toEqual([{ kind: "lead", text: "Intro." }]);
  });

  it("survives a body that is one unbroken paragraph", () => {
    expect(parseGuideBody("Just the one sentence and nothing else.")).toEqual([
      { kind: "lead", text: "Just the one sentence and nothing else." },
    ]);
  });
});

/**
 * The mitigation for parsing content the pipeline does not validate. If a
 * heading is reworded, this fails loudly here instead of the emphasis quietly
 * vanishing on a screen nobody is looking at.
 */
describe("crisis classification across the shipped content", () => {
  // Locked deliberately, not derived. The point is that a content edit has to
  // come back through this list.
  const EXPECTED_CRISIS = [
    "If a pan catches fire",
    "If fire breaks out",
    "If a bush or grass fire starts near you",
    // hazard-flames. Both are read while something is already wrong: one
    // while an appliance is burning badly, one while choosing how to fight
    // a fire. Adding them here is the pin working as intended, not a
    // workaround for it.
    "If the flame has changed",
    "If you are choosing how to put a fire out",
  ];

  const headings = (bundled as { body: string }[])
    .flatMap((item) => parseGuideBody(item.body))
    .filter(isHeading);

  it("marks exactly the three response sections", () => {
    expect(
      headings
        .filter((h) => h.crisis)
        .map((h) => h.text)
        .sort()
    ).toEqual([...EXPECTED_CRISIS].sort());
  });

  it("leaves every other heading unmarked", () => {
    const plain = headings.filter((h) => !h.crisis).map((h) => h.text);
    expect(plain).toContain("Reduce the risk");
    expect(plain).toContain("Be ready to get out");
    expect(plain).toContain("Call an electrician or your landlord if you notice any of these");
    expect(plain.some((t) => EXPECTED_CRISIS.includes(t))).toBe(false);
  });
});
