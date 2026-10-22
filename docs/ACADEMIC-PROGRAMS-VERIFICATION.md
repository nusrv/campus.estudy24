# Academic directory verification — 2026-10-22

Release scope and deployment instructions: [ACADEMIC-PROGRAMS.md](ACADEMIC-PROGRAMS.md).

## Executed checks

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`) | Passed |
| ESLint (`npm run lint`) | Passed |
| Prisma schema (`npm run db:validate`) | Passed |
| Unit tests (`npm test`) | 49 passed; no failures or skips |
| Full integration/browser suite (`npm run test:integration`) | 58 passed across six suites; no failures or skips |
| Final focused academic integration/browser rerun | 9 passed; no failures or skips |
| Production build (`npm run build`) | Passed |
| Production startup (`npm run verify:production`) | Passed: 11 CSS/JS/preload assets, 24 font requests, five private-file denials; no artifact copying |
| Git whitespace and changed-file credential/generated-file review | Passed |

Tests used Node.js 22.14.0, Next.js 16.4.2, Prisma 7.9.1, a disposable local PostgreSQL 18 test database, and Edge desktop/mobile browser contexts. The additive migration was actually applied to local test databases; `prisma migrate status` reported all seven migrations applied. No production database or Plesk application was accessed or changed.

The focused suite covers manual creation/editing/publication, Owner and Editor permissions, Ambassador scope enforcement and forged identifiers, scoped key authentication, atomic scope rejection, input limits, repeated/concurrent imports, same-name variants, manual override preservation, hidden/deleted tombstones, public search/filter/pagination, conditional official links, Western digits, private documentation, and preservation of the original eight tabs. Browser checks include Owner editing with the university assignment locked and Ambassador creation without a university selector.

## Deployment still required

The operator must pull/deploy the committed release in Plesk, run `npm ci`, `npm run db:generate`, `npm run db:migrate`, and `npm run build` in that order, then Restart App. Migration: `202610220001_academic_programs`. No seed, new environment variable, startup change, or existing n8n workflow update is required.

Live Plesk execution and production migration remain unverified until performed by the operator. No university academic records were invented or seeded. The directory remains empty until authorized manual publication or a separately developed n8n collector supplies records. Owners must configure an academic ingestion source through the existing source-management interface before using the new endpoint.
