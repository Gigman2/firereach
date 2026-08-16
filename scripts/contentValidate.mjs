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
  flames:       "hazard",
  burns:        "first_aid",
  smoke:        "first_aid",
  evacuation:   "first_aid",
  extinguisher: "first_aid",
});

const VALID_STATES = new Set(["draft", "pending_review", "reviewed", "withdrawn"]);

// `!field` treats "   " as truthy content, so a whitespace-only title or
// body — or a citation of empty strings — sails through every presence
// check below. blank() is what actually enforces "has something to say."
const blank = (v) => typeof v !== "string" || v.trim() === "";

export function validateContent(items) {
  const errors = [];
  const seen = new Set();

  for (const item of items) {
    const at = item.slug || "(missing slug)";

    if (!item.slug) errors.push("An item is missing its slug.");
    if (seen.has(item.slug)) errors.push(`${at}: duplicate slug.`);
    seen.add(item.slug);

    if (blank(item.title)) errors.push(`${at}: missing title.`);
    if (blank(item.body)) errors.push(`${at}: missing body.`);

    const tab = SUBCATEGORIES[item.subcategory];
    if (!tab) {
      errors.push(`${at}: unknown subcategory "${item.subcategory}".`);
    } else if (tab !== item.category) {
      errors.push(`${at}: subcategory "${item.subcategory}" belongs to ${tab}, not ${item.category}.`);
    }

    if (!Array.isArray(item.sources) || item.sources.length === 0) {
      errors.push(`${at}: needs at least one source. Every clinical claim must be traceable.`);
    } else {
      // title + publisher are what let a human actually verify a citation.
      // url is deliberately not required — a printed GHS/GNFS/WHO standard
      // may have no public link, and demanding one invites a fabricated URL,
      // which is the one thing this project can never tolerate.
      item.sources.forEach((source, i) => {
        if (blank(source?.title) || blank(source?.publisher)) {
          errors.push(
            `${at}: source ${i + 1} has no title or publisher — a citation a reviewer cannot check is not a citation.`
          );
        }
      });
    }

    if (item.category === "first_aid") {
      if (!item.steps || item.steps.length === 0) {
        errors.push(`${at}: first_aid items need at least one step.`);
      } else {
        // A step with an empty title/body renders as a bare number in the
        // UI — "1." with nothing after it — which is worse mid-emergency
        // than having no step at all.
        item.steps.forEach((step, i) => {
          if (blank(step?.title) || blank(step?.body)) {
            errors.push(`${at}: step ${i + 1} has no title or body.`);
          }
        });
      }
    }

    // Optional. Holds anything a clinical reviewer must decide or confirm —
    // deliberately NOT part of body/steps, which Task 10 renders straight into
    // the app. A user mid-emergency must never read "OPEN QUESTION for the
    // reviewer". Excluded from the content hash on purpose (see contentHash.mjs
    // and the Go implementation, which are pinned byte-for-byte against shared
    // fixtures): an open question is metadata about the review, not the
    // approved text, exactly like tags.
    if (item.open_questions !== undefined) {
      if (!Array.isArray(item.open_questions)) {
        errors.push(`${at}: open_questions must be an array of strings.`);
      } else {
        item.open_questions.forEach((question, i) => {
          if (blank(question)) {
            errors.push(
              `${at}: open_questions[${i}] is blank — a question a reviewer cannot read is not a question.`
            );
          }
        });
      }
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
