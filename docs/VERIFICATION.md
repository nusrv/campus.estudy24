# Phase-two verification — 20 October 2026

Historical phase-two results are retained below. Current phase-three results are in [CAMPUS-VERIFICATION.md](CAMPUS-VERIFICATION.md).

This is a source implementation with incomplete infrastructure verification. It must not be treated as a verified production deployment.

| Check | Actual result |
| --- | --- |
| `npm test` | **Passed: 13 tests, 0 failures.** Security primitives, UQU validation/normalization, fingerprints, protected editorial fields, default-free PATCH input, and schedule validation. |
| `npm run typecheck:foundation` | **Passed.** Includes all visual/admin client components, shared UI, validation/security/ingestion-policy modules, and their unit tests. Excludes database-dependent code. |
| Source syntax/local import checker | **Passed** for the application files; JSON configuration parsed. This does not replace semantic type checking. |
| `npm run typecheck` | **Blocked/failed.** Prisma client/adapter/config packages and generated declarations are unavailable, resulting in unresolved modules and downstream inference errors. Full backend type correctness is not established. |
| `npm run lint` | **Blocked/failed.** The ESLint executable is not installed. |
| `npm run db:migrate` | **Blocked/failed.** Prisma CLI is not installed; no PostgreSQL service or `DATABASE_URL` is available. **No migration has been applied.** |
| `npm run build` | **Blocked/failed.** Its required `prisma generate` step cannot run without Prisma CLI. No successful production build is claimed. |
| `npm run test:integration` | **Skipped:** no `TEST_DATABASE_URL`. No live authentication, authorization, transaction, or deduplication result is claimed. |
| Docker/Plesk | Configuration added; Docker/PostgreSQL executables and deployment credentials were not available. Images and deployment remain untested. |
| Browser QA | Not run for the new private screens; a configured database and complete dependencies are needed. |

The complete install was attempted through npm and a cache-only fallback. Network requests to npm fail with OS `EACCES`, and the local cache lacks required transitive package archives. The pinned Zod package was available locally and used for the passing unit checks. The old lockfile could not be fully refreshed; run `npm install` in a network-enabled environment, review/commit its updated lockfile, and then use `npm ci` for subsequent reproducible installs.

## What the integration suite will verify

`tests/integration/backend.test.ts` uses a separately configured PostgreSQL database with a name ending in `_test`. It applies the committed migration, launches its own Next.js development server, and exercises:

- Unauthenticated private-page redirects and no-index headers.
- Rejection of unauthenticated administrative writes and ingestion without an API key.
- Login session cookie flags, separate n8n credentials, and missing-CSRF rejection.
- Malformed ingestion rejection and database logging.
- Concurrent repeated ingestion creating exactly one pending-review article.
- Draft isolation in the public detail API.
- Editorial title/status preservation during changed-source reimports.
- Publication, soft deletion, restoration, and public visibility.
- Logout revocation at the database session boundary.

These are **prepared tests**, not successful results. Run them after normal setup, using a disposable test database and with other development servers stopped.

## Remaining setup

1. Install all dependencies and regenerate/review the lockfile.
2. Provision PostgreSQL; configure `.env` from `.env.example` with the correct database URL, exact application origin, and independently generated secrets.
3. Generate Prisma client, apply migrations, and run the seed.
4. Create the initial administrator through the hidden-password interactive CLI.
5. Run full TypeScript checks, ESLint, unit tests, the production build, and the PostgreSQL/HTTP suite. Resolve any findings before deployment.
6. Verify the dashboard in a browser, configure persistent uploads and HTTPS/reverse-proxy settings, then test Docker or Plesk in staging.

See [BACKEND.md](BACKEND.md) for exact commands, API examples, rate limits, security design, and deployment notes. Work stops at this phase; no additional public portal features are included.
