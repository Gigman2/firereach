// toMarkdown/selectForReview live in reviewPacket.mjs, not the CLI entrypoint
// build-review-packet.mjs — the CLI file uses import.meta for path
// resolution, and jest-expo's Hermes-targeted preset throws on import.meta
// for any non-web platform. Importing the pure module here is what lets this
// suite run at all without a custom babel workaround (see jest.config.js).
import { toMarkdown, selectForReview, selectStaleFiles } from "../../../scripts/reviewPacket.mjs";

const item = {
  slug: "firstaid-burns",
  category: "first_aid",
  subcategory: "burns",
  title: "Burns",
  summary: "What to do first.",
  body: "Act immediately.",
  steps: [
    { title: "Get away from the heat", body: "Stop the burning process." },
    { title: "Cool the burn", body: "Cool running water for 20 minutes." },
  ],
  sources: [
    { title: "Burns", publisher: "WHO", year: "2023", url: "https://who.int/x" },
    { title: "Unchecked", publisher: "Somewhere", year: "2020", url: "https://x.test", unverified: true },
  ],
  content_hash: "abc123",
  review: { state: "pending_review" },
};

describe("toMarkdown", () => {
  // A reviewer needs to say "step 3 is wrong" without re-typing its prose;
  // unnumbered steps make that reference impossible.
  it("numbers the steps so a reviewer can reference them", () => {
    const md = toMarkdown(item);
    expect(md).toContain("1. **Get away from the heat**");
    expect(md).toContain("2. **Cool the burn**");
  });

  // An unverified source is the single most useful signal in the packet —
  // it tells the reviewer exactly which claim still needs independent
  // checking. Buried or absent, a reviewer has no way to know to look.
  it("flags unverified sources prominently", () => {
    const md = toMarkdown(item);
    expect(md).toMatch(/UNVERIFIED/);
  });

  // Sign-off binds to this exact hash. Without it visible on the page, a
  // reviewer's approval can't be tied back to the specific text they read.
  it("includes the content hash so sign-off binds to exact text", () => {
    expect(toMarkdown(item)).toContain("abc123");
  });

  // The whole point of this file is that a clinician can fill it in and send
  // it back — no sign-off fields means no way to capture their verdict.
  it("includes a sign-off block the reviewer fills in", () => {
    const md = toMarkdown(item);
    expect(md).toMatch(/Reviewer name/i);
    expect(md).toMatch(/Approved \/ Corrected \/ Withdrawn/i);
  });

  // The two items in the content file today are `draft` placeholders whose
  // body is literally "Replaced with sourced content in Task 7." If a draft
  // reaches this filter, a clinician signs their name and credential to
  // placeholder text — the worst outcome this project can produce. This
  // test is what makes that exclusion load-bearing rather than incidental.
  it("excludes draft items from the packet", () => {
    expect(selectForReview([{ ...item, review: { state: "draft" } }])).toEqual([]);
    expect(selectForReview([item])).toHaveLength(1);
  });

  // reviewed items are past sign-off but still belong in the packet — e.g.
  // for a re-review after a correction — so the filter must not treat
  // "reviewed" as "done and hidden."
  it("includes reviewed items alongside pending_review ones", () => {
    expect(selectForReview([{ ...item, review: { state: "reviewed" } }])).toHaveLength(1);
  });

  // withdrawn is a real terminal state (Task 3) distinct from draft, but a
  // withdrawn item is not awaiting anyone's sign-off either — it must not
  // leak into the packet just because it isn't a draft.
  it("excludes withdrawn items from the packet", () => {
    expect(selectForReview([{ ...item, review: { state: "withdrawn" } }])).toEqual([]);
  });
});

describe("selectStaleFiles", () => {
  // withdrawn is how a content authority pulls a guide judged unsafe — the
  // whole point is to remove it, not leave a plausible-looking instruction
  // on a reviewer's desk. A left-behind firstaid-burns.md would defeat that:
  // a reviewer browsing the folder (not the README index) could still open
  // and sign a withdrawn guide.
  it("removes the file for an item that moved from pending_review to withdrawn", () => {
    const withdrawn = { ...item, review: { state: "withdrawn" } };
    expect(selectStaleFiles(["firstaid-burns.md"], [withdrawn])).toEqual(["firstaid-burns.md"]);
  });

  // Same hazard as withdrawn: an item demoted back to draft (e.g. the
  // content author pulled it for rework) must not leave stale prose sitting
  // where a reviewer could still find and approve it.
  it("removes the file for an item that moved from pending_review to draft", () => {
    const draft = { ...item, review: { state: "draft" } };
    expect(selectStaleFiles(["firstaid-burns.md"], [draft])).toEqual(["firstaid-burns.md"]);
  });

  // The flip side of both cases above: a file must not be deleted just
  // because pruning runs every time. An item still legitimately under
  // review — possibly with a reviewer's in-progress annotations in its
  // sign-off block — has to survive the same run that prunes others.
  it("keeps the file for an item still pending_review", () => {
    expect(selectStaleFiles(["firstaid-burns.md"], [item])).toEqual([]);
  });

  // README.md is the index, rewritten wholesale every run — it is not a
  // per-item file and must never be treated as one, or the "stale" pass
  // would delete it right before the CLI regenerates it (harmless here, but
  // the wrong file for this function to ever name).
  it("never returns README.md — it is regenerated every run, not per-item", () => {
    const withdrawn = { ...item, review: { state: "withdrawn" } };
    expect(selectStaleFiles(["README.md"], [withdrawn])).toEqual([]);
  });

  // A name that matches no slug in the content file was not written by this
  // generator — maybe a human dropped review notes alongside the packet.
  // "Only remove what you could have generated" means leaving it alone.
  it("ignores a file that matches no known slug — not ours to touch", () => {
    expect(selectStaleFiles(["notes.md"], [item])).toEqual([]);
  });
});
