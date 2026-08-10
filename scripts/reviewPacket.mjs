/**
 * Pure JSON -> Markdown transformation for the reviewer sign-off packet, with
 * no filesystem or process access. Kept separate from build-review-packet.mjs
 * (the CLI entrypoint) so it can be imported into Jest without needing to
 * handle import.meta or any of Node's ESM-loader-only globals — see
 * safetyContentSeed.mjs for the same split applied to the seed generator.
 */

/**
 * Drafts are scaffolding, not content, and withdrawn items are no longer
 * awaiting anyone's sign-off. Only pending_review and reviewed items belong
 * in front of a clinician. This filter is a safety mechanism, not a
 * convenience: the two placeholders currently in the content file are
 * `draft` and contain the literal text "Placeholder body. Replaced with
 * sourced content in Task 7." If a draft slipped through, a reviewer would
 * be signing their name and professional credential to placeholder text.
 */
export function selectForReview(items) {
  return items.filter(
    (i) => i.review?.state === "pending_review" || i.review?.state === "reviewed"
  );
}

/**
 * Given the filenames currently sitting in docs/content-review/ and the full
 * content file, returns exactly the filenames the CLI should delete: ones it
 * could have generated (name is `<slug>.md` for a slug that still exists in
 * the content file) whose item has left the review set — e.g. withdrawn, or
 * demoted back to draft for rework.
 *
 * withdrawn is how a content authority pulls a guide judged unsafe; leaving
 * its file behind after that would put a plausible-looking, no-longer-valid
 * instruction on a reviewer's desk — the one mechanism for pulling dangerous
 * content wouldn't actually remove it from where a reviewer looks.
 *
 * Deliberately conservative in two ways: never names README.md (the index,
 * rewritten wholesale every run, not a per-item file), and never names a
 * file whose slug isn't in the content file at all — that could be a human's
 * notes dropped in the same folder, not this generator's to touch.
 */
export function selectStaleFiles(filenames, items) {
  const reviewSlugs = new Set(selectForReview(items).map((i) => i.slug));
  const knownSlugs = new Set(items.map((i) => i.slug));

  return filenames.filter((name) => {
    if (name === "README.md" || !name.endsWith(".md")) return false;
    const slug = name.slice(0, -".md".length);
    return knownSlugs.has(slug) && !reviewSlugs.has(slug);
  });
}

export function toMarkdown(item) {
  const lines = [];

  lines.push(`# ${item.title}`);
  lines.push("");
  lines.push(`**Slug:** \`${item.slug}\`  `);
  lines.push(`**Section:** ${item.category === "first_aid" ? "First Aid" : "Hazard"} — ${item.subcategory}  `);
  lines.push(`**Current state:** ${item.review?.state ?? "unknown"}  `);
  lines.push(`**Content hash:** \`${item.content_hash}\``);
  lines.push("");
  // A reviewer is approving specific words, not a topic. Spelling this out
  // is what makes the hash meaningful to someone who has never seen one.
  lines.push("> Your sign-off binds to the exact text below. If any word changes");
  lines.push("> afterwards, the hash stops matching and the app automatically");
  lines.push('> reverts this item to "awaiting review".');
  lines.push("");

  if (item.summary) {
    lines.push(`_${item.summary}_`);
    lines.push("");
  }

  lines.push("## Text as the user sees it");
  lines.push("");
  lines.push(item.body);
  lines.push("");

  if (item.steps?.length) {
    lines.push("### Steps");
    lines.push("");
    item.steps.forEach((step, i) => {
      lines.push(`${i + 1}. **${step.title}** — ${step.body}`);
    });
    lines.push("");
  }

  lines.push("## Sources cited");
  lines.push("");
  for (const s of item.sources ?? []) {
    // Uppercase and a warning glyph so this cannot be skimmed past — it is
    // the single most useful signal in the packet.
    const flag = s.unverified ? " **⚠ UNVERIFIED — please confirm or replace**" : "";
    lines.push(`- ${s.title} — ${s.publisher}, ${s.year}. <${s.url}>${flag}`);
  }
  lines.push("");

  lines.push("## Sign-off");
  lines.push("");
  lines.push(
    "**How to review:** confirm the text above is correct and safe for use in " +
      "Ghana, or correct it — you're reviewing these exact words, not the topic. " +
      "**Approved** = correct as written, publishable under your name. " +
      "**Corrected** = sound, but wording must change (describe the change " +
      "below). **Withdrawn** = stop showing this to the public entirely, not " +
      "just hide a badge — only choose this if you mean that. Until an item is " +
      "signed off, it displays to the public as sourced but unreviewed. Send " +
      "the completed file back to the FireReach team, who will record your " +
      "name, credential, and date. Your sign-off binds to the content hash " +
      "above; if the text changes afterward, this automatically reverts to " +
      '"awaiting review."'
  );
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push("| Reviewer name | |");
  lines.push("| Qualification / institution | |");
  lines.push("| Date reviewed | |");
  lines.push("| Verdict | Approved / Corrected / Withdrawn |");
  lines.push("| Corrections required | |");
  lines.push("");

  return lines.join("\n");
}
