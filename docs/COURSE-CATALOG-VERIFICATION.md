# Course catalog verification — 27 October 2026

Starting revision: `ff5d660e6f60f08305a9fbf6ab3dc70654f23851`, clean `main`, synchronized with `origin/main` before implementation. See [the Arabic deployment and operations guide](COURSE-CATALOG.md).

## Verified source access and data quality

Read-only requests to the public WordPress endpoints succeeded without credentials. The implemented collector traversed the complete catalog using pagination headers and validated **197 published courses**, **26 categories**, and **196 embedded featured-image URLs**. Image URLs passed host/path validation; this does not claim that every remote image was downloaded or returned HTTP 200. With the seven explicitly approved relationships, **166** records match a university and **31** have no approved mapping; there were no conflicting university assignments in this inventory. Unknown records are retained for Owner review, not published or silently assigned to guessed universities.

The production synchronization CLI was then executed against a **separate disposable loopback database** (`campus_courses_live_test`), using the actual public source. It succeeded with 197 locally stored records, 166 publicly mapped records and 31 diagnostic records. Local public querying returned 92 UQU explanations. These are source observations at test time, not a guarantee that the live source count remains unchanged. No requests were sent to a Campus ingestion endpoint, and no Campus production database was accessed or changed.

Two minimal public records are retained in `tests/fixtures/course-catalog/verified-public-sample.json`, with source/date provenance. They contain identity/title/link/category/image metadata only, with no author, enrollment, order, pricing, lesson or credential data. Synthetic fixtures used for error and browser tests are clearly test records, not seeded academic or production course content.

## Local environment and checks

Windows, Node.js 22.14, Next.js 16.4.2, Prisma 7.9.1, headless Microsoft Edge, and isolated PostgreSQL **18** on `127.0.0.1`. PostgreSQL 17 and Plesk/Passenger were unavailable locally, so deployment-specific verification remains an operator step. The additive migration was successfully applied to fresh local test databases; no reset or production migration was executed.

| Check | Result |
| --- | --- |
| `npm test` | 69 passed, 0 failed/skipped |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run db:validate` | Passed |
| Existing PostgreSQL/HTTP/browser regression cases | All 70 passed in the full run, including news ingestion, administrator/Ambassador permissions, academic degrees, bulk actions, advertisements, keys and counters |
| Final `tests/integration/course-catalog.test.ts` | 12 passed, 0 failed/skipped, including desktop and mobile |
| Fresh migration/schema comparison | Migration applied successfully; `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` reported no difference |
| `npm run build` | Passed, including final Prisma generation and TypeScript compilation |
| `npm run verify:production` | Passed through unchanged `server.js`: 11 CSS/JS/preload assets, 24 font requests, 5 private-file denials; no copying |
| Additional built-server browser verification | Passed at desktop/mobile widths: homepage promotion navigation, course rendering, successful image display, 10 university tabs, UQU-only public query (92 local records), no horizontal overflow |

The first full run reported 80/82 passed: the new course browser subtest and its parent failed on navigation timing. A focused rerun then exposed a cached-image error occurring before hydration attached its error handler. The component now checks completed failed images when its DOM ref attaches, and the final 12-test focused suite passed. Navigation waits explicitly verify the destination; browser failures retain local screenshots for diagnosis. The 70 existing regression tests were already passing and were not rerun after this isolated course-image correction. No unqualified single-run 82/82 result is claimed.

Built-server browser verification used the separate local catalog populated from the real public source. Browser-side image requests were fulfilled with a test PNG to exercise successful rendering without fetching the full remote image catalog; the focused suite separately aborts the image request and verifies the cached-failure fallback. The probe did not synchronize into production, use production secrets or change production data.

Coverage includes source parsing, bounded pagination, drifting/empty/incomplete responses, duplicate identity, missing categories/headers, retry/backoff, invalid payloads, protected/unpublished source records, explicit mapping and conflicting categories, Arabic/English normalization, inert HTML, code/price filtering and media/link trust boundaries. Integration coverage exercises source-managed upserts, safe disappearance/reappearance, unchanged last-known-good state after failures, forced database rollback, concurrency leases, Owner-only settings/sync/mapping, revoked sessions, mapping bulk actions and no private fields in public responses. Desktop/mobile checks cover homepage promotion, search, scoped university listings, existing tabs, safe outbound links, Telegram configured/unconfigured states and shared mapping selection.

## Release boundaries

One additive migration: `202610270001_course_catalog`. No new application environment variables or packages, no changes to `server.js`, Next.js deployment configuration, production settings, existing university records, accounts, n8n keys, ingestion workflows or academic-program source/deletion semantics. The mapping initializer is an explicit optional command, preserves existing mappings and never creates universities.

Before production use, the operator must pull/deploy, apply the migration, initialize/review mappings, build/restart, enable synchronization as Owner, verify the first manual run and create the six-hour Plesk task. Its protected environment must supply the existing `DATABASE_URL`; Node application variables may not be inherited by scheduled tasks. No WordPress credentials are required. The official Telegram support URL remains an Owner configuration prerequisite; absent configuration hides the CTA. No destination was invented.

The source has no distributed snapshot guarantee: the collector checks counts, IDs, page boundaries and first-page consistency, and rejects detected changes. Extremely large catalogs exceeding the documented safety caps require a reviewed limit change. Unexpected mass removals require an Owner's exact-count confirmation tied to an identical recent source inventory; empty replacement of an existing catalog is always rejected. Neither schedules nor production migrations nor Plesk settings were executed automatically.
