import AsyncStorage from "@react-native-async-storage/async-storage";
import bundled from "../data/safety-content.bundled.json";
import { apiGet } from "./apiClient";

/** Bump when the shape below changes; a mismatch discards the cache. */
export const SAFETY_CONTENT_VERSION = 1;

export type ReviewStateName = "draft" | "pending_review" | "reviewed" | "withdrawn";
export type EffectiveState = "reviewed" | "stale" | "pending" | "withdrawn";

export interface SafetyStep {
  title: string;
  body: string;
}

export interface SafetySource {
  title: string;
  publisher: string;
  year: string;
  url: string;
  unverified?: boolean;
}

export interface SafetyItem {
  slug: string;
  category: "hazard" | "first_aid";
  subcategory: string;
  title: string;
  summary: string;
  body: string;
  steps: SafetyStep[];
  tags: string[];
  contextualTrigger: string | null;
  sources: SafetySource[];
  contentHash: string;
  review: {
    state: ReviewStateName;
    reviewerName?: string;
    reviewerCredential?: string;
    reviewedAt?: string;
    contentHash?: string;
  };
  // No `openQuestions` field. That text is addressed to the clinical
  // reviewer (see safety-content.NOTICE.md) and must never reach a screen —
  // fromJson below deliberately does not read raw.open_questions.
}

/**
 * Wire and bundled JSON are snake_case; the app is camelCase.
 *
 * Built field-by-field, not `{ ...raw }`, so that raw.open_questions (and
 * anything else the content file gains later) is dropped by construction
 * instead of by discipline.
 */
function fromJson(raw: any): SafetyItem {
  return {
    slug: raw.slug,
    category: raw.category,
    subcategory: raw.subcategory,
    title: raw.title,
    summary: raw.summary ?? "",
    body: raw.body,
    steps: raw.steps ?? [],
    tags: raw.tags ?? [],
    contextualTrigger: raw.contextual_trigger ?? null,
    sources: raw.sources ?? [],
    contentHash: raw.content_hash ?? "",
    review: {
      state: raw.review?.state ?? "draft",
      reviewerName: raw.review?.reviewer_name,
      reviewerCredential: raw.review?.reviewer_credential,
      reviewedAt: raw.review?.reviewed_at,
      contentHash: raw.review?.content_hash,
    },
  };
}

const BUNDLED: SafetyItem[] = (bundled as any[]).map(fromJson);

function isBlank(value?: string | null): boolean {
  return value == null || value.trim().length === 0;
}

const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Bare `YYYY-MM-DD` is a real calendar date only if it's not blank and the
 * month/day are in range — `BARE_DATE` matches the digit shape but not the
 * calendar, so "2026-00-00" and "2026-13-45" used to pass and render "Last
 * reviewed: 0 undefined 2026" (formatReviewDate indexing MONTHS[-1]).
 * Anything else must round-trip through Date to prove it parses.
 */
function isValidReviewDate(value?: string | null): boolean {
  if (isBlank(value)) return false;
  const bare = BARE_DATE.exec(value!);
  if (bare) {
    const month = Number(bare[2]);
    const day = Number(bare[3]);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31;
  }
  return !Number.isNaN(new Date(value!).getTime());
}

/**
 * Mirrors, on purpose, the database's own gate on this same claim —
 * `safety_content_reviewed_requires_provenance` in
 * api/migrations/000006_alter_safety_content_review.up.sql, which refuses
 * to *store* a `reviewed` row without a reviewer name, a review date, and
 * an approved-content hash. This function is the app's half of that
 * promise: it must refuse to *render* what the database refuses to store,
 * or the two drift and the badge starts making claims the database itself
 * wouldn't allow.
 *
 * Every check below fails closed. Before this existed, `review.state ===
 * "reviewed"` plus a bare hash comparison was enough to badge a review that
 * never happened: `reviewedAt: null` parses as the Unix epoch and slid past
 * the old NaN guard ("Last reviewed: 1 Jan 1970"), a missing `reviewedAt`
 * rendered the literal string "undefined", two never-populated hashes are
 * both "" and "" === "" is true, and a `reviewed` row with no reviewer name
 * rendered a claim with nobody attached to it. Each is the same failure —
 * a provenance claim with nothing behind it — which is the precise defect
 * this project exists to remove from a hardcoded UI badge in the first
 * place.
 */
