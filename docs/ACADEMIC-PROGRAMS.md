# Academic degrees and programs directory

This release adds the ninth university tab **التخصصات والبرامج الأكاديمية** at `/universities/[slug]?section=academic-programs`. The existing eight tabs retain their keys, order and behavior. Academic degrees are separate from the existing time-bound training/opportunity `Program` model and `/api/ingest/programs` endpoint. The homepage does not display university degree records.

## Data and editorial policy

`AcademicProgram` belongs to exactly one university. Its `title` is the academic program name. Degree name, college, department, campus/city, credit hours, study mode, description, official program URL and study-plan URL are nullable. Degree names are unrestricted source text, including diplomas, fellowships, preparatory programs and other official designations. No degree, study plan, price or admissions availability is inferred.

Tuition is stored as source text, not a guessed numeric price. `tuitionInfo` requires `tuitionVerified=true` plus `tuitionSourceUrl`; without verified fee information all fee text/URL fields stay null and the flag is false. Administrative validation and a PostgreSQL check enforce that grouping. The API flag is an explicit assertion by the trusted collector/editor, not automated verification by Campus. The upstream collector and editorial review must verify the cited official source. Official plan links are supplied only when positively matched; missing links produce no study-plan action.

The model retains source identity, fingerprint, latest source snapshot, protected field names, last synchronization time, status, visibility, timestamps and a soft-deletion tombstone. Existing audit records capture actor ID, university and before/after editorial snapshots. Manual records have no invented source identifier or synchronization date.

Owners and Editors use the existing content permissions. Editors retain the existing restriction on DELETE operations; they may create/edit/publish/unpublish/hide academic records. Ambassadors may also soft-delete and restore their own university's records. Every Ambassador query and mutation uses the authenticated account's university, including detail APIs. Creates automatically bind the university; supplied foreign/null/nested university associations are rejected. University assignment is immutable after creating an academic record, including for Owners, preserving import identity. Imported records cannot be moved by editing the source configuration either. Academic programs now use the shared, authorized cross-page bulk-selection system; see [BULK-ADMINISTRATION.md](BULK-ADMINISTRATION.md).

## Source reference

