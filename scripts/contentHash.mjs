/**
 * Canonical content hash — must stay byte-identical to
 * api/internal/domain/contenthash.go. Both are pinned by
 * api/testdata/content-hash-fixtures.json.
 *
 * Build-time only. The app never computes this; it compares two precomputed
 * strings, because React Native has no SHA-256 without a native dependency.
 */
import { createHash } from "node:crypto";

const SEPARATOR = "\x1f";

// Closed ASCII set: TAB LF VT FF CR SPACE. Deliberately not \s, which matches
// U+FEFF (Go's unicode.IsSpace does not) and misses U+0085 (Go's does). Either
// divergence silently demotes every reviewed item forever.
const HASH_SPACE = /[\t\n\v\f\r ]+/g;

export function normalizeHashField(value) {
  if (value === null || value === undefined) return "";

  let s = String(value).normalize("NFC").replace(HASH_SPACE, " ");

  // Not .trim(): JavaScript's trim strips U+00A0 and U+FEFF, which the Go
  // implementation preserves as content. Runs are already collapsed, so at
  // most one leading and one trailing space can remain.
  if (s.startsWith(" ")) s = s.slice(1);
  if (s.endsWith(" ")) s = s.slice(0, -1);

  return s;
}

export function contentHash(item) {
  const fields = [item.slug, item.title, item.summary, item.body];

  for (const step of item.steps ?? []) {
    fields.push(step.title, step.body);
  }
  for (const source of item.sources ?? []) {
    fields.push(source.title, source.publisher, source.year, source.url);
  }

  const joined = fields.map(normalizeHashField).join(SEPARATOR);
  return createHash("sha256").update(joined, "utf8").digest("hex");
}
