import bundled from "../data/safety-content.bundled.json";

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

/**
 * The badge is derived, never stored. A review is only a review while the
 * text still hashes to what the reviewer approved — this function computes
 * no hash itself, it only compares the two strings the data already carries
 * (item.contentHash, the hash of the text as it stands now, and
 * item.review.contentHash, the hash of the text as the reviewer read it).
 * That comparison is the entire mechanism behind the reviewer packet's
 * promise that an edited item automatically reverts to "awaiting review".
 */
export function effectiveState(item: SafetyItem): EffectiveState {
  if (item.review.state === "withdrawn") return "withdrawn";
  if (item.review.state !== "reviewed") return "pending";
  if (item.review.contentHash !== item.contentHash) return "stale";
  return "reviewed";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
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
    const who = [item.review.reviewerName, item.review.reviewerCredential]
      .filter(Boolean)
      .join(", ");
    return `Last reviewed: ${formatReviewDate(item.review.reviewedAt!)} · ${who}`;
  }

  const publisher = item.sources[0]?.publisher ?? "an external standard";
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

/** Routed through visibleItems(), so a withdrawn slug is unreachable even by direct navigation. */
export function itemBySlug(slug: string): SafetyItem | undefined {
  return visibleItems().find((i) => i.slug === slug);
}
