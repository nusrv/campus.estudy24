# Plesk/admin release verification — 21 October 2026

Work continues from GitHub commit `ef17c706e9bcbe271472e35ff0ab2d52d002f7f3`. The former H: workspace was unavailable; a fresh clone at `C:\temp\campus-estudy24` was used. No production database, Plesk environment, uploads, or domain configuration was accessed or changed.

| Check | Result |
| --- | --- |
| Dependency installation | Passed; refreshed the previously incomplete lockfile with existing declared dependency versions. Next.js 16.4.2 and Prisma 7.9.1 retained. |
| `npm run db:generate` | Passed. |
| `npm run db:validate` | Passed. |
| `npm run typecheck` | Passed, full project including integration tests. |
| `npm run lint` | Passed, no warnings/errors after fixing the existing anonymous PostCSS export and explicitly allowing CommonJS in startup/test scripts. |
| `npm test` | Passed: 22 unit tests, no skips. Includes eight-character policy, bootstrap authorization, and production startup/shutdown with numeric ports and Passenger socket paths. |
| `npm run test:integration` | Passed: 16 tests including the two parent suites, no skips; all committed migrations applied to an isolated temporary PostgreSQL 18 instance and disposable `_test` database. |
| `npm run build` | Passed: Prisma generation plus standard Next.js production build, no standalone output or asset copies. |
| `npm run verify:production` | Passed: root `server.js` served `/design-system`, 11 CSS/JS/preload assets and 24 local Arabic font requests; five private-file probes returned 403/404. No PostgreSQL mutations in this check. |
| Production infrastructure | Not deployed or tested on actual Plesk/Passenger. Operator must apply the settings in [PLESK.md](PLESK.md), migrate and restart manually, then verify HTTPS/proxy/assets and private-file denials there. Windows process termination was tested locally; graceful signal callbacks were separately exercised with the startup unit harness. |

The administrator HTTP/DB suite verifies masked browser bootstrap appears only before initial setup, missing/wrong bootstrap authorization and cross-origin attempts are rejected, concurrent setup creates one owner, repeated setup is closed, unauthenticated and missing-CSRF writes fail, owner-only editor creation does not leak hashes, role injection fails, editors cannot manage administrators/settings, disabling revokes sessions, resets are expiring/single-use under concurrent redemption, browser reset requires exact origin, audits omit secrets, the last owner cannot be removed, and concurrent owner changes preserve an active owner.

The existing content suite also passes: private-route/no-index protection, login cookies/CSRF, ingestion validation/logging, concurrent ingestion deduplication, manual-edit/publication preservation, platform/university isolation, multi-placement ads, visitor deduplication/settings, and logout revocation.

New migration: **`202610210001_administrator_setup`**. It adds two security tables and seals bootstrap for existing installations with administrator accounts. It must be applied with `npm run db:migrate` on Plesk before restarting the updated application. Prior migrations are unchanged; no reset, truncation, or production seed was run.

Existing visual primitives, content models, roles, salted scrypt parameters, private route, secure session cookies, CSRF checks, rate limits and n8n authentication remain in use. No new dependency or infrastructure was introduced. Obsolete container configuration was removed to avoid conflicting standalone instructions. Framework-generated `AGENTS.md` contains the installed Next.js contributor guidance; it has no application configuration or secrets.
