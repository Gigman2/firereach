# Guide Body Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a safety guide's `body` as structured typography — lead, section headings, and bulleted lists — instead of one undifferentiated block of text, and stop dropping the first-aid `body` entirely.

**Architecture:** A pure parser (`src/lib/guideBody.ts`) turns the plain-text body into a list of typed blocks. A presentational component (`src/components/GuideBody.tsx`) maps blocks to elements. `GuideDetailScreen` renders that component for both categories and keeps no formatting logic of its own. Anything the parser does not recognise falls through to a paragraph, which is what keeps unvalidated OTA content safe.

**Tech Stack:** React Native 0.83 / Expo 55, TypeScript, Jest (`jest-expo`), `react-test-renderer`. Existing in-repo primitives: `src/components/ui/Text.tsx`, `src/theme/ThemeContext.tsx`.

**Spec:** `app/docs/superpowers/specs/2026-08-11-guide-body-typography-design.md`

## Global Constraints

- **All commands run from `/Users/ericabbey/Desktop/Projects/firereach/app`.**
- **This project is not a git repository.** `git rev-parse` fails at the project root. Every task therefore ends with a full-suite verification step in place of a commit. Do not run `git init`.
- **Never write `fontSize` without `fontFamily` in the same style block.** `src/lib/__tests__/fontConsistency.test.ts` scans source text for this and fails the build. Use `Text`'s `variant` prop instead, which carries the family. If a raw size is genuinely needed, the block must contain the marker `font-exempt`.
- **Never write `fontWeight` anywhere in app code.** Same test, blanket ban — each Inter weight is its own bundled family and setting a weight makes Android synthesise a faux-bold on top. Use `Text`'s `weight` prop (`"regular" | "medium" | "semiBold" | "bold"`).
- **Never write `tel:` followed by a literal digit**, in code *or* in comments. `src/lib/__tests__/noHardcodedNumbers.test.ts` scans comment text too.
- **Crisis colour is `theme.emergencyText` / `theme.emergencyBorder`, never `colors.brandPrimary`.** Brand red measures 3.24:1 on the dark background and `colors.brandPrimary` is reserved app-wide for controls that dial.
- Existing suite baseline: **25 suites, 285 tests, all passing.** `npx tsc --noEmit` exits 0.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/guideBody.ts` (create) | Pure parser. Plain text in, `GuideBlock[]` out. No React, no theme. |
| `src/lib/__tests__/guideBody.test.ts` (create) | Parser behaviour, degradation cases, and the bundled-content classification pin. |
| `src/components/GuideBody.tsx` (create) | Presentational. Maps blocks to elements, owns all spacing and colour. |
| `src/screens/guides/GuideDetailScreen.tsx` (modify) | Drops its inline body `<Text>`; renders `<GuideBody>` for both categories. |
| `src/lib/__tests__/guideDetailEmergencyFooter.test.ts` (modify) | Already mounts the screen; gains two rendered-output assertions. |

---

### Task 1: The parser

**Files:**
- Create: `src/lib/guideBody.ts`
- Test: `src/lib/__tests__/guideBody.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseGuideBody(body: string): GuideBlock[]` and the exported type
  `GuideBlock`, a discriminated union on `kind`:
  - `{ kind: "lead"; text: string }`
  - `{ kind: "paragraph"; text: string }`
  - `{ kind: "heading"; text: string; crisis: boolean }`
  - `{ kind: "bullet"; text: string; crisis: boolean }`

  Task 2 switches on `kind` and reads `crisis` off headings and bullets. Note
  that `paragraph` deliberately carries **no** `crisis` field.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/guideBody.test.ts`:

