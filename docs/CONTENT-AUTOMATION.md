# University content automation — 21 October 2026

This release extends the existing application. Node 22, `server.js`, Plesk roots, authentication secrets, stored sessions, scoped keys, legacy news workflows, advertisements and visitor counting remain in place. No RSS scheduler, production deployment or production data write is performed by development verification.

## Deploy in Plesk

1. Back up the existing PostgreSQL database and persistent uploads. Pull `main` and Deploy through the existing Plesk Git deployment.
2. Run `npm install --include=dev` (the lockfile adds the browser test driver). Keep existing environment variables, especially `DATABASE_URL`, `AUTH_SECRET`, `INGEST_API_KEY`, `APP_URL`, `SITE_URL`, `UPLOAD_DIR` and proxy settings.
3. Run `npm run db:migrate`. The one new migration is **`202610210003_content_automation_telegram`**. It adds university policy/Telegram fields, the platform support URL, article publication protection, source attribution on structured content, link publication status and a synchronization ledger. Existing links default to published, preserving their previous visibility. Existing editorial article decisions are locked. Every university defaults to automatic publication **disabled**. Existing accounts, keys, sessions, advertisements and visit records are untouched.
4. Run `npm run db:generate`, then the explicit optional command `npm run db:seed:logos`. The logo seed fills empty university logo fields for verified assets only. It never replaces an existing logo, enables publication, creates universities, changes descriptions or resets recorded visits. Re-running after deliberately clearing a logo will fill that empty field again.
5. Run `npm run build`, then click **Restart App** only after success. Retain Application Root = existing repository directory, Document Root = its `public` child, startup = **`server.js`**, production mode, Node 22. No standalone output, static copying, document-root change or secret replacement is needed. Full hosting safeguards are in [PLESK.md](PLESK.md).
6. Test the directory, university pages, authenticated dashboard and existing ingestion workflow. Check CSS/JS/fonts return 200, and private files remain inaccessible. Do not run `migrate reset`, `db push` or destructive SQL.

## Administrator configuration

Owners can edit each university's **النشر التلقائي للأخبار**, official URL, logo and **رابط مجتمع eStudy24 على تيليجرام** through university management. Logo uploads retain the existing MIME/signature/extension/size controls and private persistent storage. Removal clears the logo and displays the fallback. The platform's separate **إعدادات المنصة** page manages **الدعم الفني لمنصة eStudy24 عبر تيليجرام**. Empty Telegram settings are hidden publicly; no community or support URL is seeded or invented.

Community links use exactly `مجتمع طلاب {اسم الجامعة} | eStudy24` with the disclaimer `مجتمع طلابي تديره منصة eStudy24، وغير تابع للإدارة الرسمية للجامعة.` HTTPS `t.me` / `telegram.me` community usernames and invite links are accepted; share/proxy/login URLs, credentials, query parameters and other hosts are rejected. Existing owner/editor permissions remain unchanged: owners manage university/security/settings configuration; editors manage permitted content and approve structured imports.

## News policy and compatibility

Existing `POST /api/ingest/articles` and `/api/ingest/batch` payloads, original identifiers, `article_id`, counts, scoped credentials and legacy `INGEST_API_KEY` remain compatible. No existing workflow needs modification merely to retain pending-review behavior. Opting a university in changes publication behavior on its next incoming news records, including unchanged pending records. Turning the setting off does not unpublish already published news.

Automatic publication requires a schema-valid record from the enabled source assigned to the credential's university, an exact configured source hostname, HTTPS source URL, title of at least 8 characters, summary or content of at least 40 characters, and an original publication date between 366 days ago and 5 minutes in the future. Markup/script/data-HTML and example-placeholder text require review. These conservative checks are not a malware scanner or an assertion of editorial truth. Malformed required fields are rejected with validation details; schema-valid but incomplete/suspicious records stay pending.

Every administrative article save locks the publication decision; existing reviewed/hidden/deleted records are locked during migration. Reimports preserve manual fields and cannot republish an administrator's unpublished, hidden or deleted item. A suspicious update to unlocked automatically published news returns it to pending review; a suspicious update to locked published news holds its public fields and media, retaining only the new source snapshot for review. Logs expose resource type, outcome and publication decision in the authenticated dashboard. Administrators may continue editing, unpublishing, hiding or soft deleting these articles.

## Structured endpoints

All four endpoints require an active **university-specific** API key in `Authorization: Bearer …`. The legacy global key remains accepted for news only. Never use administrator cookies for ingestion. Generate/rotate/revoke credentials through the existing owner-only integration screen; existing keys do not need rotation for this release.

| Endpoint | Required additional fields | Public destination after approval |
| --- | --- | --- |
| `POST /api/ingest/links` | `destination_url`, explicit `kind` | Services (`student_service`, `admission`), schedules (`timetable`), calendar resources (`academic_calendar`), or important links |
| `POST /api/ingest/events` | `starts_at`; `kind` omitted or `event` | University events |
| `POST /api/ingest/calendar` | `starts_at`, `kind`: `academic_date`, `registration` or `examination` | Academic calendar |
| `POST /api/ingest/programs` | `starts_at` | Training and opportunities |

