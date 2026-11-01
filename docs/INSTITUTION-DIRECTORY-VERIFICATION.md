# Final institution cleanup and administration — verification

Baseline: clean main at `170bb2c5c9d0b174a86e258bddb0bf5c525396b3`. Read AGENTS, project/operations/catalog/reconciliation documentation and the installed Next.js client-component guide. Inspected the schema, migrations, institution lifecycle, discovery consumers, administrative routes, role policies, bulk controls, import provenance, mapping/sync guards, file storage and seed behavior before changing code.

The final Owner decision supersedes the previous hide-only release. Its old wizard implementation and tests were replaced by tests of the actual irreversible operation, shared-record preservation and short confirmation flow. Historical source/audit figures remain labelled as historical.

## Boundaries

Windows, Node.js 22.14, Next.js 16.4.2, Prisma 7.9.1, headless Edge and fresh loopback PostgreSQL **18** databases. No production database, production secrets, migrations, cleanup, synchronization, deployment, Plesk change or backup creation. No Docker, standalone output, asset copying, dependency change, new environment variable or changed n8n contract.

New additive migration: `202611010001_institution_cleanup`, creating only the `MediaDeletionJob` outbox. No institutions are created, hidden, disabled or deleted by this migration, build or startup. Existing migration history remains intact. Actual destructive execution is Owner-only after deployment.

## Source verification

Read-only full WordPress inventory fetched **2026-11-01 10:01:01 UTC** through the existing paginated source client, with pagination header validation: **26 categories, 198 published courses**. The ten approved categories account for 193 unique institution-associated courses; five remain outside these institution mappings. Retrieved counts: 118→4, 159→1, 173→10, 227→92, 287→16, 310→9, 375→47, 376→1, 377→3, 378→10. No source credentials were used and nothing was sent to Campus production.

Source endpoints: `https://estudy24.com/wp-json/wp/v2/course-category` and `https://estudy24.com/wp-json/wp/v2/courses`. Counts are observations, never synchronization constants.

## Automated coverage

The focused isolated database suite checks:

- Read-only preflight, exact target identities, Owner/session checks and strict confirmation payload; no credentials or account email/hash output.
- Duplicate identities, unknown institutions, inactive matches, slug conflicts, missing or altered mapping safeguards and changed graph fingerprints.
- Unknown actual database cascades and cross-university provenance block the transaction.
- A trigger deliberately throws at the late University deletion step; all earlier content/account/mapping/outbox changes roll back.
- Permanent deletion of exclusive content, sources, keys and accounts while preserving retained IDs/slugs/rows, sessions, keys, original mappings, shared/global advertisements and historical audit/edit records.
- Shared upload metadata stays valid; exclusive bytes are removed only after commit. Filesystem failure remains queued and can be retried safely.
- Completion marker and repeated seeds cannot recreate retired institutions. College identity and deterministic new mapping are preserved.
- Authenticated HTTP and CSRF boundaries, retired endpoint behavior, desktop/mobile accordion keyboard behavior, role-filtered navigation and actual browser confirmation.

Existing suites also cover the content and Ambassador isolation, ingestion/deduplication/editorial protection, cross-page bulk permissions, accounts and reset protections, mapping/synchronization failure guards, public pages and media.

## Executed results

| Check | Final result |
| --- | --- |
| Unit tests (`npm test`) | 84 passed, no failures/skips |
| Academic programs PostgreSQL/HTTP/browser | 9 passed |
| Administrator bootstrap/accounts | 8 passed |
| Ambassador lifecycle/isolation/browser | 9 passed |
| Automation/content ingestion | 13 passed |
| Backend authentication/ingestion | 8 passed |
| Unified bulk operations/browser | 12 passed, including 333-program publication |
| Course catalog synchronization/browser | 12 passed |
| Course fidelity/browser | 5 passed |
| Final institution cleanup/HTTP/browser | 8 passed |
| University seeds/ads/counter/scoped keys | 11 passed |
| Integration/browser aggregate | 95 passed across isolated suites; no skipped suites |
| Shared-database sequential cleanup → university suites | 19 passed, 0 failed/skipped; cleanup fixtures and completion marker removed between suites |
| `npm run typecheck` | Passed after build |
| `npm run lint` | Passed |
| `npm run db:validate` | Passed |
| `npm run build` | Passed with existing webpack/Prisma 7 build |
| Fresh database migrations | Applied successfully to isolated PostgreSQL 18 databases |
| `npm run verify:production` | Passed: 11 CSS/JS/preload assets, 24 Arabic-font requests, 5 private-file denials; no copying |