```ts
import { parseGuideBody } from "../guideBody";

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
    const blocks = parseGuideBody(BODY);
    expect(blocks[1]).toEqual({
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

  it("marks a heading that opens with \"If \" as crisis", () => {
    const heading = parseGuideBody(BODY).find(
      (b) => b.kind === "heading" && b.text === "If a pan catches fire"
    );
    expect(heading).toEqual({
      kind: "heading",
      text: "If a pan catches fire",
      crisis: true,
    });
  });

  it("propagates crisis from a heading onto its own bullets only", () => {
    const blocks = parseGuideBody(BODY);
    const bullets = blocks.filter((b) => b.kind === "bullet");
    expect(bullets.map((b) => (b as { crisis: boolean }).crisis)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("does not tint the prose that follows a crisis section", () => {
    // Every crisis section in the shipped content is followed by trailing
    // prose that changes the subject (carbon monoxide, extinguisher caveats,
    // scope disclaimers). Emergency emphasis must not bleed onto it.
    const last = parseGuideBody(BODY).pop()!;
    expect(last.kind).toBe("paragraph");
    expect(last).not.toHaveProperty("crisis");
  });

  it("does not treat a heading that merely contains \"if\" as crisis", () => {
    const [heading] = parseGuideBody(
      "Call an electrician or your landlord if you notice any of these:"
    );
    expect(heading).toEqual({
      kind: "heading",
      text: "Call an electrician or your landlord if you notice any of these",
      crisis: false,
    });
  });

  it("resets crisis at the next ordinary heading", () => {
    const blocks = parseGuideBody(
      ["If fire breaks out:", "- Never use the lift.", "Prevent it:", "- Keep exits clear."].join("\n")
    );
    expect(blocks.filter((b) => b.kind === "bullet").map((b) => (b as { crisis: boolean }).crisis))
      .toEqual([true, false]);
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
    expect(parseGuideBody("Intro.\n- \n-")).toEqual([
      { kind: "lead", text: "Intro." },
    ]);
  });

  it("drops a bare colon rather than emitting an empty heading", () => {
    expect(parseGuideBody("Intro.\n:")).toEqual([
      { kind: "lead", text: "Intro." },
    ]);
  });

  it("survives a body that is one unbroken paragraph", () => {
    const blocks = parseGuideBody("Just the one sentence and nothing else.");
    expect(blocks).toEqual([
      { kind: "lead", text: "Just the one sentence and nothing else." },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx jest guideBody`
Expected: FAIL — `Cannot find module '../guideBody'`.

- [ ] **Step 3: Write the parser**

Create `src/lib/guideBody.ts`:

```ts
/**
 * A guide's `body` is plain text carrying a consistent micro-format: an
 * opening paragraph, then headings ending in a colon, bullet lines opening
 * with "- ", and closing prose. This turns that into typed blocks so
 * GuideBody can set each one differently.
 *
 * Nothing validates the format. contentValidate.mjs checks only that `body`
 * is non-blank and isAcceptable never inspects it, so an OTA payload can put
 * arbitrary text here. Every branch below therefore has a fall-through to
 * `paragraph` rather than a throw: the worst outcome for unrecognised content
 * is that it reads as prose, which is exactly what it did before this module
 * existed.
 */
export type GuideBlock =
  | { kind: "lead"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string; crisis: boolean }
  | { kind: "bullet"; text: string; crisis: boolean };

/** "- " and any run of space after it. The dash never reaches the screen. */
const BULLET = /^-\s+/;

/**
 * A section telling the reader what to do while it is happening, rather than
 * how to stop it happening. Anchored to the start on purpose: "Call an
 * electrician or your landlord if you notice any of these:" contains "if" and
 * is not one of these, while "If a pan catches fire:" is.
 */
const CRISIS = /^if\s/i;

export function parseGuideBody(body: string): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  let seenLead = false;
  let crisis = false;

  for (const raw of (body ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;

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
    // subject, and emergency emphasis must not bleed onto them.
    if (seenLead) {
      blocks.push({ kind: "paragraph", text: line });
    } else {
      seenLead = true;
      blocks.push({ kind: "lead", text: line });
    }
  }

  return blocks;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx jest guideBody`
Expected: PASS, 13 tests.

- [ ] **Step 5: Pin the classification against the shipped content**

