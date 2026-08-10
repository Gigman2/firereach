import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("../apiClient", () => ({ apiGet: jest.fn() }));

import { apiGet } from "../apiClient";
import {
  loadContent,
  refreshContent,
  SAFETY_CONTENT_CACHE_KEY,
  SAFETY_CONTENT_VERSION,
} from "../safetyContent";

const wireItem = (overrides = {}) => ({
  id: "u1",
  slug: "hazard-cooking",
  category: "hazard",
  subcategory: "cooking",
  title: "Cooking Fire Safety (updated)",
  summary: "",
  body: "Updated body.",
  steps: [],
  tags: [],
  contextual_trigger: null,
  sources: [{ title: "S", publisher: "P", year: "2024", url: "u" }],
  content_hash: "h1",
  review: { state: "pending_review" },
  ...overrides,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  (apiGet as jest.Mock).mockReset();
});

describe("loadContent", () => {
  it("returns bundled content when there is no cache", async () => {
    const items = await loadContent();
    expect(items).toHaveLength(9);
  });

  it("prefers a valid cache over bundled", async () => {
    await AsyncStorage.setItem(
      SAFETY_CONTENT_CACHE_KEY,
      JSON.stringify({ schemaVersion: SAFETY_CONTENT_VERSION, items: [wireItem()] })
    );
    const items = await loadContent();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Cooking Fire Safety (updated)");
  });

  it("degrades to bundled when the cache schema version is stale", async () => {
    await AsyncStorage.setItem(
      SAFETY_CONTENT_CACHE_KEY,
      JSON.stringify({ schemaVersion: SAFETY_CONTENT_VERSION - 1, items: [wireItem()] })
    );
    expect(await loadContent()).toHaveLength(9);
  });

  it("degrades to bundled when the cache is corrupt", async () => {
    await AsyncStorage.setItem(SAFETY_CONTENT_CACHE_KEY, "{not json");
    expect(await loadContent()).toHaveLength(9);
  });
});

describe("refreshContent", () => {
  // A short/partial server response must never leave the app with less
  // content than it shipped with (H2). refreshContent unions the response
  // with the bundled set by slug: the fetched hazard-cooking item overrides
  // the bundled one of the same slug, and the other eight bundled guides —
  // absent from this one-item response — survive untouched.
  it("unions a valid response with the bundled floor by slug, rather than replacing it", async () => {
    (apiGet as jest.Mock).mockResolvedValue([wireItem()]);
    await refreshContent();
    const items = await loadContent();
    expect(items).toHaveLength(9);
    const updated = items.find((i) => i.slug === "hazard-cooking");
    expect(updated?.title).toBe("Cooking Fire Safety (updated)");
  });

  // A server compromise or a bad seed must not be able to push unreviewed
  // medical instructions into the app wearing a trust badge.
  it("rejects a response whose item has no sources", async () => {
    (apiGet as jest.Mock).mockResolvedValue([wireItem({ sources: [] })]);
    await refreshContent();
    expect(await loadContent()).toHaveLength(9);
  });

  it("rejects an item claiming review without provenance", async () => {
    (apiGet as jest.Mock).mockResolvedValue([
      wireItem({ review: { state: "reviewed" } }),
    ]);
    await refreshContent();
    expect(await loadContent()).toHaveLength(9);
  });

  it("rejects an unknown subcategory", async () => {
    (apiGet as jest.Mock).mockResolvedValue([wireItem({ subcategory: "plumbing" })]);
    await refreshContent();
    expect(await loadContent()).toHaveLength(9);
  });

  // N1: `sources: [null]` has a truthy `.length`, so a length-only shape
  // check let it through isAcceptable before this fix; it would then be
  // written into the cache and crash badgeText's `item.sources.find(...)`
  // on every subsequent open of that guide, surviving relaunches because
  // the bad payload was already in AsyncStorage. Each source entry must now
  // be validated element-wise, the same way `steps` already is.
  it("rejects an item whose sources array contains a null entry", async () => {
    (apiGet as jest.Mock).mockResolvedValue([wireItem({ sources: [null] })]);
    await refreshContent();
    const items = await loadContent();
    expect(items).toHaveLength(9);
    const item = items.find((i) => i.slug === "hazard-cooking");
    expect(item?.title).not.toBe("Cooking Fire Safety (updated)");
  });

  it("keeps bundled content when the network fails", async () => {
    (apiGet as jest.Mock).mockRejectedValue(new Error("offline"));
    await expect(refreshContent()).resolves.toBeUndefined();
    expect(await loadContent()).toHaveLength(9);
  });

  // N2 (client-side confirmation): the server now includes withdrawn rows
  // in /v1/content precisely so the client receives the tombstone. Once a
  // withdrawn item lands in the cache via the bundled-floor union, it must
  // still come out filtered here — the withdrawal must not be undone by the
  // union resurrecting the bundled (non-withdrawn) copy of the same slug.
  it("does not resurrect the bundled copy of a slug the server reports withdrawn", async () => {
    (apiGet as jest.Mock).mockResolvedValue([wireItem({ review: { state: "withdrawn" } })]);
    await refreshContent();
    const items = await loadContent();
    expect(items).toHaveLength(8);
    expect(items.find((i) => i.slug === "hazard-cooking")).toBeUndefined();
  });

  // N3: `items.every(isAcceptable)` used to discard the *entire* response
  // the moment a single item failed — and H1 makes any `reviewed` item fail
  // unconditionally. Once a bundled guide is genuinely reviewed, every
  // payload containing it (or a cache that already does) would poison the
  // whole batch and silently kill OTA at exactly the moment the clinical
  // review lands. A payload with one reviewed item and eight otherwise-valid
  // ones must yield the eight, not fall back to bundled entirely.
  it("keeps the eight valid items when one item in the payload is reviewed, not a full fallback", async () => {
    const slugs = [
      { slug: "hazard-electrical", category: "hazard", subcategory: "electrical" },
      { slug: "hazard-cooking", category: "hazard", subcategory: "cooking" },
      { slug: "hazard-home", category: "hazard", subcategory: "home" },
      { slug: "hazard-workplace", category: "hazard", subcategory: "workplace" },
      { slug: "hazard-seasonal", category: "hazard", subcategory: "seasonal" },
      { slug: "firstaid-burns", category: "first_aid", subcategory: "burns" },
      { slug: "firstaid-smoke-inhalation", category: "first_aid", subcategory: "smoke" },
      { slug: "firstaid-evacuation", category: "first_aid", subcategory: "evacuation" },
      { slug: "firstaid-extinguisher-pass", category: "first_aid", subcategory: "extinguisher" },
    ];
    const reviewedProbeSlug = "hazard-electrical";

    const payload = slugs.map((meta) =>
      wireItem({
        ...meta,
        title: `${meta.slug} (updated)`,
        steps: meta.category === "first_aid" ? [{ title: "Step", body: "Body" }] : [],
        review: meta.slug === reviewedProbeSlug ? { state: "reviewed" } : { state: "pending_review" },
      })
    );

    (apiGet as jest.Mock).mockResolvedValue(payload);
    await refreshContent();
    const items = await loadContent();

    expect(items).toHaveLength(9);

    const updated = items.filter((i) => i.title.endsWith("(updated)"));
    expect(updated).toHaveLength(8);

    const reviewedProbe = items.find((i) => i.slug === reviewedProbeSlug);
    expect(reviewedProbe?.title).not.toMatch(/\(updated\)/);
  });
});
