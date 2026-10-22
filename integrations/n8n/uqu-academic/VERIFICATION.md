# UQU academic collector verification — 2026-10-22

## Live official-source evidence

A real, read-only collection completed at **2026-10-22T09:09:38.187Z** against the public official directory. Four sequential GET requests to `https://uqu.edu.sa/App/Degrees?perPage=100&page=N`, with a minimum two-second interval, returned **337 rows** (100 / 100 / 100 / 37). They normalized without record errors to **333 distinct official program IDs**; four identical repeated IDs were deduplicated. The resulting dataset SHA-256 was `9a9373273a03a447e91abd1e04c3df65b9c489fdf43ea8432619dfe4172bbade`.

This count describes that observed response, not a promise of the university's current directory size. The workflow discovers counts on every run. The local read-only report is excluded from Git; attributed, reduced table excerpts and their hashes are committed in `fixtures/manifest.json`. One unaltered row with its original SVG/comment structure is also retained to test extraction against original markup. No login forms, CSRF tokens, cookies or component session snapshots are committed.

Additional investigation confirmed that GET `?page=2` changes records, and `perPage=100` changes page size. The public Livewire component advertises URL-bound search/filter state (`searchQuery`, `city`, `faculty`, `dept`, `degree`, `price`, `perPage`, `page`); not every filter combination was exercised. No undocumented JSON API, authenticated endpoint or Livewire POST is needed. The public `robots.txt` did not disallow this directory when checked. The official detail page `/App/Degrees/1894` was inspected and contains an embedded plan; no bulk plan matching was claimed or implemented.

No requests were sent to the Campus ingestion endpoint. No production database, Plesk configuration, API key or existing workflow was changed. No schedule was activated.

## Automated checks

- **20 focused collector/export tests passed**, covering real fixtures, original markup, pagination, incomplete/empty responses, source timeouts, degree variants, deterministic official IDs, Arabic NFC, numeric/null hours, strict official URL matching, conflicting duplicate IDs, batch sizes/UTF-8 byte sizes, dry-run approval gates, per-record 207 handling, bounded backoff, permanent failures and malformed API reports.
- The focused suite executes the actual exported Code-node strings and walks the exported graph through a complete four-request dry run and a seven-batch **mocked** live submission. This checks exported code and connections; it is distinct from running the n8n engine or sending live Campus requests.
- **Actual n8n import and engine dry run passed** in an isolated n8n **2.0.3** installation on Node.js 22.14.0, with an ephemeral local SQLite database and internal JavaScript runner. The final exported workflow was imported through `import:workflow` (only a local test workflow ID was added to the verification copy), then executed through `execute --id`. Its Final Report was `dry_run`, with four real official-source HTTP requests, 337 rows, 333 unique programs, no errors and the same dataset fingerprint as above. The execution graph contained **no Campus request node execution**. No credential was configured. This does not claim verification in the operator's own n8n instance or every n8n version.
- Engine verification caught and fixed the required export `versionId` metadata and the HTTP text response output-property setting. Both request nodes now explicitly return their text in `body`; regression checks assert both settings. The initial incomplete attempts were not counted as successful collection or ingestion.
- **50 application unit tests passed**, including parsing all four fixture pages and validating every normalized program against the actual `academicIngestSchema`.
- TypeScript, ESLint and Prisma schema validation passed. The schema and server APIs are unchanged.
- The production build passed. The unchanged `server.js` startup check passed with 11 CSS/JS/preload assets, 24 font requests and five private-file denials, without copying build artifacts.
- Export reproducibility is checked with `node integrations/n8n/uqu-academic/build-workflow.cjs --check`. Scoped Git attributes preserve fixture bytes and stable cross-platform export generation.

API response handling tests use mocked Campus responses for 200, 201, 207, 401, 403, 413, 415, 422, 429, 503 and network failures. They are **not** live ingestion or database integration tests. No database test suite was required or run for this standalone workflow release.

## Operator prerequisites and limits

Follow [README.ar.md](README.ar.md) to import the inactive workflow, keep the Campus node disabled, and perform a fresh dry run in the operator's own n8n instance. Configure `uqu-degrees` under the existing Owner-only sources interface and select an existing UQU-scoped Header Auth credential locally. Live submission additionally requires the exact confirmation phrase, the fingerprint from the reviewed fresh dataset, and deliberate enabling of the Campus node. New imports remain `pending_review` under the existing API contract.

No Campus migration, seed, environment change, Plesk build or restart is needed to use this workflow delivery. The previous academic-directory release must already be deployed. Self-hosted n8n Code runners may need the documented `crypto` built-in allowlist. No n8n dependency is added to Campus package files.

Study-plan URLs, campus, study mode and unavailable descriptions remain null. Fee labels are observations only and are not asserted as verified tuition. Source-layout changes, unresolved record errors, incomplete pages, changed totals or a changed approved dataset block submission. The workflow never deletes, hides, publishes or removes records missing from a later collection.
