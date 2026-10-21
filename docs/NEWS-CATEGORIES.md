# Shared university news categories

This release reuses `ArticleCategory` and the existing article relationship, university-scoped ingestion, publication policy, editorial protection and eight university tabs. No Prisma schema change or new migration is required. No production data operation or Plesk deployment was performed during development.

## Plesk release

1. Back up PostgreSQL, Pull Updates from `main`, and Deploy into the existing application directory.
2. Run `npm run db:seed:categories` once with the existing Plesk environment. This creates the nine approved shared categories for every university. No dependency changes are needed; run the usual npm install only if the deployment lacks installed dependencies.
3. Run `npm run build`, then **Restart App** after success. Keep Node 22, `server.js`, the existing Application Root and its `public` Document Root, environment variables and persistent uploads unchanged. No static copying or database reset is needed.

The seed is explicit, transactional and repeatable. Unique slug upserts retain every existing category ID, including `general`. It only renames known factory defaults (the slug itself, `عام` for general and `تدريب` for training). Other administrator-customized names remain unchanged. It never updates an article, its category relationship, publication decision or editorial history; previously published articles are not reclassified. Existing custom/legacy categories are not deleted. The original `db:seed` and `db:seed:campus` now use the same initializer, but existing installations should run only the dedicated category command for this release.

| Default Arabic name | Slug |
| --- | --- |
| أخبار عامة | `general` |
| القبول والتسجيل | `admissions` |
| الشؤون الأكاديمية | `academic` |
| الدورات والتدريب | `training` |
| المنح والفرص | `opportunities` |
| الأنشطة والفعاليات | `activities` |
| البحث والابتكار | `research` |
| الخدمات الطلابية | `student-services` |
| الإعلانات والقرارات | `announcements` |

## Interface and ingestion

The existing **أخبار الجامعة** section now contains a horizontal, scrollable category navigation with **الكل** selected by default. Categories appear in the approved order using their stored names. The nine seeded categories remain available even when they have no published news; legacy/custom categories with published articles for that university also remain accessible. Search/date filters preserve the selected category, and category navigation resets pagination. All results remain restricted to the current enabled university and published, visible, non-deleted news. The dynamic page reads current database content without a rebuild. Other university tabs and homepage content are unchanged.

Existing scoped `POST /api/ingest/articles` and `/api/ingest/batch` accept each approved slug in `category`; missing values still mean `general`. Approved categories are created with their Arabic default name if not yet initialized. Existing custom categories registered by an administrator remain accepted for workflow compatibility. A syntactically valid but unregistered unknown slug now returns a per-record `UNKNOWN_CATEGORY` rejection (single request HTTP 422; batch HTTP 207 where applicable), rather than creating an arbitrary category. Invalid slug syntax returns `VALIDATION_ERROR`. No article is created or updated for a rejected category.

Original source IDs, duplicate detection, manual category overrides, other protected editorial fields, university scope and owner-controlled automatic publication remain in force. Existing `general` workflows need no changes. Workflows that relied on inventing arbitrary slugs must use an approved slug or have an administrator register the custom category first. No AI calls, classifier or scheduler were added to Next.js; n8n can implement classification separately. The authenticated API reference and OpenAPI category documentation list the supported values and error behavior.

## Verification

Verified on 21 October 2026 using Node 22 and a disposable local PostgreSQL 18 database (`campus_categories_test`), without production access:

| Check | Result |
| --- | --- |
| TypeScript, ESLint, Prisma validation | Passed |
| Unit tests | 35 passed, 0 failures, 0 skips |
| PostgreSQL/HTTP/browser integration tests | 38 passed, 0 failures, 0 skips across 4 suites |
| Production build | Passed with the installed Next.js 16.4.2 and Prisma 7.9.1 |
| `server.js` production smoke test | Passed: 11 CSS/JS/preload assets, 24 font requests and 5 private-file denials; no copying |

Tests cover the approved catalog and normalization, filter URLs, real PostgreSQL initialization/ID preservation/custom names/repeated runs, university-scoped HTTP category mapping/filtering, unknown-category rejection, legacy custom-category compatibility, editorial category locks, empty states, and desktop/mobile keyboard category navigation with exactly eight main tabs. Existing authentication, publication, ingestion, advertisements, counter and API-key regression suites also passed. No schema, migration, dependency or production startup configuration changes were introduced. Plesk itself and production PostgreSQL were not modified or tested remotely.