The first regression pass saw an unexpected HTML response during an academic-ingestion development-server request; the settled-code rerun passed all 9 without ingestion changes. Initial new browser assertions incorrectly counted only expanded accordion links and assumed a hard 404 after a streamed not-found response; those assertions were corrected to test authorized DOM entries and actual not-found UI plus noindex. The complete final cleanup suite then passed. The academic, cleanup and bulk suites were rerun sequentially after the final UI adjustments; the aggregate is per-suite results, not a claim of one uninterrupted all-green invocation.

A final test-isolation correction adds fixture teardown to the new cleanup suite, matching the existing sequential integration runner. Both the cleanup and following university suite then passed together against one fresh loopback test database (19 checks). This also verifies that the one-time production completion marker from the cleanup fixture cannot influence the next suite's seed expectations. TypeScript and ESLint passed again after this test-only correction; application code and the previously verified production build are unchanged.

Desktop/mobile browser checks covered **1440, 390 and 320px**, all three roles, automatic group expansion, collapse-all, keyboard toggling, mobile drawer Escape, logout visibility, no page overflow, ordinary management pages and the actual one-confirmation cleanup HTTP operation. Screenshots were visually reviewed locally; they contain only isolated fixtures and are not committed.

An additional built `server.js` probe verified local public catalog/university totals, unauthorized private access, completed cleanup state and a real individual article soft-delete through the new shared confirmation dialog, including cancellation without mutation. HTTPS Origin forwarding was emulated through a local Node transport for this production-mode test; browser HTTP-origin requests were correctly rejected first. No authentication/CSRF safeguards were weakened. Actual HTTPS/Passenger behavior remains a Plesk operator check.

## Live source → isolated catalog

A second complete public-source retrieval at **2026-11-01 10:42:35 UTC** was synchronized into the already-cleaned local database, then the same validated inventory was synchronized again. Result: **198 local source records; 193 public mapped explanations; 5 unknown; 0 ambiguous; 10 participating institutions**. WordPress-to-Campus IDs stayed stable, all mapping rows stayed unchanged across repeat synchronization, and IAU source course 33899 mapped correctly. UQU 92, PNU 3, IMAMU 47, IAU 10, Baha 16, Qassim 4, KAU 1, Tabuk 1, Jazan 10, Yanbu Industrial College 9. A pre-existing fixture Baha record kept its custom slug and ID. These are local synchronization results from real public source data, **not production ingestion**.

## Main implementation files

- `src/server/institution-cleanup.ts`, private `api/institution-cleanup/route.ts`: fixed approved identities, live graph, shared/exclusive plan, transaction, completion audit and Owner authorization.
- `prisma/schema.prisma`, `202611010001_institution_cleanup/migration.sql`, `src/server/media-cleanup.ts`, `scripts/maintenance.ts`: transactional file-deletion queue and retry.
- `prisma/seed-campus.ts`: completion-aware protection against resurrecting retired institutions.
- `src/lib/admin-navigation.ts`, shared admin shell/header/confirmation/bulk components and resource manager: compact role-aware RTL management.
- Admin catalog/advanced/platform-settings pages and focused catalog components: existing functions regrouped; source mappings remain Owner-only.
- Old reconciliation wizard/service removed; bookmark redirect and authenticated read-only diagnostic alias retained; old mutation endpoint returns 410.
- Focused cleanup and navigation tests, updated existing course-browser expectation, operational/admin documentation.

## Production follow-up

The actual private production graph remains unknown until the Owner runs **مراجعة المؤسسات**. Conflicts stop execution; they are not permission to guess or broadly cascade-delete. Production PostgreSQL **17**, Passenger/Plesk startup, permissions to lock the reviewed tables, actual shared dependencies, existing retained sessions/keys/n8n and the final public directory must be checked by the operator. Local PostgreSQL 18 success is not a claim that these production checks ran.

Use [minimum deployment and Owner procedure](INSTITUTION-DIRECTORY.md). Deployment alone performs no cleanup. The audit completion marker reports a committed database cleanup; any deferred file jobs are handled by existing daily maintenance. There is no visibility rollback for permanent deletion.
