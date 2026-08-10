// safetyContent.ts now reaches AsyncStorage (the OTA cache added for Task
// 13). Every other test file that imports a module reaching AsyncStorage
// (devReset, stationSnapshot, savedPlaces, submissionsApi, guidesHubCategories)
// swaps in the official jest mock the same way, so this stays consistent
// with the rest of the suite rather than adding a global moduleNameMapper.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import {
  effectiveState,
  badgeText,
  visibleItems,
  itemBySlug,
  SAFETY_CONTENT_VERSION,
  type SafetyItem,
  type SafetySource,
} from "../safetyContent";

// Build-time-only algorithm, imported here (never from safetyContent.ts) to
// build realistic fixtures below. The boundary guard in
// contentHashParity.test.ts forbids this import from anything under src/lib
// except __tests__, which is exactly where this file lives.
import { contentHash } from "../../../scripts/contentHash.mjs";

const base: SafetyItem = {
  slug: "firstaid-burns",
  category: "first_aid",
  subcategory: "burns",
  title: "Burns",
  summary: "",
  body: "b",
  steps: [{ title: "s", body: "b" }],
  tags: [],
  contextualTrigger: null,
  sources: [{ title: "WHO burn first aid guidance", publisher: "WHO", year: "2023", url: "u" }],
  contentHash: "hash-current",
  review: { state: "pending_review" },
};

describe("effectiveState", () => {
  it("is pending when nobody has reviewed it", () => {
    expect(effectiveState(base)).toBe("pending");
  });

  it("is reviewed when the approved hash matches the current text", () => {
    const item = {
      ...base,
      review: {
        state: "reviewed" as const,
        reviewerName: "A. Mensah",
        reviewerCredential: "Ghana Health Service",
        reviewedAt: "2026-08-12",
        contentHash: "hash-current",
      },
    };
    expect(effectiveState(item)).toBe("reviewed");
  });

  it("demotes to stale when the text changed after review", () => {
    const item = {
      ...base,
      contentHash: "hash-edited",
      review: {
        state: "reviewed" as const,
        reviewerName: "A. Mensah",
        reviewerCredential: "Ghana Health Service",
        reviewedAt: "2026-08-12",
        contentHash: "hash-current",
      },
    };
    expect(effectiveState(item)).toBe("stale");
  });

  it("is withdrawn regardless of hash", () => {
    expect(effectiveState({ ...base, review: { state: "withdrawn" } })).toBe("withdrawn");
  });
});

describe("badgeText", () => {
  it("names the reviewer when genuinely reviewed", () => {
    const item = {
      ...base,
      review: {
        state: "reviewed" as const,
        reviewerName: "A. Mensah",
        reviewerCredential: "Ghana Health Service",
        reviewedAt: "2026-08-12",
        contentHash: "hash-current",
      },
    };
    expect(badgeText(item)).toBe("Last reviewed: 12 Aug 2026 · A. Mensah, Ghana Health Service");
  });

  // Not sources[0].title: with real content that reads "Sourced from
  // Electrical Home Fire Safety · awaiting review", which names a document
  // nobody asked for and means nothing to a reader. The publisher is the one
  // piece of provenance worth surfacing here — unlike guide prose, where the
  // project owner explicitly asked for no organisation names.
  it("states provenance honestly when not reviewed, naming the publisher not the source title", () => {
    expect(badgeText(base)).toBe("Sourced from WHO · awaiting review");
  });

  it("never claims review for stale content", () => {
    const item = {
      ...base,
      contentHash: "changed",
      review: {
        state: "reviewed" as const,
        reviewerName: "A. Mensah",
        reviewerCredential: "GHS",
        reviewedAt: "2026-08-12",
        contentHash: "hash-current",
      },
    };
    expect(badgeText(item)).not.toMatch(/Last reviewed/);
  });

  // N1: `item.sources.find((s) => !s.unverified)` threw "Cannot read
  // properties of null" the instant a null landed in `sources` — the same
  // defect class M2 already closed for `steps` but not `sources`. badgeText
  // must be null-safe on its own terms, regardless of what upstream
  // validation does or fails to do.
  it("does not throw when a source entry is null", () => {
    const item = { ...base, sources: [null as unknown as SafetySource] };
    expect(() => badgeText(item)).not.toThrow();
    expect(badgeText(item)).toBe("Sourced from published guidance · awaiting review");
  });

  // Truncation must cut at a space, not mid-word — "Sourced from Nationa…"
  // reads as a rendering bug, not a real organisation name.
  it("truncates a long publisher on a word boundary", () => {
    const longPublisher =
      "A very long standards organisation publisher name that will not fit in a badge";
    const item = {
      ...base,
      sources: [{ ...base.sources[0], publisher: longPublisher }],
    };
    const text = badgeText(item);
    expect(text.length).toBeLessThan(80);
    expect(text).toContain("…");

    const match = text.match(/^Sourced from (.+)… · awaiting review$/);
    expect(match).not.toBeNull();
    const truncated = match![1];
    // The character right after the truncated prefix in the original string
    // must be a space — proof the cut landed between words, not inside one.
    expect(longPublisher.startsWith(truncated)).toBe(true);
    expect(longPublisher[truncated.length]).toBe(" ");
  });
});