The official [Umm Al-Qura degrees directory](https://uqu.edu.sa/App/Degrees), inspected on 22 October 2026, provides a search/filter/pagination interface with program, degree, college/department, hours and fee information. Its displayed degree labels include more than three degree types, and names/variants can repeat. This is a reference for the contract; no documented public JSON API is assumed, and no official records have been copied into seed data. Next.js performs no directory scraping or scheduled collection.

An Owner can configure an ingestion source using the existing **مصادر الاستيراد** screen, for example a stable key `uqu-degrees`, university `uqu`, and URL `https://uqu.edu.sa/App/Degrees`. This is an explicit configuration step, not a production seed or automatic mutation. Use the university's existing scoped API key. Ambassadors cannot view/manage keys, sources or integration documentation.

## Ingestion contract

`POST /api/ingest/academic-programs`

Headers:

```http
Authorization: Bearer UNIVERSITY_SCOPED_KEY
Content-Type: application/json
```

Administrator sessions and the legacy global ingestion key are not accepted. University scope comes from the credential. Optional `university_slug`, when sent, must match. Do not send a university ID. A known foreign source or forged university scope anywhere in a batch rejects the whole envelope before any records are written.

Required fields:

| Field | Constraint |
| --- | --- |
| `source_key` | Existing enabled ingestion source belonging to the credential's university; slug, max 100 characters. |
| `source_id` | Stable non-empty string, max 300 characters, identifying the original program variant. |
| `name` | Non-empty program name, max 500 characters. |
| `source_url` | HTTP(S) URL without embedded credentials, max 2048 characters; same hostname as configured source. |

Optional fields accept null unless indicated:

| Field | Constraint |
| --- | --- |
| `university_slug` | Optional matching slug, max 100; not the authority for scope. |
| `degree_name` | Original degree designation, max 200. |
| `college`, `department` | Max 300 each. |
| `campus`, `study_mode` | Max 200 each. |
| `credit_hours` | Finite number from 0 through 5000; no numeric strings. |
| `description` | Plain text, max 20,000. |
| `tuition_info` | Verified original fee text, max 3000; requires both fields below. |
| `tuition_verified` | Boolean, default false. True only with fee text and its source URL. |
| `tuition_source_url` | Source supporting the explicit fee assertion. |
| `official_program_url` | Verified official page for this exact academic program, when available. |
| `study_plan_url` | Verified official plan for this exact program variant, when available. |

Missing optional source fields normalize to null (fee verification to false). Such nulls may replace previous unedited source values. Administratively corrected fields, including explicit null corrections, remain protected whenever their values actually change. Fee edits protect the complete fee group together so later imports cannot mix manually verified text with another source's evidence.

The following is **illustrative schema data, not an official university academic record**. It must not be used as seed data or sent unchanged to production:

```json
{
  "university_slug": "uqu",
  "source_key": "uqu-degrees",
  "source_id": "ILLUSTRATIVE-VARIANT-ID-001",
  "name": "مثال توضيحي لاسم برنامج — ليس سجلًا أكاديميًا رسميًا",
  "degree_name": null,
  "college": null,
  "department": null,
  "campus": null,
  "credit_hours": null,
  "study_mode": null,
  "tuition_info": null,
  "tuition_verified": false,
  "tuition_source_url": null,
  "description": null,
  "source_url": "https://uqu.edu.sa/App/Degrees",
  "official_program_url": null,
  "study_plan_url": null
}
```

For multiple records use the same endpoint with this envelope:

```json
{
  "items": [
    {
      "source_key": "uqu-degrees",
      "source_id": "ILLUSTRATIVE-VARIANT-ID-001",
      "name": "مثال توضيحي فقط — ليس برنامجًا رسميًا",
      "source_url": "https://uqu.edu.sa/App/Degrees"
    }
  ]
}
```

Limits: 1–50 records, total body 1 MiB, existing authentication/request rate limits (60 requests per minute per valid key and client bucket). Unknown fields are rejected. Empty/failed fetches do not delete records: an empty batch is rejected, and absence from a later batch has no deletion meaning.

Deduplication uses **university + registered source key + external variant ID**, backed by database uniqueness and a SHA-256 `sourceKey`. It never uses program name alone. Prefer a verified upstream ID/canonical variant identifier. If the source lacks such an ID, the future collector must establish a deterministic, collision-resistant identity covering actual degree, department, campus and variants; name-only or page-position identities are unsafe. A new external ID creates a distinct record; do not silently change IDs between runs.

New imported records default to `pending_review`, independently of the university's news policy. Owners may explicitly enable `autoPublishAcademicPrograms` for a trusted ingestion source: only complete, validated new records with HTTPS official evidence and no suspicious markup may then publish automatically. Incomplete or suspicious valid records remain pending. Enabling this policy never publishes existing pending records; see [the source policy](BULK-ADMINISTRATION.md#academic-source-policy). Subsequent imports retain status, visibility, deletion state and manual corrections. Soft-deleted rows retain their identity and cannot be recreated by an import. Hidden/unpublished records stay hidden/unpublished. Only an explicit administrative edit/restore changes those decisions. `lastSyncedAt` records each successful synchronization, including unchanged or tombstoned records. No synchronization automatically removes absent programs.

Responses contain `request_id`, `resource_type`, outcome counts and per-record `index`, `outcome`, `resource_id`, publication decision or error. For example:

```json
{
  "resource_type": "academic-programs",
  "counts": { "created": 1, "updated": 0, "unchanged": 0, "rejected": 0, "failed": 0 },
  "results": [{ "index": 0, "outcome": "created", "resource_id": "PROGRAM_ID", "publication": { "status": "pending_review", "decision": "pending_academic_review" } }]
}
```

HTTP: 201 single creation; 200 update/unchanged or successful batch; 207 batch with record-level rejection/failure; 401 authentication; 403 scope; 413 size; 415 media type; 422 validation/batch; 429 rate limit; 503 temporary failure. Record errors include `VALIDATION_ERROR` (with field paths), `UNKNOWN_SOURCE`, `SOURCE_HOST_MISMATCH`, and `INGESTION_FAILED`. Reuse IDs and retry only transient failed records with backoff; correct rejected records before retrying. Do not retry authentication/scope failures unchanged. OpenAPI and the interactive private reference include this endpoint. Existing n8n workflow exports remain unchanged.

## Public API and administration

`GET /api/academic-programs?university=uqu` requires a university slug, supports `search`, exact `degree`, `college`, `department`, `page` and `page_size` (1–100; default 12), and returns pagination plus live filter choices. Only published, visible, undeleted records of enabled universities are exposed. It excludes fingerprints, source snapshots, protected-field lists, credentials and other private metadata. Homepage scope is rejected.

The existing private generic CMS endpoints support `academic-programs`: GET/POST list/create and GET/PATCH/DELETE by ID. They reuse sessions, CSRF and account authorization. Create/PATCH use camelCase model fields (`title`, `degreeName`, `college`, etc.); PATCH preserves omitted fields. Explicit `{"action":"restore"}` restores a soft-deleted record. There are no public write endpoints apart from scoped ingestion.

## Expected future n8n work — not implemented here

Fetch the official directory through its actual supported interface → iterate pagination safely → extract verified fields and stable variant IDs → optionally match official study-plan URLs with explicit evidence → normalize absent fields to null → send authenticated batches → persist per-record reports and retry only failures. Never infer fees, plans or admission openings. The n8n workflow must be developed separately; none is added, modified, activated or scheduled by this release.

## Plesk release

One additive migration: **`202610220001_academic_programs`**. It only creates the academic table, constraints, indexes and foreign keys. No existing content, accounts, sessions or keys are changed. There is no production seed and no new environment variable.

After the normal backup and Git pull/deploy in the existing Plesk application root, run these in order using Node.js 22:

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run build
```

Then **Restart App**. Keep existing `server.js`, document root, production environment variables and static routing. No containers, standalone output or manual asset copying. A deployment initially shows a truthful empty academic directory until administrators add/publish records or a future n8n collector populates it. An Owner must explicitly configure the academic ingestion source; existing university keys can be reused.
