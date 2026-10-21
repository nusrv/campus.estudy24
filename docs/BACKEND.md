# Backend and administration — phase two

These are historical phase-two foundation notes. The project is now extended by phase three; see [CAMPUS.md](CAMPUS.md) for current public routes, scope rules, schema additions, CMS controls, and [current verification](CAMPUS-VERIFICATION.md).

The public `/design-system` is preserved. There is no public sign-in, registration, full news frontend, WordPress connection, RSS fetcher, scheduled collector, or AI classification.

## Local setup

Requires Node.js 22.14+ (Node 22 LTS recommended), npm, and PostgreSQL 16+.
The existing Next.js/React versions are retained. Prisma client/CLI/PG adapter are pinned to 7.9.1. Validation uses the Zod v4 API exported at `zod/v4` by the pinned package.

1. Run `npm install`. This resolves backend dependencies and updates the lockfile. Review and commit the refreshed lockfile; subsequent clean installs can use `npm ci`.
2. Copy `.env.example` to `.env` and replace the database placeholder.
3. Set `APP_URL` to the exact browser origin, e.g. `http://localhost:3000`.
4. Generate **two separate secrets**, each at least 32 characters, for `AUTH_SECRET` and `INGEST_API_KEY`:

   ```sh
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

5. Prepare the database and create the first administrator:

   ```sh
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   npm run dev:webpack
   ```

The administrator command prompts for email/name and reads a hidden password twice. Passwords must contain 8–256 characters. It refuses to run without an interactive terminal and refuses to reset or add accounts after the initial administrator exists. There are no seeded passwords or API keys. The seed is repeatable and preserves existing university, source, category, and placement settings.

Open `/portal-control-x7k92/login`. The dashboard and every administrative API operation independently enforce authentication/role checks. There are no `/admin`, `/login`, or `/dashboard` routes, public admin links, or sitemap entries. Administrative responses carry no-index and no-store headers. No sitemap is generated in this phase.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL, used by Prisma migrations and the PG adapter. URL-encode special characters in credentials. |
| `APP_URL` | Exact canonical browser origin. Use HTTPS in production. Origin/CSRF checks fail closed if missing. |
| `AUTH_SECRET` | Independent random secret, minimum 32 characters; signs token digests, CSRF values, and daily ad tokens. Rotating it invalidates sessions. |
| `INGEST_API_KEY` | Independent random n8n Bearer key, minimum 32 characters. Never a public environment variable. |
| `TRUST_PROXY` | Default `false`. Set `true` only when Plesk/nginx overwrites incoming `X-Forwarded-For` with a trustworthy client address. |
| `UPLOAD_DIR` | Persistent filesystem directory outside public/static assets. Default `./storage/uploads`. |
| `MAX_UPLOAD_BYTES` | Upload cap, default 5 MiB; application ceiling 20 MiB. Set a matching reverse-proxy body cap. |
| `ADMIN_BOOTSTRAP_TOKEN` | Optional one-time browser owner setup authorization; see PLESK.md. Remove after successful setup. |
| `TEST_DATABASE_URL` | Optional disposable integration database. Its name must end in `_test`; never use a production database. |

There are no `NEXT_PUBLIC_*` secrets. `.env*` files are ignored except `.env.example`.

## Database

`prisma/schema.prisma` defines 20 normalized models:

- Universities and article categories.
- Articles, attributed external media/PDFs, registration links, and article edit snapshots.
- Separate events (including academic dates/registration opportunities) and training programs.
- Advertisements, placement definitions, university associations, and daily impression/click aggregates.
- Managed links.
- Administrators with owner/editor roles and expiring server-side sessions.
- Ingestion sources/logs, administrative audit logs, rate-limit buckets, and upload metadata.

The checked-in initial PostgreSQL migration creates the tables, enums, foreign keys, unique source/original-ID constraint, indexes, and date/count integrity checks. CUIDs and `updatedAt` are supplied by Prisma, not SQL defaults. The seed creates Umm Al-Qura (`uqu`), its `uqu-rss` source (`https://uqu.edu.sa/App/Rss`), default categories, and all six ad placements.

Do not run `prisma db push` on production. Use `npm run db:migrate` to apply committed migrations. Back up the database and upload volume before deployments.

## Administration

