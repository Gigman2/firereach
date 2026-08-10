# safety-content.bundled.json — authored data, edit with care

Unlike `stations.bundled.json`, which is generated and must never be
hand-edited, **this file is the source of truth and is edited by hand.** The
Postgres seed and the reviewer packet are both generated *from* it.

## Editing rules

1. After any edit, run `npm run build:content-seed` to refresh `content_hash`
   and regenerate `api/seeds/safety_content.sql`. A stale hash fails CI.
2. Editing the title, summary, body, steps, or sources of an item whose
   `review.state` is `reviewed` **invalidates that review.** The hash stops
   matching and the app demotes the badge to "awaiting review" on its own.
   This is intended — the reviewer approved specific words.
3. Never set `review.state` to `reviewed` by hand without a real reviewer
   name, date, and the content hash they actually approved. The database
   rejects such rows and so does validation.
4. Never invent a source. If a citation cannot be verified against its
   publisher, mark it `"unverified": true`.

## Review process

`npm run build:review-packet` renders `app/docs/content-review/*.md` for a
qualified reviewer (Ghana Health Service, GNFS, or equivalent). Their sign-off
comes back as `reviewer_name`, `reviewer_credential`, `reviewed_at`, and the
`content_hash` of what they read.

Product Scope §9: *"Static safety content must be reviewed by a qualified
source (Ghana Health Service, GNFS, or WHO guidelines) — do not self-author
medical first aid steps."*