This is the mitigation for parsing content the pipeline does not validate: if
a heading is reworded, this fails loudly in CI instead of the red quietly
vanishing. Append to `src/lib/__tests__/guideBody.test.ts`:

```ts
import bundled from "../../data/safety-content.bundled.json";

describe("crisis classification across the shipped content", () => {
  // Locked deliberately, not derived. The point is that a content edit has to
  // come back through this list.
  const EXPECTED_CRISIS = [
    "If a pan catches fire",
    "If fire breaks out",
    "If a bush or grass fire starts near you",
  ];

  const headings = (bundled as { body: string }[])
    .flatMap((item) => parseGuideBody(item.body))
    .filter((b): b is Extract<GuideBlock, { kind: "heading" }> => b.kind === "heading");

  it("marks exactly the three response sections", () => {
    expect(headings.filter((h) => h.crisis).map((h) => h.text).sort()).toEqual(
      [...EXPECTED_CRISIS].sort()
    );
  });

  it("leaves every other heading unmarked", () => {
    const plain = headings.filter((h) => !h.crisis).map((h) => h.text);
    expect(plain).toContain("Reduce the risk");
    expect(plain).toContain("Be ready to get out");
    expect(plain).toContain("Call an electrician or your landlord if you notice any of these");
    expect(plain.some((t) => EXPECTED_CRISIS.includes(t))).toBe(false);
  });
});
```

Add `GuideBlock` to the import at the top of the file:

```ts
import { parseGuideBody, type GuideBlock } from "../guideBody";
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npx jest guideBody`
Expected: PASS, 15 tests.

- [ ] **Step 7: Verify nothing else moved**

Run: `npx tsc --noEmit && npx jest`
Expected: `tsc` exits 0. Jest: 26 suites, 300 tests, all passing.

---

### Task 2: The renderer

**Files:**
- Create: `src/components/GuideBody.tsx`

**Interfaces:**
- Consumes: `parseGuideBody`, `GuideBlock` from Task 1; `Text` from `src/components/ui/Text`; `useTheme` from `src/theme/ThemeContext`.
- Produces: `export const GuideBody = ({ body }: { body: string }) => JSX.Element`. Task 3 renders `<GuideBody body={item.body} />`.

- [ ] **Step 1: Write the component**

There is no unit test for this file on its own — the repo has no component-test
convention beyond mounting whole screens, and Task 3 asserts its output through
the screen. Create `src/components/GuideBody.tsx`:

