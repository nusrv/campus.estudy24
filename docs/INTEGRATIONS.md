# Universities, advertisements, visitor counter and n8n

This release extends the existing direct Plesk deployment; Node 22, root `server.js`, the current public design, private dashboard, owner/editor permissions and PostgreSQL content remain in use. No container, standalone output, scheduled Next.js RSS collector, public registration, or automatic publication is added.

## Exact Plesk release steps

1. Back up PostgreSQL and persistent uploads. Pull GitHub `main` and deploy the checkout through Plesk Git as usual. Preserve existing application/environment/upload paths.
2. The package manifest adds `db:seed:campus` only; no dependency is added. Use the existing installed dependencies, or `npm install --include=dev` if needed.
3. Run **`npm run db:migrate`** once using Plesk's existing environment. This applies new migration **`202610210002_university_integrations_counter`** (and any earlier unapplied migrations). Do not reset, run `db push`, rewrite migration history, or replace the production database.
4. Run **`npm run build`**. This generates the Prisma client for the migrated schema and builds standard Next.js output. If the build fails, fix it before continuing.
5. Run **`npm run db:seed:campus`** explicitly in Plesk, then click **Restart App**. This is the approved production data action creating the ten university records and ten active scoped demo advertisements. It is deliberately not part of build, startup, pull hooks, or development deployment. The original `db:seed` remains available for original defaults but does not replace this command. Keep Application Root at the existing repository directory, Document Root at its `public` child, Startup File `server.js`, production mode, and Node 22.14+. There are no asset-copy steps. See [PLESK.md](PLESK.md) for the unchanged hosting settings.
6. Check `/universities`, all ten `/universities/[slug]` pages, and the homepage counter. From the private dashboard, select a university's **تكامل n8n وAPI**, generate its key as an owner, and configure its n8n credential. Development has not seeded or migrated production.

## Idempotent university/demo seed

`prisma/campus-seed-data.ts` contains the ten approved stable slugs. `seedCampus()` runs under one transaction and an advisory lock. It upserts universities by slug, enables all ten as explicitly requested, and fills missing official URLs only. It preserves names, descriptions, logos, existing website overrides, related content, and existing source configurations. Newly created optional descriptions/cities/regions/logos are empty. There are no seeded news items, deadlines, admission claims, events, administrator accounts or API keys.

Each demo has the stable ID `campus-demo-SLUG-v1`, a visible **إعلان تجريبي** title, an internal university-portal destination, status `active`, no schedule restriction, placement `university_banner`, `global=false`, and exactly its own university association. Existing advertisements are not deleted. Reruns do not duplicate or overwrite existing demo titles, media, targeting, schedules or statuses. Consequently a manually paused/edited demo stays paused/edited on later seeds; only newly created demos are forced active. Deleting a demo then explicitly rerunning this seed recreates that missing stable demo. Real advertisement management continues through the existing owner/editor content permissions and forms, including images, destinations, multiple placements/targets, schedules, pause/reactivate and owner deletion. Public pages are dynamic and reflect saved changes on the next request, without a build.

Official domains reviewed on 21 October 2026:

| Slug | University | Official site |
| --- | --- | --- |
| uqu | جامعة أم القرى | [uqu.edu.sa](https://uqu.edu.sa/) |
| ksu | جامعة الملك سعود | [ksu.edu.sa](https://ksu.edu.sa/) |
| kau | جامعة الملك عبدالعزيز | [kau.edu.sa](https://www.kau.edu.sa/) |
| imamu | جامعة الإمام محمد بن سعود الإسلامية | [imamu.edu.sa](https://imamu.edu.sa/) |
| pnu | جامعة الأميرة نورة بنت عبدالرحمن | [pnu.edu.sa](https://pnu.edu.sa/) |
| kku | جامعة الملك خالد | [kku.edu.sa](https://www.kku.edu.sa/ar) |
| taibah | جامعة طيبة | [taibahu.edu.sa](https://www.taibahu.edu.sa/) |
| qu | جامعة القصيم | [qu.edu.sa](https://www.qu.edu.sa/) |
| iau | جامعة الإمام عبدالرحمن بن فيصل | [iau.edu.sa](https://www.iau.edu.sa/) ([official admission document identifying the domain](https://admitportal.iau.edu.sa/files/colleges_web_24.pdf)) |
| jazanu | جامعة جازان | [jazanu.edu.sa](https://www.jazanu.edu.sa/ar) |

Some official roots timed out or blocked automated page fetching; their indexed official pages/documents were used for domain verification. No news or dates from those pages are copied into the database.

## Simple visitor starting value

**القيمة الابتدائية لعداد الزيارات** is the only input in the owner counter settings, with one **حفظ** button. Enter an integer from 0 through 2,147,483,647. Validation/errors are Arabic. Display uses Western digits and thousands separators, e.g. `200,350`.

`displayed total = SiteSettings.visitorStartingValue + SUM(VisitorDaily.visits)`.

Changing the starting value never changes `VisitorDaily`, deduplication tokens, bot filtering, label or enabled state. The public copy identifies a configured starting value when nonzero; it is not independently verified analytics. The additive migration copies the old numeric `visitorBaseline` into `visitorStartingValue`. Old baseline verification/date/evidence columns remain in PostgreSQL only for retention and rollback compatibility; the UI, public calculation and settings responses do not use them. No historical date/evidence/verification input remains. Existing enabled/label settings are preserved; optional owner API fields `visitorCounterEnabled` and `visitorCounterLabel` remain compatible alongside the required `visitorStartingValue` field. Old clients sending historical fields must update to the new contract. Visits remain aggregate and privacy conscious, with the existing 30-minute signed-cookie/session-nonce deduplication and bot filtering.

## University credentials and ingestion scope

Private university management rows link to **تكامل n8n وAPI** at `/portal-control-x7k92/universities/INTERNAL_ID/integration`. It shows the university name, slug, immutable internal ID, endpoints, source instructions, copyable JSON/cURL examples and owner-only key controls. Editors can read instructions and the private reference; they cannot read key history or manage keys. Owners use authenticated, CSRF-protected operations:

- `GET /portal-control-x7k92/api/universities/ID/keys`: safe metadata only, newest 20 records.
- `POST` to that URL with `{ "action": "create" | "rotate" | "revoke" }`: owner-only, rate-limited, audited.

Create/rotate returns `secret` once. The private page keeps it only in memory until navigation/hide; neither plaintext keys nor their digests are returned by list/public endpoints or written to audit logs. The credential has a public lookup ID and 256 cryptographically random secret bits; PostgreSQL stores only a SHA-256 digest of that random component. This is a high-entropy API secret, not a human password. Generation/rotation is serialized by a university row lock; a database partial unique index permits one active key per university. Rotation revokes the old key and creates a new one atomically. Revocation keeps historical metadata. Disabling a university also makes its key unusable. No keys are seeded.

In n8n choose **Generic Credential Type → Header Auth**. Set header name `Authorization`, value `Bearer ` followed by this university's full key, inside n8n's encrypted credential store. Configure `Content-Type: application/json`, POST, and `/api/ingest/articles` or `/api/ingest/batch`. Do not put secrets in URLs, workflow source, example JSON, logs or version control.

Key scope comes from the stored credential university, never from a caller-supplied internal ID. `university_slug` must match the credential and the configured source must belong to that same internal university. A cross-university or mixed-university batch is rejected before any record is imported. Validation rejects extra administrator/status/university-ID fields. The key is rechecked and its row held through each import transaction, so revocation serializes correctly with in-flight records. Ingestion keys cannot use administrator operations or replace administrator sessions.

The existing `INGEST_API_KEY` is still accepted independently as a legacy server-wide credential. It remains broad by design for existing workflows. Never share it as a university-specific credential. Migrate workflows individually, then optionally remove that environment variable only when no legacy workflow needs it; scoped credentials work without it. No new environment secret is required for scoped API keys, and existing Plesk secrets are not changed.

Rate limits: unauthenticated/authentication attempts 120/minute/client bucket; authenticated ingestion 60/minute/client bucket and 60/minute/scoped key. Existing trusted-proxy policy remains in force. Payload maximum is 1 MiB, with 1–50 items per batch. Security mutations also have their own owner limit. Error and audit logs omit credentials and raw bodies.

### Sources and article behavior

The seed creates ingestion-source keys `SLUG-rss` if missing. Only UQU has a known tested RSS endpoint, `https://uqu.edu.sa/App/Rss`. Other sources use the verified university homepage as **hostname validation configuration**, not an invented RSS URL. Configure their actual external collection in n8n separately. Next.js never fetches these sources. Owners can update source settings through the existing sources editor, including exact hostname when official news uses a different subdomain. Existing source settings remain untouched. The integration page's placeholder payload must be replaced with actual source records before sending.

`source_id` is the original article identifier; deduplication is enforced by `(sourceId, originalArticleId)`. Repeat that ID on retries and updates. New articles remain `pending_review`, and subsequent imports preserve manual field locks, status, visibility and soft-delete decisions. External image/PDF/registration URLs retain attribution; images are not automatically republished. Publication dates are not event dates. Scope failures never grant publishing privileges.

## Private reference, OpenAPI and n8n example

**وثائق API والتكاملات** (`/portal-control-x7k92/api-docs`) provides required/optional fields, response examples, limits, media/date semantics, deduplication, retry guidance, university scoping and a usable interactive request form. Sending is an explicit real operation with a confirmation; use a test environment or genuine news and review the result. It uses Bearer credentials only (`credentials: omit`), clears the key input after sending, and never saves it in local storage. The example is not sent automatically.

Authenticated downloads:

- `/portal-control-x7k92/api/integrations/openapi` — [OpenAPI 3.1 source](api/ingestion.openapi.json).
- `/portal-control-x7k92/api/integrations/n8n` — [importable n8n JSON](examples/n8n-uqu-workflow.json).

These routes independently require an owner/editor session; public requests return 401 and private pages redirect to login. No public navigation links are added. Private no-index/no-store headers remain in force.

Import the JSON in n8n, select/configure your local Header Auth credential (the exported `CONFIGURE_LOCALLY` reference is only a placeholder), run the manual trigger in a test workflow, then review imported records. Its flow is **Manual Trigger → RSS Feed → Transform Normalize → Authenticated HTTP Request → Campus API**. It is inactive by default, has no real secret, and performs no scheduling. The normalization node keeps stable UQU original IDs and converts publication timestamps to ISO. It does not set publication status.

The credential setup follows the [official n8n HTTP Request credential guide](https://docs.n8n.io/integrations/builtin/credentials/httprequest/).

For retries: preserve original IDs; use bounded exponential backoff for connection errors, 429 and 503. Inspect each result on HTTP 207, retry only `failed`, and fix `rejected` data/scope/source problems before retrying. Do not blindly retry 401/403. This example intentionally stops on HTTP errors so you can configure your own failure branch/retry policy in n8n; it does not silently ignore failures. Execution/import in an external n8n instance and real source collection remain operator configuration, not a claimed deployment result.

See [release verification](INTEGRATIONS-VERIFICATION.md) for actual check results.
