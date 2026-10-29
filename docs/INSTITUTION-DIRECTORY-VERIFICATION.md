# Institution directory reconciliation — verification

Baseline: clean `main` at **`f67b0caaab2f9bcec0b4ab34e67183405eea4da5`**. The approved audit and subsequent Owner decisions were read before implementation. Existing schema, university lifecycle, source synchronization/mapping, public discovery consumers, admin CRUD/bulk operations, seeds, authorization and relationships were inspected. Relevant installed Next.js route-handler documentation was read under the repository's AGENTS instructions.

## Boundaries

Windows, Node.js 22.14, Next.js 16.4.2, Prisma 7.9.1, headless Edge, disposable loopback **PostgreSQL 18** databases. No production PostgreSQL connection, credentials, migrations, reconciliation, synchronization, deployment or Plesk settings were used. Public source/Campus GET requests were read-only. A local PostgreSQL 18 success is not a PostgreSQL 17 or Passenger/Plesk production verification.

Only additive migration **`202610290001_institution_directory`** is introduced. Existing rows default to `showInDirectory=true` and `institutionType=UNIVERSITY` without changing operational `enabled`. It creates no institution or mapping and hides none. No dependency, environment-variable or scheduling change; no n8n workflow or ingestion contract changes; no student/user/payment features.

## Executed local checks

| Check | Result |
| --- | --- |
| Unit tests | 82 passed, no failures/skips |
| Focused institution PostgreSQL/HTTP/browser suite | 11 passed, no failures/skips |
| Prisma schema validation | Passed |
| TypeScript | Passed; production build also compiles the application and test types |
| ESLint | Passed, including the final implementation |
| Fresh local migrations | Applied successfully to disposable test databases |
| Existing-data migration preservation | Passed on a previously populated local test database: 7 institutions' IDs/names/slugs/enabled unchanged; 197 courses, 7 mappings, 1 administrator and 1 session preserved; additive defaults verified |
| Actual public source synchronization in separate local database | Passed: 198 courses, 193 mapped, 5 unknown, 0 ambiguous; 7 original mappings preserved; all 198 course IDs stable across repeat synchronization |
| Final `npm run build` and `npm run typecheck` | Passed after the responsive and alias-preservation corrections; 33 static pages generated, private reconciliation routes included |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | No difference on the migrated local database |
| Final `npm run verify:production` | Passed through unchanged `server.js`: 11 CSS/JS/preload assets, 24 font requests, 5 private-file denials, no copying |
| Final built-server browser/API checks | Passed at 320/390/1440px: 10 visible institutions including 1 College, hidden direct pages, scoped hidden-institution course search, homepage discovery, hydrated Owner preflight refresh, IAU 33899 public, no browser WordPress API calls, unchanged operational/directory states |
| Built-server permission checks | Anonymous preflight GET/POST 401; Editor/Ambassador preflight denials 403; all 32 global Ambassador operations, including PATCH audit, returned 403 |

The first focused run found an incorrect Prisma field name in a new test assertion (`originalId` instead of `originalArticleId`); it was corrected and the focused suite passed. This was test code, not an ingestion-contract change. Fixture typing was checked separately; no production behavior was altered to bypass an assertion.

### Regression accounting

The complete fresh-database run executed **98 checks: 96 passed, 2 failed, no skips**. Both failures describe the same event: the Ambassador global-denial subtest received one unexpected development-server HTTP 500 for `PATCH audit`, and its parent suite consequently failed. No authorization code or expected denial was weakened. A separate serial rerun of the complete Ambassador, catalog and institution suites passed **32/32**, including all Ambassador global denials; the other **66** checks had passed in the full run. This is not claimed as a single clean 98/98 invocation. The development-server response was not reproduced in isolation; diagnostic output included streaming errors, but does not establish the original response's exact cause.

Final production-mode checks also returned 403 for that request and every other forbidden global Ambassador operation. The first local production-mode probe intentionally failed its login expectation because it supplied an HTTP `APP_URL`; the unchanged production HTTPS safeguard correctly returned 503. The corrected probe uses an HTTPS external-origin configuration/header over the loopback Node upstream connection, emulating proxy termination without weakening authentication. This does not test a real TLS certificate or Plesk proxy. Temporary synthetic course/account fixtures were local only, removed afterward, and were not part of the real-source count or any seed.

After the narrow-screen correction and compatibility review, the institution suite was rerun again: **11/11 passed**, including **320, 390 and 1440px** and preservation of an additional existing disabled category alias when reusing an institution. That alias is not removed or enabled by reconciliation. Expected transaction-conflict/constraint errors in adversarial tests are checked rejections, not successful partial writes.

## Focused coverage