export function effectiveState(item: SafetyItem): EffectiveState {
  if (item.review.state === "withdrawn") return "withdrawn";
  if (item.review.state !== "reviewed") return "pending";

  const hasReviewer = !isBlank(item.review.reviewerName);
  const hasDate = isValidReviewDate(item.review.reviewedAt);
  const hasBothHashes = !isBlank(item.review.contentHash) && !isBlank(item.contentHash);
  if (!hasReviewer || !hasDate || !hasBothHashes) return "pending";

  return item.review.contentHash === item.contentHash ? "reviewed" : "stale";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Bare `YYYY-MM-DD` — the only form the build pipeline writes today — is
 * parsed as calendar-date digits directly, never through `new Date()`. A
 * full ISO timestamp near midnight in a non-UTC offset converts to a
 * different UTC calendar day (`2026-08-12T23:00:00-05:00` is
 * `2026-08-13T04:00:00Z`), which would silently print "13 Aug 2026" for a
 * date a reviewer would call the 12th. Nothing today writes that form, but
 * nothing stops it either, so the common case is handled without ever
 * routing through Date's timezone conversion at all.
 */
function formatReviewDate(value: string): string {
  const bare = BARE_DATE.exec(value);
  if (bare) {
    const [, year, month, day] = bare;
    return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > 0 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/**
 * What the user reads under the title. The reviewed form is the only one
 * that makes a trust claim, and effectiveState gates it strictly, so a stale
 * or never-reviewed item always falls through to the honest provenance form.
 *
 * Provenance names the publisher, not sources[0].title: the title of a real
 * source reads like "Electrical Home Fire Safety", which duplicates the
 * item's own title and tells the reader nothing new. The publisher — "World
 * Health Organization", "Ghana National Fire Service" — is the one place
 * naming an organisation is the point, unlike the guide prose itself, where
 * the project owner asked for no organisation names at all.
 */
export function badgeText(item: SafetyItem): string {
  if (effectiveState(item) === "reviewed") {
    // effectiveState already guarantees reviewerName is non-blank whenever
    // this branch runs, so `who` can never be empty in practice — the
    // isBlank filter (not plain Boolean, which lets "   " through) and the
    // conditional separator below are defensive anyway: a formatter that
    // can render "Last reviewed: 12 Aug 2026 · " with nothing after the
    // separator is one refactor away from doing it for real.
    const who = [item.review.reviewerName, item.review.reviewerCredential]
      .filter((s): s is string => !isBlank(s))
      .join(", ");
    const attribution = who ? ` · ${who}` : "";
    return `Last reviewed: ${formatReviewDate(item.review.reviewedAt!)}${attribution}`;
  }

  // Cite the first source NOT flagged unverified, not just sources[0]. The
  // review packet (reviewPacket.mjs) marks an unverified citation "⚠
  // UNVERIFIED — please confirm or replace" for the clinician; asserting
  // that same source to the public as provenance is the same
  // claim-without-backing this project exists to remove, one layer down.
  // If every source is unverified, say so plainly instead of naming one.
  const verifiedSource = item.sources.find((s) => !s.unverified);
  if (!verifiedSource) {
    return "Sourced from published guidance · awaiting review";
  }

  // `??` only catches null/undefined, not "" — a blank publisher used to
  // slip through as "Sourced from  · awaiting review" (visible double
  // space). Blank is treated as absent, same as a missing field.
  const rawPublisher = verifiedSource.publisher;
  const publisher = isBlank(rawPublisher) ? "an external standard" : rawPublisher!;
  return `Sourced from ${truncate(publisher, 48)} · awaiting review`;
}

/**
 * Excludes withdrawn items outright. This is not a display filter applied on
 * top of a badge — a withdrawn item never enters the returned array, so
 * nothing built on this function (hub lists, itemBySlug below) can surface
 * one by accident. That is the literal claim the reviewer packet makes:
 * withdrawn "stops the app from displaying the item entirely, not just
 * hiding a badge."
 */
export function visibleItems(): SafetyItem[] {
  return BUNDLED.filter((i) => effectiveState(i) !== "withdrawn");
}

/**
 * Bundled-content-only slug lookup, routed through visibleItems() so a
 * withdrawn slug is unreachable here too. No screen calls this for
 * navigation any more — since the Task 13 OTA wiring, GuideDetailScreen
 * resolves the navigated slug from useSafetyContent() directly, so it also
 * sees cached/refreshed content, not just what shipped in the bundle. This
 * function remains as a bundled-only fixture accessor for tests
 * (guideDetailContent.test.ts, safetyContent.test.ts) that want to assert
 * against the shipped set without going through AsyncStorage/OTA.
 */
export function itemBySlug(slug: string): SafetyItem | undefined {
  return visibleItems().find((i) => i.slug === slug);
}

export const SAFETY_CONTENT_CACHE_KEY = "firereach.safetyContent.v1";

/**
 * The tabs each subcategory may appear under. Mirrors scripts/contentValidate.mjs
 * (SUBCATEGORIES) and GuidesHubScreen.tsx (SUBCATEGORY_META's keys) — the
 * three copies are pinned together by subcategoryMapParity.test.ts. Exported
 * so that test can compare the live object, not a hand-copied literal of it.
 */
export const SUBCATEGORY_TAB: Record<string, "hazard" | "first_aid"> = {
  electrical: "hazard",
  cooking: "hazard",
  home: "hazard",
  workplace: "hazard",
  seasonal: "hazard",
  burns: "first_aid",
  smoke: "first_aid",
  evacuation: "first_aid",
  extinguisher: "first_aid",
};

/**
 * Fetched content is validated before it is trusted. The same rules the build
 * script enforces at authoring time apply again at the network boundary — a
 * compromised or misconfigured server must not be able to push unreviewed
 * medical instructions into the app wearing a trust badge.
 */
function isAcceptable(item: SafetyItem): boolean {
  if (!item.slug || !item.title || !item.body) return false;
  if (SUBCATEGORY_TAB[item.subcategory] !== item.category) return false;

  // Shape, not just presence: `{"steps": "later"}` has a `.length` (4), so a
  // length-only check on steps/sources/tags accepts a non-array. It is then
  // cached and GuideDetailScreen's `item.steps.map(...)` throws — and
  // because the bad payload is already in AsyncStorage, the guide stays
  // unopenable across relaunches until the cache is cleared. This does not
  // carry the stationCache.ts precedent (unvalidated shape is fine there):
  // that data is never rendered through `.map` straight off the network.
  if (!Array.isArray(item.steps)) return false;
  if (!Array.isArray(item.sources)) return false;
  if (!Array.isArray(item.tags)) return false;

  if (item.sources.length === 0) return false;
  if (item.category === "first_aid" && item.steps.length === 0) return false;

  // A step with a blank title or body renders as a bare numbered card with
  // nothing in it — worse than no step at all, mid-emergency. Mirrors the
  // same check contentValidate.mjs makes at authoring time.
  if (item.steps.some((step) => isBlank(step?.title) || isBlank(step?.body))) return false;

  // H1: reject a "reviewed" claim outright for anything that arrived over
  // the wire (a fresh OTA fetch, or a previously-cached OTA payload read
  // back on the next launch). The app has no SHA-256 — contentHash.mjs says
  // so directly ("The app never computes this; it compares two precomputed
  // strings") — so this function cannot verify that item.contentHash was
  // actually derived from item.body. Without this line, a server response
  // (or a MITM on the cleartext-by-default localhost:9000 in apiConfig.ts)
  // carrying `content_hash: "x"` alongside `review.content_hash: "x"` over
  // arbitrary prose passes every check above and every gate in
  // effectiveState, because effectiveState only compares two
  // attacker-supplied strings to each other — it never recomputes a hash.
  // OTA content may therefore only ever arrive as pending_review, draft, or
  // withdrawn. A genuine review ships inside a new app version instead,
  // where the bundled JSON's hash was computed by build tooling that
  // actually hashes (contentHash.mjs / contenthash.go), not asserted by the
  // payload about itself. This costs nothing today — no shipped item is
  // reviewed — and it must stay in place even once a real review exists,
  // unless a signature (not a same-payload hash comparison) is added at
  // this boundary. Do not remove this to "unblock" shipping a review over
  // OTA; ship it in a new bundled app version instead.
  if (item.review.state === "reviewed") return false;

  return true;
}

/**
 * Bundled is the floor, cache is preferred, any failure degrades silently —
 * the same precedence as stationCache.ts:47-55.
 */
export async function loadContent(): Promise<SafetyItem[]> {
  try {
    const raw = await AsyncStorage.getItem(SAFETY_CONTENT_CACHE_KEY);
    if (!raw) return visibleItems();

    const parsed = JSON.parse(raw);
    if (parsed.schemaVersion !== SAFETY_CONTENT_VERSION) return visibleItems();
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return visibleItems();

    const items = parsed.items.map(fromJson);
    if (!items.every(isAcceptable)) return visibleItems();

    return items.filter((i: SafetyItem) => effectiveState(i) !== "withdrawn");
  } catch {
    return visibleItems();
  }
}

/**
 * Best-effort OTA refresh. Never throws and never leaves the app with less
 * content than it shipped with — enforced by unioning the response with
 * BUNDLED by slug (fetched items override a bundled item of the same slug;
 * a bundled slug absent from the response survives) rather than replacing
 * the cache wholesale. A short or partial `/v1/content` response — a
 * half-run seed, a truncated network response, a future `?category=`
 * defaulting somewhere — must not delete offline guides that are still
 * cached from a previous, complete fetch: this is an app people open during
 * fires, and burns/evacuation/smoke-inhalation guidance silently vanishing,
 * persisted to AsyncStorage and surviving relaunch, is the worst failure
 * mode this module can produce.
 */
export async function refreshContent(): Promise<void> {
  try {
    const raw = await apiGet<any[] | null>("/v1/content");
    if (!Array.isArray(raw) || raw.length === 0) return;

    const items = raw.map(fromJson);
    if (!items.every(isAcceptable)) {
      console.warn("[safetyContent] rejected OTA payload: failed validation");
      return;
    }

    const bySlug = new Map<string, any>();
    for (const b of bundled as any[]) bySlug.set(b.slug, b);
    for (const r of raw) bySlug.set(r.slug, r);
    const merged = Array.from(bySlug.values());

    await AsyncStorage.setItem(
      SAFETY_CONTENT_CACHE_KEY,
      JSON.stringify({ schemaVersion: SAFETY_CONTENT_VERSION, items: merged })
    );
  } catch (err) {
    console.warn("[safetyContent] refresh failed, keeping bundled content", err);
  }
}
