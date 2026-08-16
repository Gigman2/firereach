# Guide body typography

**Date:** 2026-08-11
**Status:** Approved, not yet implemented
**Screens:** `src/screens/guides/GuideDetailScreen.tsx`

## Problem

A hazard guide's `body` is rendered as a single `<Text>`. The content inside it
is structured — an opening paragraph, two or three titled sections, bullet
lists, and some closing prose — but none of that structure survives to the
screen. The result is 15 to 21 lines of undifferentiated 16px text in which:

- `- ` renders as a literal hyphen. There is no bullet glyph and no hanging
  indent, so the second line of a bullet starts under the dash rather than
  under the text, and a 174-character bullet becomes four lines with no left
  edge to follow.
- Section headings (`Smoke alarms:`, `Reduce the risk:`, `Be ready to get
  out:`) are set at the same size, weight and colour as body copy. Nothing
  separates one section from the next.
- Line spacing is uniform throughout, so paragraph, heading and bullet all sit
  the same distance apart and the sections do not read as sections.

There is no way to scan the page or to skip to the part you need.

A second, separate defect: `GuideDetailScreen` branches
`isFirstAid ? steps : body`, so a first-aid guide's `body` is never rendered at
all. All four first-aid guides have one, and each is an orienting lead the
reader currently never sees — e.g. *"This is first aid only, for while you wait
for help. Work through the steps in order."*

## Content shape

Across the five bundled hazard guides the body follows one micro-format,
applied per non-blank line:

| Line looks like | Meaning |
| --- | --- |
| starts with `- ` | bullet |
| ends with `:` | section heading |
| anything else | paragraph |

Every hazard body opens with a paragraph, then alternates heading and bullet
runs; three of the five close with unheaded prose.

**This format is not enforced anywhere.** `scripts/contentValidate.mjs:44`
checks only that `body` is non-blank, and `isAcceptable` in
`src/lib/safetyContent.ts` never inspects it. Content arriving over OTA can
therefore be arbitrary text. Graceful degradation is a requirement, not a
nicety.

## Design

### Module boundaries

Two new units, so that `GuideDetailScreen` (already ~430 lines) does not absorb
either.

**`src/lib/guideBody.ts`** — pure, no React.

```ts
export type GuideBlock =
  | { kind: "lead"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string; crisis: boolean }
  | { kind: "bullet"; text: string; crisis: boolean };

export function parseGuideBody(body: string): GuideBlock[];
```

Blank lines are separators and produce no block. The first paragraph-kind line
becomes `lead`; every later one is `paragraph`. A line that matches nothing
falls through to `paragraph` — this is the degradation path, and it means an
unstructured OTA body renders as plain prose rather than failing.

`crisis` propagates from a heading to the bullets beneath it, so a bullet knows
which section it is in without the renderer tracking state. It propagates to
bullets **only** — `paragraph` carries no `crisis` field and is never tinted.
That is not an omission. All three crisis sections are followed by trailing
prose that changes the subject rather than continuing it: carbon monoxide after
`If a pan catches fire:`, an extinguisher caveat after `If fire breaks out:`, a
scope disclaimer after `If a bush or grass fire starts near you:`. Tinting
those would attach emergency emphasis to text that is not emergency
instruction. `crisis` resets at the next heading.

**`src/components/GuideBody.tsx`** — maps blocks to elements. Consumes
`useTheme` directly. `GuideDetailScreen` renders `<GuideBody body={item.body} />`
and nothing else changes in it.

### Visual system

| Block | Size / weight | Colour | Spacing |
| --- | --- | --- | --- |
| `lead` | 18px regular, 28px line height | `textPrimary` | 20px below |
| `paragraph` | 16px regular, 24px line height | `textSecondary` | 16px between, 24px when it follows a bullet |
| `heading` | 14px bold, uppercased, 0.8 letter-spacing, hairline rule beneath | `textPrimary` / rule `border` | 28px above, 12px below |
| `bullet` | 16px regular, 24px line height | `textSecondary` | 10px between |

