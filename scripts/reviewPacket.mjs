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
