#!/usr/bin/env node
/**
 * CLI entrypoint: reads the authored content file, refreshes each item's
 * content_hash in place, and writes api/seeds/safety_content.sql. The actual
 * JSON -> SQL transformation lives in safetyContentSeed.mjs, which has no
 * filesystem or process access and can be imported into Jest directly; this
 * file is the only place import.meta / process.argv are used, and it only
 * ever runs via `node scripts/build-safety-content-seed.mjs` (native ESM),
 * never through a test.
 *
 * Direction note: this is JSON -> SQL, the reverse of build-stations-bundle.mjs.
 * Station data is derived from an external authority so its seed is canonical;
 * safety content is authored and reviewed by a human working in prose, so the
 * readable artifact is canonical and the SQL is generated.
 *
 * Usage: npm run build:content-seed
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { contentHash } from "./contentHash.mjs";
import { toSql } from "./safetyContentSeed.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const contentPath = resolve(here, "../src/data/safety-content.bundled.json");
const outPath = resolve(here, "../../api/seeds/safety_content.sql");

const items = JSON.parse(readFileSync(contentPath, "utf8"));

let rehashed = 0;
for (const item of items) {
  const fresh = contentHash(item);
  if (item.content_hash !== fresh) {
    item.content_hash = fresh;
    rehashed += 1;
  }
}

const sql = toSql(items);

writeFileSync(contentPath, `${JSON.stringify(items, null, 2)}\n`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, sql);

const stale = items.filter(
  (i) => i.review?.state === "reviewed" && i.review.content_hash !== i.content_hash
);

console.log(`Wrote ${items.length} items to ${outPath}`);
console.log(`Refreshed ${rehashed} content hash(es)`);
if (stale.length > 0) {
  console.warn(
    `\n  ${stale.length} item(s) were edited after review and will now show ` +
      `"awaiting review":\n    ${stale.map((i) => i.slug).join("\n    ")}`
  );
}