// The three claims below are printed, today, in app/docs/content-review/README.md,
// and told to a clinician who has not yet reviewed anything. Each test proves
// one claim in code rather than trusting the doc's prose.
describe("promises made in the reviewer packet", () => {
  // "Withdrawn — stops the app from displaying the item entirely, not just
  // hiding a badge." Real shipped content has no withdrawn item today (all
  // nine are pending_review), so this can only be proven against a
  // constructed fixture — hence mocking the bundled JSON and loading a fresh
  // copy of the module rather than using the module-level `visibleItems`.
  it("a withdrawn item is absent from visibleItems() and unreachable by slug", () => {
    jest.resetModules();
    jest.doMock("../../data/safety-content.bundled.json", () => [
      {
        slug: "pending-item",
        category: "hazard",
        subcategory: "electrical",
        title: "Pending Item",
        summary: "s",
        body: "b",
        steps: [],
        tags: [],
        contextual_trigger: null,
        sources: [{ title: "Test Source", publisher: "Test Publisher", year: "2020", url: "u" }],
        content_hash: "h1",
        review: { state: "pending_review" },
        open_questions: [],
      },
      {
        slug: "withdrawn-item",
        category: "hazard",
        subcategory: "electrical",
        title: "Withdrawn Item",
        summary: "s",
        body: "b",
        steps: [],
        tags: [],
        contextual_trigger: null,
        sources: [{ title: "Test Source", publisher: "Test Publisher", year: "2020", url: "u" }],
        content_hash: "h2",
        review: { state: "withdrawn" },
        open_questions: [],
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fresh = require("../safetyContent");
    const items: SafetyItem[] = fresh.visibleItems();

    expect(items.map((i) => i.slug)).toEqual(["pending-item"]);
    expect(fresh.itemBySlug("withdrawn-item")).toBeUndefined();

    jest.dontMock("../../data/safety-content.bundled.json");
    jest.resetModules();
  });

  // "Until you sign off, every item displays to the public as
  // sourced-but-unreviewed." Every shipped item is pending_review, so its
  // badge must use the provenance form and never the reviewed form.
  it("an unreviewed item's badge is sourced-but-awaiting-review and never claims a review", () => {
    expect(effectiveState(base)).toBe("pending");
    const text = badgeText(base);
    expect(text).toMatch(/awaiting review$/);
    expect(text).not.toMatch(/Last reviewed/);
  });

  // "If a single word of the text changes afterwards, the hash stops
  // matching and the app automatically reverts that item to 'awaiting
  // review'." effectiveState/badgeText never compute a hash themselves —
  // they only compare item.contentHash against item.review.contentHash — so
  // this proves the promise by acting out the real sequence: hash a real
  // fixture, mark it reviewed against that hash, edit one character of the
  // body, hash the edited text (standing in for what the build pipeline
  // would do), and confirm the badge demotes even though review.contentHash
  // was never touched.
  it("a one-character edit after review demotes the badge, without effectiveState recomputing anything", () => {
    const approvedText = {
      slug: "firstaid-burns",
      title: "Burns",
      summary: "Cool the burn, cover it, get help.",
      body: "Cool the burn under running water for twenty minutes.",
      steps: [],
      sources: [{ title: "WHO burn first aid guidance", publisher: "WHO", year: "2023", url: "u" }],
    };
    const approvedHash = contentHash(approvedText);

    const reviewedItem: SafetyItem = {
      ...base,
      body: approvedText.body,
      contentHash: approvedHash,
      review: {
        state: "reviewed",
        reviewerName: "A. Mensah",
        reviewerCredential: "Ghana Health Service",
        reviewedAt: "2026-08-12",
        contentHash: approvedHash,
      },
    };
    expect(effectiveState(reviewedItem)).toBe("reviewed");
    expect(badgeText(reviewedItem)).toMatch(/^Last reviewed/);

    const editedBody = approvedText.body + "!"; // one character
    const editedHash = contentHash({ ...approvedText, body: editedBody });
    expect(editedHash).not.toBe(approvedHash);

    const editedItem: SafetyItem = {
      ...reviewedItem,
      body: editedBody,
      contentHash: editedHash, // recomputed from text, as the build pipeline would
      // review.contentHash is untouched — the reviewer's frozen approval.
    };

    expect(effectiveState(editedItem)).toBe("stale");
    const demotedBadge = badgeText(editedItem);
    expect(demotedBadge).not.toMatch(/Last reviewed/);
    expect(demotedBadge).toMatch(/awaiting review$/);
  });
});

describe("the shipped content", () => {
  it("ships nine items", () => {
    expect(visibleItems()).toHaveLength(9);
  });

  it("ships nothing claiming review", () => {
    for (const item of visibleItems()) {
      expect(effectiveState(item)).not.toBe("reviewed");
    }
  });

  it("resolves every hub slug", () => {
    for (const slug of ["hazard-electrical", "firstaid-burns", "firstaid-extinguisher-pass"]) {
      expect(itemBySlug(slug)).toBeDefined();
    }
  });

  // open_questions is reviewer-directed text (see safety-content.NOTICE.md)
  // and must never reach a screen. Proving the TS type omits the field isn't
  // enough on its own — a future edit to fromJson could spread `raw` and
  // leak it back in without the compiler noticing, since callers can always
  // widen with `as any`. This checks the actual runtime shape.
  it("never carries open_questions into the app-facing shape", () => {
    for (const item of visibleItems()) {
      expect(item).not.toHaveProperty("openQuestions");
      expect(item).not.toHaveProperty("open_questions");
    }
  });

  it("exposes a numeric AsyncStorage schema version gate", () => {
    expect(typeof SAFETY_CONTENT_VERSION).toBe("number");
  });
});

// Fix round 1: the database refuses to store a `reviewed` row without a
// reviewer name, a review date, and an approved-content hash (migration
// 000006, safety_content_reviewed_requires_provenance). Before this round,
// effectiveState only checked review.state and the hash comparison, so any
// of the four gaps below produced a badge that claimed a review nobody
// performed — the exact hardcoded-badge falsehood this module exists to
// remove, reappearing inside the mechanism built to prevent it. Each case
// here reproduces one gap directly, bypassing the SafetyItem type where
// necessary (`as unknown as string`) because the bug is precisely that
// malformed JSON reaches fromJson() without shape validation — see
// safetyContent.ts's comment on why fromJson stays unvalidated.
describe("provenance gate: a reviewed claim requires all of it, or none of it", () => {
  const reviewedBase = {
    state: "reviewed" as const,
    reviewerName: "A. Mensah",
    reviewerCredential: "Ghana Health Service",
    reviewedAt: "2026-08-12",
    contentHash: "hash-current",
  };

  it("does not render the Unix epoch when reviewedAt is null", () => {
    const item = {
      ...base,
      review: { ...reviewedBase, reviewedAt: null as unknown as string },
    };
    expect(effectiveState(item)).not.toBe("reviewed");
    const text = badgeText(item);
    expect(text).not.toMatch(/Last reviewed/);
    expect(text).not.toContain("1970");
  });

  it("does not render the literal string 'undefined' when reviewedAt is absent", () => {
    const { reviewedAt, ...withoutDate } = reviewedBase;
    const item = { ...base, review: withoutDate };
    expect(effectiveState(item)).not.toBe("reviewed");
    const text = badgeText(item);
    expect(text).not.toMatch(/Last reviewed/);
    expect(text).not.toContain("undefined");
  });

  it("does not claim review when reviewedAt is not a parseable date", () => {
    const item = { ...base, review: { ...reviewedBase, reviewedAt: "not-a-date" } };
    expect(effectiveState(item)).not.toBe("reviewed");
    expect(badgeText(item)).not.toMatch(/Last reviewed/);
  });

  it("does not claim review with a blank reviewer name", () => {
    const item = { ...base, review: { ...reviewedBase, reviewerName: "   " } };
    expect(effectiveState(item)).not.toBe("reviewed");
    expect(badgeText(item)).not.toMatch(/Last reviewed/);
  });

  // "" === "" is true, so a naive equality check on the two hash fields
  // reads a row where neither hash was ever populated as a match.
  it("does not treat two blank content hashes as matching", () => {
    const item = {
      ...base,
      contentHash: "",
      review: { ...reviewedBase, contentHash: "" },
    };
    expect(effectiveState(item)).not.toBe("reviewed");
    expect(badgeText(item)).not.toMatch(/Last reviewed/);
  });

  // Nullish coalescing (`??`) only catches null/undefined, not "", so a
  // blank publisher used to slip through to "Sourced from  · awaiting
  // review" — a visible double space where an organisation name should be.
  it("treats a blank publisher as missing, not as an empty name", () => {
    const item = { ...base, sources: [{ ...base.sources[0], publisher: "" }] };
    expect(badgeText(item)).toBe("Sourced from an external standard · awaiting review");
  });

  it("still shows the reviewed badge for a fixture with genuinely complete provenance", () => {
    const item = { ...base, review: { ...reviewedBase } };
    expect(effectiveState(item)).toBe("reviewed");
    expect(badgeText(item)).toBe("Last reviewed: 12 Aug 2026 · A. Mensah, Ghana Health Service");
  });

  it("still shows every real shipped item as sourced-but-awaiting-review", () => {
    for (const item of visibleItems()) {
      expect(badgeText(item)).toMatch(/^Sourced from .+ · awaiting review$/);
    }
  });
});