Bullets render as a row: a `•` in a fixed-width column, the text flexed beside
it. The hanging indent is a consequence of that layout rather than of any
padding arithmetic, and the literal `- ` is stripped during parsing and never
reaches the screen.

A heading's trailing `:` is stripped during parsing, and headings are
uppercased at render time rather than in the content, so the source text stays
readable to the clinician reviewing it and to the review packet.

### Crisis sections

A heading is crisis when it begins with `If ` (case-insensitive). On current
content that selects exactly three:

- `If a pan catches fire:` (hazard-cooking)
- `If fire breaks out:` (hazard-workplace)
- `If a bush or grass fire starts near you:` (hazard-seasonal)

and correctly excludes `Call an electrician or your landlord if you notice any
of these:`, which contains "if" but does not lead with it. `Be ready to get
out:` is preparation, not response, and is likewise not crisis.

Crisis headings take `theme.emergencyText` with a rule in
`theme.emergencyBorder`; their bullets take an `emergencyText` glyph and
otherwise normal body copy.

Two deliberate constraints:

**The colour is `theme.emergencyText`, not `colors.brandPrimary`.** Brand red
(#CC1B1B) on the dark background (#211111) measures 3.24:1, which clears AA only
on the technicality that a bold 14px heading is not large text — it does not,
and would fail. `theme.emergencyText` is the existing per-theme emergency tone
and measures 12.59:1 on dark (#FECACA on #211111) and 10.02:1 on light (#7F1D1D
on #FFFFFF). It reads unambiguously red while leaving `colors.brandPrimary`
meaning what it means everywhere else in this app: *this control dials*.

**The classification is pinned by a test.** The heuristic reads content the
pipeline does not validate, so a reworded heading could silently lose its
emphasis. A test walks the bundled content, collects every heading
`parseGuideBody` returns, and asserts the exact set classified crisis. Rewording
then fails CI loudly instead of degrading in silence. OTA content cannot be
pinned this way; there an unmatched heading simply renders as a normal one.

### First-aid lead

`GuideDetailScreen` renders the first-aid `body` through the same `GuideBody`
component, above the existing disclaimer, before the step cards. First-aid
bodies are single paragraphs, so in practice this yields one `lead` block. The
step-card treatment is unchanged.

## Out of scope

- The `summary` field stays unrendered. It restates the opening paragraph
  closely enough (`hazard-home`: summary *"Cut the risk at home, and make sure
  everyone can get out in the minute or two a fire gives you"* against body
  *"Fire spreads fast. Once it takes hold you may have only a minute or two to
  get out…"*) that showing both would read as repetition.
- No change to the content schema, the validator, the seed generator, the
  content hash or the review packet. Structuring `body` into typed sections in
  the data would be more robust than parsing it at render, but it would
  invalidate every content hash and send already-reviewed content back through
  review. Parsing at render buys the same result for this change, and the
  renderer needs a degradation path for OTA regardless.
- No change to the emergency footer, the header, or the step cards.
- No jump-to navigation between sections.

## Testing

**`src/lib/__tests__/guideBody.test.ts`** — the parser, directly:

- each block kind from a representative body
- `- ` stripped from bullet text
- first paragraph is `lead`, subsequent ones are `paragraph`
- `crisis` propagates from heading to its bullets, and resets at the next
  non-crisis heading
- a paragraph following a crisis section's bullets is not marked crisis
- the bundled-content pin described above
- degradation: a body with no headings, one with no bullets, an empty body, a
  `- ` with nothing after it, and a body that is one unbroken paragraph

**`src/lib/__tests__/guideDetailEmergencyFooter.test.ts`** — extended, since it
already mounts the screen:

- no literal `- ` survives to rendered output on a hazard guide
- the first-aid lead paragraph now appears on `firstaid-burns`

Existing suites must stay green, in particular `fontConsistency.test.ts` (any
`fontSize` in the new component needs a `fontFamily` beside it or the
`font-exempt` marker) and `noHardcodedNumbers.test.ts`.