The private dashboard includes overview counts, latest imported articles, and recent ingestion outcomes/errors. Management tables support creation/editing, pagination, and searchable content. Articles additionally support university/category/status/import-date filtering, preview, approve/publish/unpublish/hide, soft deletion, and restoration from the deleted filter. Full previews include original sources, external image/PDF references, registration links, timestamps, and edit history. Manual/imported origin is visible.

University/source identity settings are owner-only. Editors can manage editorial resources; only owners can delete/disable records. Roles are stored server-side and rechecked against the administrator account on every request. Owner-only account management is now available; see PLESK.md.

Advertisements have independent content, optional image uploads, one or multiple university targets or global visibility, one of six placements, priority, start/end schedule, active/paused/archived state, and 30-day aggregate metrics. Links support global/university scope and ordering. Event/program dates use their own structured fields and UTC storage, independent of article publication dates.

University/source deletion actions disable them to preserve content provenance. Article deletion is recoverable; ad/link/event/program deletion is permanent and confirmed in the UI. Ad daily metrics cascade when their ad is deleted.

Administrative API paths, used only by the dashboard:

- `POST /portal-control-x7k92/api/auth/login`
- `POST /portal-control-x7k92/api/auth/logout`
- `GET|POST /portal-control-x7k92/api/{resource}`
- `PATCH|DELETE /portal-control-x7k92/api/{resource}/{id}`
- `GET /portal-control-x7k92/api/articles/{id}` (full preview/history)
- `POST /portal-control-x7k92/api/uploads`
- `GET /portal-control-x7k92/api/media/{id}` (private media preview)

Resources: `universities`, `articles`, `ads`, `links`, `events`, `programs`, `sources`, `categories`, `logs`, and `audit`. Logs/audit are read-only; category deletion is not exposed. Non-article PATCH requests validate a complete replacement of editable fields. Article PATCH is partial; omitted fields never receive defaults.

## n8n ingestion

Only `POST /api/ingest/articles` and `POST /api/ingest/batch` accept imports. Configure n8n's HTTP Request node with JSON body and an **Authorization: Bearer** credential. Keep it in n8n's credential store; do not put it in workflow URLs or exported JSON.

```sh
curl -X POST http://localhost:3000/api/ingest/articles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INGEST_API_KEY" \
  --data-binary @docs/examples/ingest-article.json

curl -X POST http://localhost:3000/api/ingest/batch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INGEST_API_KEY" \
  --data-binary @docs/examples/ingest-batch.json
```

On Windows, use `curl.exe` and `$env:INGEST_API_KEY` rather than the PowerShell `curl` alias. Do not paste a real secret into committed files or shell history.

Limits: 1 MiB JSON, 1–50 batch records, 20 image URLs, 20 PDFs and 20 registration links per article, 100,000 content characters, and 60 authenticated ingestion requests per minute. Oversized bodies are limited by actual bytes read as well as Content-Length. There is no remote file downloading or RSS collection in Next.js.

The tested UQU payload is accepted directly. `source_id` means the **original news ID**, e.g. `179777`; the optional `source_key` identifies the configured ingestion source and defaults to `${university_slug}-rss`. Source URLs must belong to the configured source hostname. University and source must both be enabled. Media URLs may belong to external hosts; they are preserved with source attribution and `external_reference_only` usage, never downloaded automatically.

Results contain `request_id`, counters, and indexed `results` with `created`, `updated`, `unchanged`, `rejected`, or `failed`. Successful new single records return 201, unchanged/updated single records return 200, validation rejections return 422, and failures return 503. Mixed/failed batches return 207 with per-record results; batch records commit independently. Authentication is 401, forbidden CSRF is 403, rate limiting is 429, non-JSON input is 415, and oversized input is 413.

```json
{
  "request_id": "request UUID",
  "counts": { "created": 1, "updated": 0, "unchanged": 0, "rejected": 0, "failed": 0 },
  "results": [{ "index": 0, "outcome": "created", "article_id": "article CUID" }]
}
```

Uniqueness is enforced in PostgreSQL on `(sourceId, originalArticleId)`. Imports run in serializable transactions and retry serialization/unique conflicts. Repeated payloads return `unchanged`; normalized fingerprints detect changes. Only unedited fields are refreshed. Administrator-edited fields, status, visibility, deletion, and publication decisions are preserved. The most recent imported snapshot remains available server-side for provenance. New imports are always pending review. Successful operations and validation/processing failures are logged without storing credentials or raw request bodies. Unauthenticated attempts produce redacted structured server logs rather than ingestion database rows, avoiding unauthenticated database amplification.

