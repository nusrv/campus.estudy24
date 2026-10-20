# Phase-three verification — 20 October 2026

The public portal and CMS extensions are implemented in source. Infrastructure-dependent verification is incomplete.

| Check | Actual result |
| --- | --- |
| `npm install` | **Blocked/failed** with OS `EACCES` connecting to npm. Prisma client/adapter/CLI and ESLint remain unavailable. No framework version was intentionally changed. |
| `npm test` | **Passed: 19 tests, 0 failures.** Existing security and ingestion regression checks plus platform separation, ad placements/legacy compatibility, verified-baseline rules, visitor cookie integrity/expiry, obvious bots/prefetches, examination dates, and Riyadh date boundaries. |
| `npm run typecheck:foundation` | **Passed** for reusable public/admin components, shared UI/lib, validation/security/content/visitor policies, and unit tests. Database-dependent pages and handlers are outside this subset. |
| Application source syntax/import check | **Passed:** no TypeScript/TSX syntax or missing local-import errors. This is not a substitute for full semantic type checking. |
| `npm run typecheck` | **Failed/blocked** by unavailable Prisma modules/generated declarations and associated inference errors. Full backend/page type correctness remains unverified. |
| `npm run lint` | **Blocked:** ESLint executable not installed. |
| `npm run db:validate` | **Blocked:** Prisma CLI not installed. No successful Prisma schema validation is claimed. |
| `npm run build` | **Blocked:** required Prisma generation step cannot run. No successful production build is claimed. |
| `npm run test:integration` | **Skipped:** no `TEST_DATABASE_URL`. No live database, session, deduplication, or public rendering result is claimed. |
| Database migration | **Not run.** There is no configured `.env`/PostgreSQL service or database credential. The additive phase-three migration is prepared only. No existing data was deleted. |
| Browser/Docker/Plesk | **Not verified:** complete dependencies/database infrastructure are unavailable. No production deployment was performed. |

The integration suite now additionally prepares tests for eStudy24 homepage isolation, cross-university article rejection, platform publishing, multi-placement ad visibility and pausing, owner/CSRF protection of counter settings, real visit increments, refresh/tab deduplication, obvious bot rejection, disabled tracking, and public privacy boundaries. Its fixture cleanup is restricted to the separate `_test` database and restores pre-test settings. These checks are prepared, not successful runtime results.

## Remaining verification

On a network-enabled development/staging machine, install dependencies and review the refreshed lockfile. Configure PostgreSQL and `.env`, generate the real Prisma client, validate the schema, and apply the committed migrations after backing up existing data. Run the seed without resetting data. Then run:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:integration
```

Review the homepage, all university tabs, published/draft visibility, CMS forms/uploads, advertisement scheduling/placements, and enabled/disabled visitor-counter states in a browser at desktop/mobile widths. Verify that a real first visit increments the aggregate, refreshes do not, and unpublished university imports never enter the homepage. Resolve any findings before deployment.

See [CAMPUS.md](CAMPUS.md) for setup, feature/file inventory, additive database changes, API compatibility, and privacy semantics.
