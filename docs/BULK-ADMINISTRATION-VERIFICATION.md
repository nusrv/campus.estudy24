# Unified bulk administration verification — 25 October 2026

Implementation and deployment instructions: [BULK-ADMINISTRATION.md](BULK-ADMINISTRATION.md). Its inventory covers all 12 manageable collections, including administrator cards and university integration keys; read-only reports and settings remain unselectable.

## Environment and data boundaries

Tests ran locally on Windows with Node.js 22.14, Next.js 16.4.2, Prisma 7.9.1 and an isolated PostgreSQL **18** server on loopback. PostgreSQL 17 was unavailable locally: production-version database verification and Plesk deployment remain operator checks. No production database was accessed, no production programs were published, no schedules were activated, and no deployment was performed.

The additive migration `202610250001_unified_bulk_actions` was successfully applied to isolated test databases. Prisma reported all eight migrations up to date. No database reset, truncation, seed or destructive production operation is required. The migration adds two private selection tables and a disabled-by-default source policy; it does not publish existing records.

## Automated results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run db:validate` | Passed |
| `npm test` | 58 passed, 0 failed/skipped |
| `npm run test:integration` | 70 passed, 0 failed/skipped; local PostgreSQL and browser tests |
| Final focused `tests/integration/bulk-actions.test.ts` | 12 passed, 0 failed/skipped after final security/UI refinements |
| `npm run build` | Passed; standard webpack production build and Prisma generation |
| `npm run verify:production` | Passed via existing `server.js`: 11 CSS/JS/preload assets, 24 font requests, 5 private-file denials; no asset copying |

The focused suite verifies every resource's supported actions, individual/page/cross-page selection, 333-record publication, immutable snapshot membership, exclusions, selection persistence, filter changes, counts, stale/expired/reassigned selections, strict payloads and batch limits. Desktop and mobile browser checks cover shared controls, confirmations, administration cards, active keys and public academic rendering. A local 333-record fixture was published through the dashboard and verified through the public API; these were synthetic test records, not production UQU data.

Authorization checks include unauthenticated and CSRF rejection, scoped Ambassador reads/writes, forged filters and foreign IDs, Editor deletion restrictions (including direct article PATCH), session binding, last-Owner/self-disable protection, typed account/key confirmations, disabled-account session invalidation, and preservation of active sessions/reset authorization on a no-op account enable. Ingestion credentials cannot authorize private bulk actions.

Database failure injection verifies complete transaction rollback, including audits, followed by a successful retry of the same confirmation. Completed confirmations return their recorded result without repeating mutations. Existing article bulk-delete and ingestion regression tests passed. Source policy tests cover Owner-only changes, disabled defaults, eligible new-record publication, incomplete-data review, audit records, unchanged existing pending records and preservation of manual edits, hidden/unpublished/deleted identities. Public degree priority is checked before pagination while retaining other degrees and existing filters.

## Compatibility and remaining operator work

There are no new environment variables, dependencies, seeds, n8n payload changes or workflow modifications. `server.js`, Next.js deployment configuration and existing API credentials remain unchanged. The existing academic ingestion endpoint gains only the explicitly opted-in new-record publication policy; the default remains pending review.

Follow the Plesk migration/build/restart instructions in the implementation guide. After deployment, the Owner must explicitly filter to Umm Al-Qura, select all matching results, review the exact count, and confirm publication. The release does not silently publish the existing 333 programs. Concurrent changes intentionally invalidate stale selections instead of reporting misleading partial success. Extremely large selections require narrower filters (maximum 5000 per operation).
