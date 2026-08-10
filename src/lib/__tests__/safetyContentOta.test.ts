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
  it("caches a valid response", async () => {
    (apiGet as jest.Mock).mockResolvedValue([wireItem()]);
    await refreshContent();
    expect(await loadContent()).toHaveLength(1);
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

  it("keeps bundled content when the network fails", async () => {
    (apiGet as jest.Mock).mockRejectedValue(new Error("offline"));
    await expect(refreshContent()).resolves.toBeUndefined();
    expect(await loadContent()).toHaveLength(9);
  });
});
