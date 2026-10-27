# Course catalog fidelity and compact cards — 27 October 2026

Starting revision: `aad310316b4579dd7f0be9f7397516c82f2b7e48`, clean `main`, equal to `origin/main` before editing. This section supersedes the initial catalog rollout's title/description expectations below. Operations guide: [COURSE-CATALOG.md](COURSE-CATALOG.md).

## Confirmed root causes

The complete path was inspected: public WordPress REST response → `parseCourse` → unconditional `CourseExplanation` upsert by WordPress ID → public field selection → React card. The previous `courseDisplayTitle` deleted codes and empty parentheses/dashes before persistence; `parseCourse` also sliced titles at 500 characters. Public responses selected that altered `title`. The longest live title was 82 characters: code removal caused the observed losses; the length cap was an additional risk for future long titles.

WordPress flattened paragraphs/anchors into `excerpt.rendered`, including `الدعم الفني<a href="https://t.me/eStudy_24">…</a>` becoming adjacent contact text and URL. The old pipeline preferred that excerpt, removed HTML structure with regex, then split on every period, including dots in `youtu.be` and `t.me`. It dropped commercial/code-containing segments and retained domain fragments. Full-width 4:3 images in vertical three-column cards caused the oversized layout.

The new server-only `course-text.ts` uses `parse5@8.0.1` for inert HTML5 parsing (`entities` is its sole added transitive dependency). Titles retain decoded source punctuation, numbers, codes and section labels, with whitespace normalization only. Structured content introductions are preferred; an appropriate excerpt is a fallback. Block/line boundaries and anchor context are retained; URLs are recognized before sentence selection. Sales/support/refund/boilerplate text is excluded without confusing academic terms such as graphs, momentum, information retrieval, sets or support vectors. Unsuitable descriptions receive exactly **شرح المادة متوفر على منصة eStudy24.** Nothing is executed, rewritten upstream or rendered as imported HTML.

## Verified real-source data and repair

Unauthenticated, read-only WordPress requests succeeded for the complete **197-record** catalog. All records normalized, with **194 introductions**, **3 explicit fallbacks**, and **0 summaries retaining the checked URL/support/subscription/price fragments**. The three fallback records had two empty descriptions and one placeholder `text` description. Titles were not invented or renamed.

| WordPress ID | Baseline result | Corrected result |
| --- | --- | --- |
| 31006 | جبر خطي -القسم الثاني | جبر خطي (MTH1441) -القسم الثاني |
| 29168 | دوائر الكترونية -القسم الاول | (EE2102T) دوائر الكترونية -القسم الاول |
| 22239 | معادلات تفاضلية و جبر خطي -القسم الاول | Same complete original title |
| 8277 | كيمياء الكم | كيمياء الكم 447CHEM |
| 9182 — description | `be/2o2ptwAGP6Y?si=…– التواصل مع الدعم الفنيhttps://t. me/eStudy_24` | تتضمن هذه الدروس شرح مقرر الكيمياء الحيوية |

`verified-description-html.json` retains six representative public records with actual source HTML/provenance. `baseline-transform.json` was computed using the deployed baseline's unchanged functions, not guessed failure strings. No credentials/private student data are included. ID 9182 had unmapped category 287 in this capture: no university relationship was invented for the example. Its cleaned source record stays excluded publicly until the Owner explicitly maps its category.

A separate **disposable loopback database** was populated with all 197 real records using the baseline transformations. One authorized Owner synchronization with a fresh actual public inventory preserved **all 197 internal IDs**, restored **36 titles**, and recomputed **194 descriptions**, with no duplicates or mapping changes. Results stayed **166 mapped / 31 unknown / 0 ambiguous**. This verifies the normal synchronization path repairs existing records even without an upstream modification timestamp change. No production database or Campus ingestion endpoint was accessed.

## Compact layout and test coverage

Both public views share `CourseCard`: 56×42 thumbnails on narrow cards, 96×72 on sufficiently wide cards, `object-fit: contain`, existing missing/failed-image fallback, modest padding and direct **عرض الشرح** links. Card-width container queries place the CTA in a consistent side column on desktop and footer row on narrow cards. Auto-fit produces two columns only when the actual content area fits them, including university pages with advertisement sidebars. Full titles wrap without clamping/ellipsis; descriptions alone clamp to two visual lines while retaining accessible text. Exceptionally long titles can increase their own card height; neighboring cards do not stretch into empty panels.

Browser coverage uses **320, 360, 390, 768 and 1440px** on `/courses` and university course views. It checks full real titles, uncut long titles, full-title/code search, two wide-screen columns, normal-card bounds below 220px on wide cards and 330px on narrow test cards, thumbnails below 100×76, RTL placement, no horizontal overflow, original safe destinations, actionable links, exact fallback and no browser WordPress REST requests. Remote images use test bytes to avoid repeatedly downloading the source catalog; existing tests separately cover cached image failures.

An additional **built-production-server** browser probe used the complete real-source local catalog and actual remote course images, without interception. Both public views passed at **320, 390 and 1440px**; the 12 displayed UQU cards had maximum article heights of **228, 204 and 130px**, respectively. Images loaded successfully in every view (off-screen lazy images were not all requested); desktop and mobile screenshots were inspected. UQU public API returned **92** correctly scoped courses, embedded-code searches returned complete titles, summaries contained no checked URL fragments, and browsers made no WordPress REST requests. This checks local production mode, not the live Campus deployment.

Unit coverage includes codes in both orders, mixed Arabic/English, Unicode/named/numeric entities, inline emphasis, malformed tags, adjacent anchors, bare/spaced URL fragments, content-versus-excerpt selection, sales/support/refunds, academic terminology, unsafe/hidden elements, decimals, word boundaries and fallback. Database/HTTP tests verify repaired persistence, unchanged IDs/timestamps/destinations, mapping/publication preservation, unknown exclusions, repeated imports and an untouched independent academic record.

Current checks (Windows, Node.js 22.14, Next.js 16.4.2, Prisma 7.9.1, Edge, isolated PostgreSQL **18**):

| Check | Result |
| --- | --- |
| `npm test` | 78 passed, 0 failed/skipped |
| `npm run test:integration` — complete fresh-database run | 87 passed, 0 failed/skipped, including accounts, Ambassador isolation, ingestion, academic programs, bulk actions, advertisements, keys, counters, existing catalog behavior and the new fidelity suite |
| Focused `tests/integration/course-fidelity.test.ts` | 5 passed, 0 failed/skipped |
| Actual-source full-catalog normalization and local repair | Passed, as detailed above |
| `npm run lint` | Passed |
| `npm run db:validate` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, including Prisma generation and Next.js production TypeScript/static generation |
| `npm run verify:production` | Passed through unchanged `server.js`: 11 CSS/JS/preload assets, 24 font requests, 5 private-file denials; no copying |
| Built-server real-source API/browser/image checks | Passed on both public views at 320/390/1440px; visual inspection passed |

Production PostgreSQL 17/Plesk/Passenger are unavailable locally and remain operator checks. **No Prisma migration, seed, new environment variable, credential or schedule change is required.** After Plesk Pull/Deploy, run `npm ci --include=dev`, `npm run build`, then **Restart App** and one normal Owner **مزامنة الآن** (or await the next successful six-hour run). Existing complete-inventory, transaction, lease and removal safeguards remain intact. No production deployment, migration or database write was performed. Future nonstandard descriptions may conservatively receive the fallback instead of speculative text; very long titles intentionally remain fully readable.

## Historical initial rollout — baseline only

The following records the earlier `aad3103` implementation checks, not the correction's current test run or title policy.

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
