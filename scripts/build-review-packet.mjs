#!/usr/bin/env node
/**
 * Renders app/docs/content-review/*.md — the artifact a qualified reviewer
 * (Ghana Health Service, GNFS, or equivalent) actually reads and signs. The
 * reviewer never opens JSON.
 *
 * The actual JSON -> Markdown transformation lives in reviewPacket.mjs, which
 * has no filesystem or process access and can be imported into Jest directly;
 * this file is the only place import.meta / process.argv are used, and it
 * only ever runs via `node scripts/build-review-packet.mjs` (native ESM),
 * never through a test.
 *
 * Usage: npm run build:review-packet
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateContent } from "./contentValidate.mjs";
import { selectForReview, toMarkdown } from "./reviewPacket.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const contentPath = resolve(here, "../src/data/safety-content.bundled.json");
const outDir = resolve(here, "../docs/content-review");

// Same "was I run directly?" guard as build-safety-content-seed.mjs — without
// it, a future import of this module would write files as a side effect of
// loading it.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const items = JSON.parse(readFileSync(contentPath, "utf8"));

  const errors = validateContent(items);
  if (errors.length > 0) {
    console.error(`Refusing to build a packet from invalid content:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }

  const forReview = selectForReview(items);
  mkdirSync(outDir, { recursive: true });

  for (const item of forReview) {
    writeFileSync(resolve(outDir, `${item.slug}.md`), `${toMarkdown(item)}\n`);
  }

  const unverified = forReview.flatMap((i) =>
    (i.sources ?? []).filter((s) => s.unverified).map((s) => `${i.slug}: ${s.title}`)
  );

  const index = [
    "# FireReach safety content — review packet",
    "",
    `${forReview.length} item(s) awaiting or holding review.`,
    "",
    ...forReview.map((i) => `- [${i.title}](${i.slug}.md) — ${i.review.state}`),
    "",
    "## Unverified citations needing attention",
    "",
    unverified.length ? unverified.map((u) => `- ${u}`).join("\n") : "_None._",
    "",
  ].join("\n");

  writeFileSync(resolve(outDir, "README.md"), index);
  console.log(`Wrote ${forReview.length} review file(s) to ${outDir}`);
  if (items.length !== forReview.length) {
    console.log(`Excluded ${items.length - forReview.length} draft item(s).`);
  }
}
