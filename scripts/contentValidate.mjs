/**
 * Validation rules for safety content. Shared by both build scripts, the
 * Jest suite, and (via the same rules restated in TypeScript) the app's
 * OTA acceptance check.
 */
import { contentHash } from "./contentHash.mjs";

/**
 * The complete set of subcategories the app can render, and which tab each
 * belongs to. UI Requirements §S5 puts Smoke, Evacuation, and Extinguisher
 * under First Aid — the hub screen currently has all three under Hazards.
 */
export const SUBCATEGORIES = Object.freeze({
  electrical:   "hazard",
  cooking:      "hazard",
  home:         "hazard",
  workplace:    "hazard",
  seasonal:     "hazard",
  burns:        "first_aid",
  smoke:        "first_aid",
  evacuation:   "first_aid",
  extinguisher: "first_aid",
});

const VALID_STATES = new Set(["draft", "pending_review", "reviewed", "withdrawn"]);

export function validateContent(items) {
  const errors = [];
  const seen = new Set();

  for (const item of items) {
    const at = item.slug || "(missing slug)";

    if (!item.slug) errors.push("An item is missing its slug.");
    if (seen.has(item.slug)) errors.push(`${at}: duplicate slug.`);
    seen.add(item.slug);

    if (!item.title) errors.push(`${at}: missing title.`);
    if (!item.body) errors.push(`${at}: missing body.`);

    const tab = SUBCATEGORIES[item.subcategory];
    if (!tab) {
      errors.push(`${at}: unknown subcategory "${item.subcategory}".`);
    } else if (tab !== item.category) {
      errors.push(`${at}: subcategory "${item.subcategory}" belongs to ${tab}, not ${item.category}.`);
    }

    if (!Array.isArray(item.sources) || item.sources.length === 0) {
      errors.push(`${at}: needs at least one source. Every clinical claim must be traceable.`);
    }

    if (item.category === "first_aid" && (!item.steps || item.steps.length === 0)) {
      errors.push(`${at}: first_aid items need at least one step.`);
    }

    const review = item.review ?? {};
    if (!VALID_STATES.has(review.state)) {
      errors.push(`${at}: invalid review state "${review.state}".`);
    }
    if (review.state === "reviewed") {
      if (!review.reviewer_name) errors.push(`${at}: claims reviewed with no reviewer name.`);
      if (!review.reviewed_at) errors.push(`${at}: claims reviewed with no review date.`);
      if (!review.content_hash) errors.push(`${at}: claims reviewed with no approved-content hash.`);
    }

    if (item.content_hash && item.content_hash !== contentHash(item)) {
      errors.push(`${at}: stale content_hash — re-run npm run build:content-seed.`);
    }
  }

  return errors;
}
