# eStudy24 Campus — phase three

The university/key/counter release supersedes the older visitor-baseline setup below. Use [INTEGRATIONS.md](INTEGRATIONS.md) for current migration, seed, counter and n8n instructions.

Website identity: **campus.estudy24.com**. This phase extends the existing project. It retains the approved IBM Plex Sans Arabic typography, RTL direction, semantic colors, reusable UI components, private administration route, PostgreSQL/Prisma architecture, and n8n ingestion service.

## Public portal

| Route | Content |
| --- | --- |
| `/` | eStudy24 editorial news, featured content, educational articles/guides/topics, managed advertisements, university directory preview, and the real visitor counter. |
| `/articles` | eStudy24-only archive with type/category/search/date filters and pagination. |
| `/articles/[slug]` | Published eStudy24 content with configurable SEO metadata. |
| `/universities` | Enabled-university directory, with search, region filtering, logos, descriptions, official URLs, and pagination. |
| `/universities/[slug]` | University overview, news, programs/opportunities, events, academic dates, timetable resources, student services, admission links, and scoped ads. |
| `/universities/[slug]/news/[id]` | Full published university article, source attribution, images, PDFs, and registration links. The ID must belong to the university in the URL. |
| `/design-system` | The existing approved visual showcase, retained. |
| `/sitemap.xml`, `/robots.txt` | Public discovery metadata; no administration, draft, hidden, deleted, or disabled-university URLs in the sitemap. |

The homepage never queries the university article table for editorial cards. `PlatformPost` is a separate editorial entity with no university/source relationship. Its structured types are `platform_news`, `blog`, `guide`, and `topic`. Categories reuse the existing taxonomy. Featured selection is explicit, with priority; other homepage cards come only from published, visible eStudy24 content.

There are no fabricated sample news posts, announcements, visitor statistics, or promotional offers in the public portal. Empty databases produce empty states. Connection/schema failures produce unavailable states. The original showcase keeps its clearly illustrative examples.

University sections use a university relationship filter with `enabled=true` on every content query. Choosing a different university through a query parameter cannot override the university in the route. Programs/events use their own dates, not news publication dates. Date filters entered as calendar days use Saudi time boundaries; event/program times display in the Asia/Riyadh timezone.

External service portals can have their own access requirements. Campus itself has no student accounts, registration, or personal timetable synchronization.

## Administration

Login remains `/portal-control-x7k92/login`; dashboard remains `/portal-control-x7k92`. No public navigation includes administration links.

New menu entries:

- **محتوى eStudy24 والرئيسية:** create/edit platform news, blog posts, guides, topics, cover images, categories, publication status, visibility, featured selection/priority, and SEO title/description. Soft deletion and restoration are supported. Publication is an explicit administrator choice.
- **إعدادات عدّاد الزيارات:** owner-only enable/disable control, displayed label, tracked aggregate count, and optional verified historical baseline.

Existing sections are extended:

- Universities: city and region support searchable/filterable directory entries. Add a university and enable it to create its public portal automatically. Disable it to remove it from public discovery without deleting history.
- Advertisements: select one or multiple placements. Use global visibility for homepage banners; choose universities for targeted university ads. The same ad can appear in multiple selected placements. Schedule, priority, status, uploads, destinations, and aggregate tracking remain supported. Public ad cards are explicitly labelled advertisements.
- Events/programs: a university is required on new/edited records. Existing unassociated legacy records remain in administration and are not deleted or shown publicly until assigned. Event kinds include `event`, `academic_date`, `registration`, and `examination`.
- Links: select a structured kind: `general`, `official`, `academic_calendar`, `timetable`, `student_service`, `admission`, or `learning_resource`. Existing category and display-order controls remain. University pages never substitute global links for the selected university's services.

To publish homepage content, create a platform post, select its type and category, add content, set **منشور**, and keep visibility enabled. To feature it, enable **إبراز المحتوى** and set priority. To create a homepage banner, use the existing ads section, enable global visibility, choose **بانر الرئيسية**, and activate or schedule it. No code edits are needed.