## Public read endpoints

`GET /api/universities`, `/api/news`, `/api/news/{id}`, `/api/events`, `/api/programs`, `/api/ads`, and `/api/links` return explicitly selected public fields. Public requests do not accept mutations.

- Lists: `page` (default 1), `page_size` (default 20, maximum 100).
- `university=uqu`: supported on content lists.
- `category=training`: news and managed links.
- `search=...`: university names/news titles.
- `from`/`to`: ISO timestamps; publication date for news, start date for events/programs.
- `placement=homepage_banner|university_banner|sidebar|between_news|article_page|footer`: advertisements.

Only published, visible, non-deleted articles from enabled universities are returned. Events/programs require published/visible status and global or enabled-university scope. Ads require active status and current schedule; untargeted requests return global ads only. Links require active status; untargeted requests return global links only. Public responses never include source snapshots, edit locks, administrator data, audit records, or ingestion logs.

`POST /api/ads/{id}/track` accepts `{ "type": "impression" | "click", "day": "YYYY-MM-DD", "token": "..." }` using the daily `tracking_day`/`tracking_token` returned with public ads. Requires the configured same origin and is rate-limited. It counts aggregate events, not unique people; DNT/GPC requests are not counted. No tracking cookie or user profile is created. Raw client IPs and request headers are never stored; transient rate buckets contain only hashes and expire. Metrics are approximate and are not billing-grade attribution.

## Security and uploads

Passwords use salted scrypt (`N=32768`, `r=8`, `p=1`). Sessions use cryptographically random opaque tokens, with only HMAC digests stored in the database, an eight-hour expiration, active-account revalidation, and HTTP-only/SameSite=Strict cookies scoped to the private route. Production cookies are always Secure. Login rotates the session; logout deletes it server-side. Browser mutations require both the exact Origin and a session-bound CSRF header. The obscure route is not an authentication mechanism.

Login rate limiting uses persistent atomic database counters: 10 attempts per 15 minutes per client bucket and 5 per account. Ingestion and ad tracking have separate persistent buckets. With `TRUST_PROXY=false`, client buckets are shared intentionally, so forged forwarding headers cannot bypass limits. Production should use a trusted, correctly configured reverse proxy before enabling per-client limits.

Uploads accept one verified PNG/JPEG/WebP/PDF file, bounded multipart streams, matching extension/MIME/signature, random storage names, and no SVG/HTML. Originals are never used as paths. Storage is outside `public/`; private previews require a session. Public `/media/{id}` only serves uploaded files referenced by an eligible public university, article, ad, or link, with no-store/nosniff headers. PDFs are attachment-only with a sandbox policy. The browser displays imported article content as escaped plain text, never untrusted HTML. External media previews use `no-referrer`.

Run `npm run maintenance` daily via Plesk Scheduled Tasks or an operator-controlled cron. It removes expired sessions/rate buckets and ingestion logs older than 90 days. Audit/edit histories are retained. This is operational cleanup, not RSS scheduling. Database audit inserts are transactional with content mutations.

## Plesk deployment

Use [PLESK.md](PLESK.md). Standalone/container deployment has been retired; the root server.js starts normal Next.js production output, with public as the secure document root. Browser setup and owner-only administrator management now replace SSH provisioning in the normal workflow.

## Verification

```sh
npm run db:generate
npm run db:migrate
npm run typecheck
npm run lint
npm test
npm run build
npm run test:integration
```

The unit suite covers password verification, session randomness, API-key separation, CSRF and role rejection, body/upload limits, UQU normalization, validation, fingerprints, preserved editorial fields, default-free partial actions, schedules and pagination limits.

The integration suite is skipped without `TEST_DATABASE_URL`. With a dedicated test database it applies migrations, starts a separate local Next.js process, tests private redirects/no-index headers, unauthorized mutation rejection, login/cookie flags/CSRF, malformed ingestion logs, concurrent duplicate imports, unpublished-content isolation, editorial preservation, publishing/deletion/restoration, and logout revocation. It creates randomly named fixtures and removes them afterward. Stop the regular dev server before running it, since Next.js development output uses the same checkout.

See `VERIFICATION.md` for the actual results in the implementation environment. Do not interpret a skipped integration suite as a successful database or end-to-end test.

Reference guidance: [Next.js authentication](https://nextjs.org/docs/app/guides/authentication), [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Prisma 7 PostgreSQL adapters](https://docs.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers).