```tsx
import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./ui/Text";
import { useTheme } from "../theme/ThemeContext";
import { parseGuideBody } from "../lib/guideBody";

type Props = { body: string };

/**
 * A guide's prose, set as structure rather than as one block of text.
 *
 * Everything about how a block looks lives here; everything about what a
 * block *is* lives in parseGuideBody. GuideDetailScreen knows neither.
 */
export const GuideBody = ({ body }: Props) => {
  const { theme } = useTheme();
  const blocks = useMemo(() => parseGuideBody(body), [body]);

  return (
    <View>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "lead":
            return (
              <Text key={index} variant="bodyLarge" style={styles.lead}>
                {block.text}
              </Text>
            );

          case "paragraph":
            return (
              <Text
                key={index}
                variant="bodyMedium"
                color={theme.textSecondary}
                style={[
                  styles.paragraph,
                  // Prose after a list is a change of subject in every guide
                  // that has it, so it gets more air than prose after prose.
                  blocks[index - 1]?.kind === "bullet" && styles.paragraphAfterList,
                ]}
              >
                {block.text}
              </Text>
            );

          case "heading":
            return (
              <View
                key={index}
                style={[styles.heading, index === 0 && styles.headingFirst]}
              >
                <Text
                  variant="caption"
                  weight="bold"
                  color={block.crisis ? theme.emergencyText : theme.textPrimary}
                  style={styles.headingText}
                >
                  {/* Uppercased here, not in the content: the source text has
                      to stay readable to the clinician reviewing it. */}
                  {block.text.toUpperCase()}
                </Text>
                <View
                  style={[
                    styles.headingRule,
                    {
                      backgroundColor: block.crisis
                        ? theme.emergencyBorder
                        : theme.border,
                    },
                  ]}
                />
              </View>
            );

          case "bullet":
            return (
              <View key={index} style={styles.bullet}>
                {/* A real glyph in its own column. The old rendering printed
                    the source's literal "- " inline, so a wrapped bullet
                    resumed under the dash instead of under the text. */}
                <Text
                  variant="bodyMedium"
                  color={block.crisis ? theme.emergencyText : theme.textTertiary}
                  style={styles.bulletGlyph}
                >
                  •
                </Text>
                <Text
                  variant="bodyMedium"
                  color={theme.textSecondary}
                  style={styles.bulletText}
                >
                  {block.text}
                </Text>
              </View>
            );
        }
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  /**
   * No marginBottom: the following block's own top margin sets the gap, so a
   * lead followed by a heading does not stack two spacings on top of each
   * other.
   */
  lead: {
    lineHeight: 28,
  },
  paragraph: {
    lineHeight: 24,
    marginTop: 16,
  },
  paragraphAfterList: {
    marginTop: 24,
  },
  heading: {
    marginTop: 28,
    marginBottom: 12,
  },
  /** Nothing above it to separate from. */
  headingFirst: {
    marginTop: 0,
  },
  headingText: {
    letterSpacing: 0.8,
  },
  headingRule: {
    height: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  bullet: {
    flexDirection: "row",
    marginTop: 10,
  },
  /**
   * Fixed width, and the same lineHeight as the text beside it so the glyph
   * sits on the first line's baseline rather than floating above it.
   */
  bulletGlyph: {
    width: 18,
    lineHeight: 24,
  },
  bulletText: {
    flex: 1,
    lineHeight: 24,
  },
});
```

- [ ] **Step 2: Verify it compiles and breaks no style rule**

Run: `npx tsc --noEmit && npx jest fontConsistency`
Expected: `tsc` exits 0; `fontConsistency` passes. The component sets no
`fontSize` and no `fontWeight` — sizes come from `Text`'s `variant`, weight
from its `weight` prop.

- [ ] **Step 3: Verify nothing else moved**

Run: `npx jest`
Expected: 26 suites, 300 tests, all passing.

---

### Task 3: Wire it into the screen

**Files:**
- Modify: `src/screens/guides/GuideDetailScreen.tsx`
- Modify: `src/lib/__tests__/guideDetailEmergencyFooter.test.ts`

