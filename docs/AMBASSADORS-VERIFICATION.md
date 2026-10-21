# Ambassador release verification — 21 October 2026

Checks were executed in the existing Windows checkout with Node.js 22.14, installed Next.js 16.4.2, Prisma 7.9.1, and a disposable PostgreSQL 18 database bound to loopback. Browser tests used installed Microsoft Edge through the existing Playwright Core dependency. No production database credentials or Plesk deployment were used.

| Check | Executed result |
| --- | --- |
| `npm run typecheck` | Passed, including new server policies, account UI and tests. |
| `npm run lint` | Passed. |
| `npm run db:validate` | Passed. |
| Prisma migration deploy/status | All 6 migrations applied successfully to the disposable test database; schema up to date, including `202610210004_university_ambassadors`. |
| `npm test` | 42 passed, 0 failed, 0 skipped. |
| `npm run test:integration` | 49 passed, 0 failed, 0 skipped across all 5 suites. Includes PostgreSQL, HTTP and desktop/mobile browser tests. |
| `npm run build` | Passed: Prisma generation, webpack compilation, TypeScript and static page generation. |
| `npm run verify:production` | Passed using unchanged root `server.js`: 11 CSS/JS/preload assets, 24 font requests, 5 private-file denials; no manual copying. |
| Git/secret review | Reviewed `.gitignore`, changed/untracked release files and tracked environment/generated paths. No real credentials, `.env` files, uploads, build files or generated dependencies are included. |

The Ambassador suite verifies Owner-only account creation and assignment, creation of additional Owners, default Editor compatibility, required university assignments and PostgreSQL constraints, multiple Ambassadors at one university, login, university dashboards, automatic assignment on create, publication, scoped news/events/calendar/programs/services mutations and lists, foreign detail/ID access, forged/null/nested university associations, CSRF, restricted global resources and integrations, mixed-university bulk rollback, reimport deduplication/editorial/deletion preservation, private uploads and audit attribution. It also verifies reassignment/disable/reset session revocation, disabled-university login rejection, and a content write queued behind a concurrent session revocation.

Focused unit tests additionally cover external media URLs, foreign private attachment references, and legacy uploads already referenced by the assigned university's articles/services. Existing integration suites recheck authentication, last-Owner protection, n8n keys/scope/revocation, publication policies, structured imports, categories, bulk deletion, university pages, advertisements, visitor counting, Western digits, official links, Telegram and private documentation.

An initial full run exposed shared login-rate-limit state between suites. The new Ambassador suite now uses its own simulated proxy client identity against its loopback-only test server. Production limits were not changed. The final full run used a fresh disposable database and passed all suites. Expected PostgreSQL constraint rejections are deliberately exercised by the tests.

Production deployment, production migration execution and live Plesk verification remain operator steps. Follow [AMBASSADORS.md](AMBASSADORS.md); no seed, new environment variables, startup configuration changes, n8n request changes or known-password accounts are required.