- Additive discovery defaults; optional validation fields preserve compatibility with existing clients; controlled UNIVERSITY/COLLEGE values and correct College vocabulary.
- Owner preflight is read-only, includes inactive records and all-status dependency counts, and omits passwords/hashes/session data/key secrets/account names and emails. Source-history counts are exposed only through this Owner boundary.
- Missing/conflicting approved mappings, duplicate candidates including inactive records, occupied slugs, tampered bodies and changed preflight fingerprints reject execution. A transaction that encounters a late slug conflict rolls back earlier work completely.
- Concurrent approvals produce one successful reconciliation, no duplicate institutions and no partial second execution. Existing inactive Baha identity is reused with its original ID/slug/name/description and stays inactive. It becomes operational only after a separate explicit Owner edit.
- All ten original IDs/slugs/enabled states and the original seven complete mapping rows are unchanged. Existing KSU Ambassador sessions stay identical; its scoped key authenticates after directory hiding. Real HTTP ingestion through that key still succeeds and creates pending-review news attached to KSU.
- Hidden-but-enabled institutions' direct pages, published article route, events, training, academic degrees, links and advertisements remain available. Discovery excludes their names; source-scoped content and authorization remain operational.
- Directory API counts, name search and College filter are consistent. Homepage uses the same discovery query; course options use the same policy. Sitemap still includes hidden-but-enabled direct pages.
- Repeated reconciliation reuses existing records; separate bulk directory actions preserve operational state. Rollback restores visibility without deleting institutions, mappings or content, or revoking sessions/keys. Significant changes are audited.
- Existing additional category mappings are preserved when the Owner verifies a reused institution; a disabled alias is not enabled as a side effect. Distinct approved institution identities still cannot collapse onto one record.
- Repeated Campus seeds preserve disabled/hidden state, manually edited names and deliberately cleared official URLs, and retain all three new mappings. Other source/ad identities remain idempotent.
- Owner page and college directory/news UI exercised at **320, 390 and 1440px**, with accurate college labeling, disabled submission without explicit approvals, typed confirmation, visibility rollback and the separate operational/visibility form controls. The 320px production-mode probe exposed a hero text column shrinking to 31px beside its fixed logo: `basis-60` now allows that text to wrap below the logo instead of overflowing. The approved visual identity and shared course-card sizing remain unchanged.
- Owner/Editor/Ambassador server boundaries and CSRF checked through HTTP. New global endpoints reject non-Owners and unauthenticated callers; no directory-visibility authorization condition was added to account sessions or ingestion keys.

Final directory and college-page screenshots were visually inspected. Missing official logos/sites remain empty with the existing graceful fallback, rather than fabricated assets or links. Existing public route identifiers, university slugs and course-card design remain intact.

## Actual source and IAU 33899

At **2026-10-29 12:14:59 UTC**, public source ID 33899 returned status `publish`, category `[378]`, modified `2026-10-28T08:05:23`; Campus's public IAU listing still returned 9 and omitted its destination URL. Source access was unauthenticated. No private production mapping/sync log was inferred from that public difference.

A complete fresh public source inventory was subsequently traversed using the existing guarded collector, then synchronized **only into a separate local test database**, following an explicitly approved local reconciliation. At **12:34:53 UTC**, its results were:

| Measure | Observed |
| --- | --- |
| Source categories / courses | 26 / 198 |
| Mapped to institution / unknown / ambiguous | 193 / 5 / 0 |
| Baha category 287 | 16 publicly listed explanations |
| Tabuk category 159 | 1 publicly listed explanation |
| Yanbu Industrial College category 310 | 9 publicly listed explanations, College identity |
| IAU course 33899 | Present, sourcePublished=true, mappingState=mapped, university slug iau, publicly returned |
| Repeat run | All 198 internal IDs unchanged; original seven mapping rows unchanged |

The source/normalization/persistence/public pipeline accepted 33899 without a collector change. **No genuine reproducible collector defect was found.** This does not prove the cause of its production omission. Owner preflight now exposes local record state, category IDs, timestamps, last successful synchronization and recent result/error metadata so the operator can distinguish stale inventory, stopped/failed/quarantined synchronization, or local mapping/publication state. The approved 378 → iau mapping was not changed. No production synchronization was triggered.

## Release and operator verification

See [the Arabic staged rollout and rollback guide](INSTITUTION-DIRECTORY.md). Owner approval of actual inactive/existing identities and new slugs remains mandatory; official URLs/logos/contact details are not invented. Deployment alone retains every existing operational state and directory entry. Production PostgreSQL 17 migration, Passenger startup/static assets, real private dependency counts, current Ambassador sessions/keys/n8n, actual source timing and post-approval public results must be verified by the operator.

No production data or private export is committed. Generated files, local test databases, source-response captures, screenshots, diagnostics and secrets remain outside Git.