Each takes the shared required fields `university_slug`, `source_id` (stable source identifier), `source_url`, `title`; optional `source_key` defaults to `{slug}-rss`, and `description` defaults empty. Dated resources accept explicit `ends_at` and `application_url` when the source provides them. Links accept `category` and optional `image_url`. Dates must be ISO 8601 with timezone, and the end cannot precede the start. Do not supply publication status, internal IDs or inferred dates. Unknown fields are rejected. Use `source_url` on the configured source host; owners may create a separate source when another authoritative host is required.

Send one record or `{ "items": [ ... ] }` with 1–50 records, within 1 MiB. A cross-university record rejects the entire batch before processing. Valid records within a schema-mixed batch are processed independently and report `207`. Authentication/rate limits are shared with news (60 requests/minute per key and client, 120 authentication attempts/minute). A credential cannot assign content to another university, even through a different source key.

All structured imports start **pending_review** regardless of the news auto-publication flag. In **الروابط والخدمات**, publish the link and enable it. For events/calendar/programs, publish and keep visible. Subsequent imports update only source fields not manually edited; they never change publication/visibility, move universities or restore deleted records. A ledger keyed by source + resource type + original ID prevents duplicate creation. Deleting imported structured content retains a synchronization tombstone, so re-sending the same ID cannot recreate it. The original source URL is displayed publicly after approval. News links are not automatically turned into services and publication timestamps are never used as event dates.

Responses retain `request_id`, counts (`created`, `updated`, `unchanged`, `rejected`, `failed`) and per-record outcomes. Structured responses include `resource_type`, `resource_id`, `publication.status` and `publication.decision`; news also includes its existing `article_id`. Retry failed/transient records using the same IDs and exponential backoff. Fix validation/scope errors before retrying. `201` means one created record, `200` updated/unchanged/successful batch, `207` partial failure, `401` invalid/missing/revoked credentials, `403` university mismatch, `413` size, `415` media type, `422` validation/source, `429` rate limit, `503` transient failure. Do not assume a 207 response imported every record.

The private **وثائق API والتكاملات** interface includes the updated OpenAPI specification, payload selector, explicit request runner and authenticated workflow downloads. The existing RSS news workflow is retained. Four additional importable workflows in `docs/examples/n8n-{links,events,calendar,programs}-workflow.json` use an explicit manual fixture → normalization → authenticated HTTP node. Replace placeholders with independently verified structured source data and configure n8n Header Auth locally; they intentionally refuse to execute placeholder records. There are no embedded secrets or invented dates. Extend your existing six-hour workflow only after mapping each distinct resource's authoritative fields; do not create another Next.js scheduler.

## Logos and official navigation

[university-logos.json](university-logos.json) records university-owned source pages, original asset URLs, review dates, SHA-256 checksums and usage notes. Eight verified PNG assets are hosted locally; SVG/WebP sources were rasterized without redesign. University marks remain their owners' property and are used for identification; no unrestricted reuse licence or affiliation is claimed. UQU's original white mark is displayed on the existing green background.

King Khalid and Imam Abdulrahman bin Faisal's university asset/brand-guide servers timed out from the development environment. Their fallback remains rather than substituting an unverified logo. Owners can upload authentic university-approved files. Primary identity sources researched: [KKU guidelines](https://www.kku.edu.sa/sites/default/files/2024-07/University_identity.pdf), [IAU guidelines](https://www.iau.edu.sa/sites/default/files/resources/guidelines_0.pdf). KKU's [linking policy](https://www.kku.edu.sa/en/portfolio/policies-terms-and-conditions) requires text-only official-site links; the logo itself is not an external-site link.

Official-site links now share a validated native anchor component using the stored `websiteUrl`, secure new-tab attributes, keyboard focus and an isolated hit area. Missing/invalid URLs are hidden. The originally reported desktop failure did **not** reproduce against production in a clean desktop/mobile browser before changes; no overlay was observed. An extension-related cause is possible given the earlier browser popup-extension error but has not been proven. Automated mouse/touch/keyboard checks cover the new component. Plesk and an affected user's browser/extensions must still be checked after deployment if the issue persists.

## Formatting and empty states

`src/lib/format.ts` centralizes Western digits, en-US number grouping and Arabic Gregorian date/time formatting with Latin digits and Riyadh time. Admin statistics, logs, dates, pagination, advertisements, visitor counter and public components use it. Numeric/date form controls request Latin input. Stored numbers and editorial/source text are not rewritten. Successful empty university queries display section-specific empty states; database/API failures display an unavailable state. Published, visible, correctly scoped content alone reaches university sections; the homepage remains platform-only.
