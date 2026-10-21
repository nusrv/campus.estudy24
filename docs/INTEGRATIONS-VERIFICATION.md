# University/integration/counter verification — 21 October 2026

All work uses the existing repository and direct Plesk startup. No production database, Plesk configuration, production seed, or live n8n workflow was modified. Local checks use a separate temporary PostgreSQL 18 instance bound to loopback and databases whose names end in `_test`.

| Check | Actual result |
| --- | --- |
| TypeScript | Full `npm run typecheck` passed. |
| ESLint | `npm run lint` passed without errors/warnings. |
| Prisma | `db:generate` and `db:validate` passed with Prisma 7.9.1. |
| Unit tests | `npm test`: 26 passed, no failures/skips. Includes arithmetic/Western formatting, Arabic numeric validation, deterministic seed identities, scoped key hashing/rejection, OpenAPI local references and execution of the n8n normalization code against an RSS fixture. |
| Database/HTTP integration suite | `npm run test:integration`: 26 passed (three parent suites and 23 nested tests), no failures/skips. All committed migrations applied in the disposable test database. |
| Legacy baseline migration | Prior migrations applied in a second isolated database; a legacy 200,000 baseline, 350 recorded visits, disabled counter and custom label were inserted; the new migration preserved all of them and populated `visitorStartingValue=200000`. PostgreSQL assertions passed. No production data involved. |
| Production build | `npm run build` passed using the existing Prisma-generation/Next.js webpack build and standard `.next` output. No standalone output or asset copying. |
| Production startup/assets | Passed: `npm run verify:production` used the unchanged root `server.js`; 11 CSS/JS/preload assets, 24 local font requests, and five private-file denials passed without copying files. |
| External infrastructure | No automatic Plesk deployment or production database changes. No actual import/execution in an external n8n instance. The exported inactive workflow is structurally checked, its normalization node is executed locally, and its ingestion target is exercised through HTTP tests. Configure Header Auth in n8n after importing. |

New suite `tests/integration/universities.test.ts` verifies:

- Repeated safe seeding yields ten enabled universities and ten active, non-global, correctly associated university-banner demos without creating articles. Existing university descriptions and edited/paused demo ads survive reruns.
- All ten dedicated university pages return 200 and render demo ads; public directory includes all ten; homepage ad results exclude university demos.
- Existing authenticated advertisement create/edit (title, description, image, destination, placement and university target), pause, reactivate, and delete operations update public HTML on the next request without a build/redeploy. Unauthenticated creation is rejected.
- Starting-value changes preserve visit aggregates and labels; negative input is rejected; totals use starting value plus recorded visits and no verified-analytics flag.
- Owner-only key creation and metadata, CSRF/unauthenticated/editor rejection, concurrent creation producing only one active credential, no plaintext/hash exposure through lists/public APIs/audits, and inability to use an ingestion key for settings management.
- Missing/forged keys, UQU/King Saud scope isolation, all-or-nothing scope preflight for mixed batches, pending-review defaults, legacy-key compatibility, repeated imports, and preservation of edited titles/publication decisions.
- Rotation/revocation make previous credentials unusable while other universities' keys continue to work.
- API reference pages and downloadable OpenAPI/workflow endpoints require administrative authentication. Editors can read documentation but cannot manage keys.

The pre-existing administrator and content suites also pass: protected initial setup, concurrent initial owner prevention, owner/editor account permissions, secure password resets and session revocation, CSRF/cookies, last-owner concurrency, ingestion validation/deduplication, platform/university separation, visitor deduplication and logout.

After adding the paused-demo preservation assertion, the university suite was run again in a new disposable database: all 10 tests including its parent passed. Final TypeScript, ESLint, schema validation, all 26 unit tests, production build and startup/assets checks also passed. The temporary PostgreSQL instance was stopped afterward.

New migration: `202610210002_university_integrations_counter`. New explicit production seed: `npm run db:seed:campus`. Hosting settings and existing secrets remain unchanged. See [INTEGRATIONS.md](INTEGRATIONS.md) for exact Plesk execution order and documented behavior on repeated seeds.