## Database changes

`prisma/migrations/202610200002_campus_portal/migration.sql` is additive:

1. Adds `PlatformPost` with publication/visibility/soft-delete fields, cover media, featured priority, category relation, and SEO fields.
2. Adds `AdvertisementPlacementAssignment` and backfills existing ads' primary placements. The original `placementId` is retained for compatibility.
3. Adds singleton `SiteSettings`, aggregate `VisitorDaily`, and transient `VisitDedup` tables.
4. Adds university city/region, managed-link kind, platform/link enums, and the examination event kind.

There are **25 models** in the extended schema. Existing article identities, fingerprints, editorial edit locks, publication choices, audit records, and university/source associations are not rewritten. No table or column is dropped, no article is automatically published, and no existing content is deleted. The seed remains repeatable, preserves existing records, and initializes the counter at zero with no historical baseline. The existing UQU seed remains the primary example. No new external source or scraper was added.

The PostgreSQL baseline check also requires verification, documentary evidence, and a cutoff no later than the recorded tracking start. Server validation enforces the same overlap rule. This protects against accidental double counting; it does not independently authenticate a historical analytics report.

## Visitor counter

The counter records **visits**, not guaranteed unique people. It uses a 30-minute visit window:

- Merely requesting HTML, a prefetched route, or `GET /api/visitors` never increments counts.
- After homepage load, the browser sends a random session nonce to `POST /api/visitors`.
- The server uses a signed HTTP-only/SameSite=Lax cookie, plus an HMAC deduplication key and serializable PostgreSQL transaction, to reduce duplicates from refreshes, concurrent calls, and tabs that share the cookie.
- Obvious bot user agents, prefetch requests, DNT, and GPC are excluded where practical. Same-origin checks, JSON size limits, and persistent rate limits also apply.
- Only aggregate daily visit counts and expiring HMAC keys are stored. No raw IP, user-agent, browsing history, visitor profile, or third-party analytics cookie is stored by this counter. Existing rate limiting uses transient hashes.
- If storage/cookies are disabled or removed, duplicates may increase. Bot filtering is practical rather than fraud-proof. These are aggregate visit statistics, not billing or identity metrics.
- The default count contains tracked visits only. A positive historical baseline requires the owner's explicit verification, documentary reference, and historical cutoff. Order/sales counts are not accepted as a substitute for verified visits.
- Disabling the counter stops recording and hides it without erasing existing aggregates. Unavailable data never falls back to an invented number. The animation respects reduced-motion preferences.

`npm run maintenance` now also removes expired visit deduplication keys. Continue running it daily through the existing operational scheduler.

## API additions and compatibility

| Endpoint | Behavior |
| --- | --- |
| `GET /api/content` | Published/visible eStudy24 posts only; `type`, `category`, `search`, `featured`, ISO `from`/`to`, `page`, and `page_size`. University scope is rejected. |
| `GET /api/content/[slug]` | Public eStudy24 detail and SEO fields; drafts/deleted/hidden records return 404. |
| `GET /api/visitors` | Enabled state and aggregate display total/label. Documentary evidence and deduplication records are never returned. |
| `POST /api/visitors` | Same-origin `{ "nonce": "random UUID" }` tracking; reduces duplicates and applies bot/privacy checks. |
| Private `GET/POST /api/platform_posts` | Under the existing private prefix; lists/creates platform editorial content. |
| Private `PATCH/DELETE /api/platform_posts/[id]` | Complete validated updates; soft delete. PATCH `{ "action": "restore" }` restores a deleted post. |
| Private `GET/PATCH /api/settings` | Owner-only; mutations require Origin and session-bound CSRF. |

Existing APIs are extended rather than duplicated:

- `/api/universities`: city/region fields, `region` filter, and search across university/city names.
- `/api/news` and detail: existing published university-news behavior; `scope=homepage` is rejected. Detail accepts `university` and rejects mismatches.
- `/api/events` and `/api/programs`: only published, visible records associated with enabled universities; explicit university filters are strict. Events support `kind`.
- `/api/links`: structured `kind` filtering; a university filter returns that university's links only. Without a university, only global links are returned.
- `/api/ads`: matching across primary and additional placements, consistent university/global audience, schedules/priority, and public placement IDs. `scope=university` requires a university. Homepage scope rejects university parameters.
- `/media/[id]`: additionally allows uploaded cover images referenced by eligible published platform posts; drafts' uploaded covers stay private.

Use `scope=homepage` or `scope=university&university=uqu` where applicable. University content cannot be requested under homepage scope. For compatibility, unscoped `/api/news` still lists published university news; the homepage does not use it. The separate `/api/content` namespace is the source of homepage editorial cards.

Legacy ad payloads with a single `placementId` remain valid and mean one placement. New payloads use `placementIds`, e.g. `["homepage_banner", "sidebar"]`. If both are supplied, the primary placement must be in the list. University-targeted ads cannot use homepage-banner placement. An old full-replacement ad update specifying one placement replaces the placement list with that one placement.

Existing `/api/ingest/articles` and `/api/ingest/batch` are unchanged. n8n still uses an independent server API key; new imports remain pending review, and subsequent imports preserve editorial changes and publication decisions. No RSS collection or auto-publication was added.

## Setup and remaining infrastructure

No production deployment or database migration was performed during this phase.

1. On a network-enabled machine, run `npm install`. The previously incomplete backend lockfile still needs a successful refresh; review and commit it before using `npm ci` in deployment.
2. Configure `.env` using `.env.example`: existing `DATABASE_URL`, `APP_URL`, `AUTH_SECRET`, `INGEST_API_KEY`, upload/proxy settings, and new optional `SITE_URL=https://campus.estudy24.com` for canonical/SEO URLs. `SITE_URL` contains no secret. `APP_URL` must match the actual browser origin and use HTTPS in production.
3. Back up an existing database, then apply the committed additive migrations and seed:

   ```sh
   npm run db:generate
   npm run db:validate
   npm run db:migrate
   npm run db:seed
   ```

4. On a first installation only, configure the private bootstrap authorization and create the owner through the browser as described in [PLESK.md](PLESK.md). Existing administrators and sessions do not need to be recreated.
5. Start `npm run dev:webpack`, review `/` and `/universities/uqu`, and add/publish eStudy24 content through administration. No synthetic public posts are seeded.
6. Run full TypeScript, ESLint, tests, and production build after installation. Configure a separate `_test` database for the HTTP/PostgreSQL suite. Keep other dev servers stopped while running that suite.

Current direct Plesk deployment is documented in [PLESK.md](PLESK.md); standalone/container deployment is retired. Use persistent PostgreSQL/uploads, a trusted TLS reverse proxy, and the existing one-shot migration workflow. Do not run resets or `db push` against live data. Nothing in this phase automatically deploys the site.

## Main files

- `src/app/(public)/*`: homepage, platform archive/details, university directory/portal/news detail, loading and error states.
- `src/components/campus/*`: public shell, reusable editorial/university/service/date cards, filters/pagination, managed advertisements, animated visitor counter.
- `src/server/campus-data.ts`, `platform-data.ts`, `advertisements.ts`, `content-policy.ts`, `visitors.ts`, `visitor-policy.ts`: scoped public queries and visit policy/storage.
- `src/server/admin-data.ts`, `validation.ts`, existing admin components/routes: platform publishing, ad placements, university metadata and service/calendar kinds.
- `prisma/schema.prisma`, additive migration, and seed; `src/app/api/content/*`, `/api/visitors`, and private settings endpoint.
- Existing metadata/layout/config, media eligibility, maintenance script, environment template, and documentation.
- `tests/campus.test.ts` and extended PostgreSQL/HTTP integration suite.

Actual verification results are in [CAMPUS-VERIFICATION.md](CAMPUS-VERIFICATION.md). Historical foundation notes remain in [BACKEND.md](BACKEND.md) and [VERIFICATION.md](VERIFICATION.md).