**Interfaces:**
- Consumes: `GuideBody` from Task 2.
- Produces: nothing further.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/guideDetailEmergencyFooter.test.ts`, inside a new
`describe` at the end of the file. `renderDetail` and `mockNearest` already
exist in that file:

```ts
describe("GuideDetailScreen body", () => {
  afterEach(() => mockNearest.mockReset());

  it("renders bullets as glyphs, never as the source's literal dash", () => {
    mockNearest.mockReturnValue(null);
    const text = renderDetail("hazard-home");

    expect(text).toContain("•");
    expect(text).not.toContain("- Fit an alarm");
    expect(text).toContain("Fit an alarm in every bedroom");
  });

  it("sets section headings apart, uppercased and without their colon", () => {
    mockNearest.mockReturnValue(null);
    const text = renderDetail("hazard-home");

    expect(text).toContain("REDUCE THE RISK");
    expect(text).not.toContain("Reduce the risk:");
  });

  it("shows the first-aid lead that the screen used to drop", () => {
    // GuideDetailScreen branched `isFirstAid ? steps : body`, so all four
    // first-aid guides had a body paragraph that never reached the screen.
    mockNearest.mockReturnValue(null);
    const text = renderDetail("firstaid-burns");

    expect(text).toContain("This is first aid only");
    // ...and the steps are still there.
    expect(text).toContain("General first aid guidance");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx jest guideDetailEmergencyFooter`
Expected: FAIL — the bullet test fails on `expect(text).toContain("•")`, and
the first-aid test fails on `"This is first aid only"`.

- [ ] **Step 3: Import the component**

In `src/screens/guides/GuideDetailScreen.tsx`, add beneath the existing
`import { Text } from "../../components/ui/Text";`:

```tsx
import { GuideBody } from "../../components/GuideBody";
```

- [ ] **Step 4: Render the lead for first aid, and replace the hazard body**

Replace the whole `{isFirstAid ? ( ... ) : ( ... )}` block — the one holding
`styles.steps` and the trailing `<Text variant="bodyMedium" ...>{item.body}</Text>`
— with:

```tsx
        {/*
          Rendered for both categories. This screen used to branch
          `isFirstAid ? steps : body`, which meant every first-aid guide's
          body — "This is first aid only, for while you wait for help. Work
          through the steps in order." — was parsed, cached, reviewed, and
          then silently dropped on the floor.
        */}
        <GuideBody body={item.body} />

        {isFirstAid && (
          <View style={styles.steps}>
            {item.steps.map((step, index) => (
              <View
                key={index}
                style={[
                  styles.stepCard,
                  { backgroundColor: theme.background, borderColor: theme.border },
                ]}
              >
                <View style={styles.stepNumber}>
                  <Text variant="bodyMedium" weight="bold" color="#FFFFFF">
                    {index + 1}
                  </Text>
                </View>
                <View style={styles.stepContent}>
                  <Text variant="bodyLarge" weight="bold">
                    {step.title}
                  </Text>
                  <Text
                    variant="caption"
                    color={theme.textSecondary}
                    style={styles.stepBody}
                  >
                    {step.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
```

Note the ordering inside the `ScrollView`: the meta badge, then the first-aid
disclaimer, then this. The disclaimer stays where it is, above `<GuideBody>`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx jest guideDetail`
Expected: PASS — both `guideDetailContent` and `guideDetailEmergencyFooter`.

- [ ] **Step 6: Verify the whole suite and the types**

Run: `npx tsc --noEmit && npx jest`
Expected: `tsc` exits 0. Jest: 26 suites, 303 tests, all passing.

- [ ] **Step 7: Confirm no dead style survived**

The old inline body `<Text>` used an inline `{ lineHeight: 24 }` rather than a
named style, so nothing in the stylesheet should be orphaned. Confirm:

```bash
for s in $(grep -oE "^  [a-zA-Z]+:" src/screens/guides/GuideDetailScreen.tsx | tr -d ' :' | sort -u); do
  [ "$(grep -c "styles\.$s" src/screens/guides/GuideDetailScreen.tsx)" = "0" ] && echo "UNUSED: $s"
done
```

Expected: no output.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| `src/lib/guideBody.ts`, `GuideBlock`, `parseGuideBody` | 1 |
| Parsing rules, fall-through to paragraph | 1, Step 3 |
| `crisis` propagates to bullets only, resets at next heading | 1, Steps 1 and 3 |
| Colon stripped, uppercase at render | 1 (strip), 2 (uppercase) |
| `src/components/GuideBody.tsx` | 2 |
| Visual system table (sizes, colours, spacing) | 2, Step 1 |
| Bullet glyph column and hanging indent | 2, Step 1 |
| Crisis colour is `emergencyText` / `emergencyBorder` | 2, Step 1 + Global Constraints |
| Classification pinned by test | 1, Step 5 |
| First-aid lead rendered | 3, Step 4 |
| Degradation cases | 1, Step 1 |
| Render assertions on the screen | 3, Step 1 |

No gaps.

**Placeholder scan:** none — every step carries the literal code or command.

**Type consistency:** `GuideBlock`'s four members and `parseGuideBody`'s
signature are declared in Task 1's Interfaces block, defined in Task 1 Step 3,
imported in Task 1 Step 5 and consumed in Task 2 Step 1 under exactly those
names. `GuideBody`'s prop is `body: string` in both Task 2 and Task 3.
`paragraph` carries no `crisis` field in the type, in the parser, and in the
renderer's switch.
