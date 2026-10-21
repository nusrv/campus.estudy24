# News multi-selection and bulk soft deletion

The existing private **الأخبار والمحتوى** table supports selecting individual articles and **تحديد الكل** for the currently displayed filtered page. It shows the selected count using Western digits and displays **حذف المحدد (X)** when the selection is non-empty. The header checkbox supports a partial-selection state. Changing filters or pages resets selection through the existing keyed resource manager. Only current visible, non-deleted article IDs are submitted. No selection controls are added to other resource sections or the deleted-items view.

Deletion retains the existing owner-only DELETE permission; editors keep their current content permissions and cannot use this bulk endpoint. Confirmation displays the exact count and explains recovery. Successful deletion clears selection and refreshes the list. Canceling makes no request. Errors retain the selection and show an Arabic message; a network/response failure asks the owner to refresh and verify the result rather than claiming success or rollback when the commit cannot be confirmed.

## Server operation

`POST /portal-control-x7k92/api/articles/bulk-delete` accepts only `{ "ids": ["ARTICLE_ID", "ANOTHER_ARTICLE_ID"] }`. The endpoint requires the existing authenticated owner session, exact-origin check and CSRF header. The service revalidates the active owner and input server-side. It accepts 1–100 unique existing article IDs, bounded to a 32 KiB JSON request. Unknown fields, duplicate IDs, invalid IDs and oversized selections are rejected. The 100-item maximum matches the existing maximum administration page size; this is not database-wide selection.

The complete selection must exist and still be non-deleted. A missing/stale/deleted record rejects the entire request with HTTP 409 and no mutations. The service calls the same article `soft_delete` implementation used by individual deletion, inside one serializable PostgreSQL transaction. All selected row changes, per-article edit snapshots and administration audit entries commit together or roll back together. Concurrent update conflicts are retried within a bounded budget, with deterministic ID ordering. A response is successful only after commit and returns the exact `ids` and `deleted_count`. Repeating a completed deletion returns a stale-selection conflict, not a misleading second success.

Article IDs, source associations and original source IDs remain intact. `deletedAt` and the existing publication lock prevent the next n8n ingestion cycle from restoring deleted articles or creating duplicates. Source text may still synchronize under the existing editorial protections; the article remains deleted and excluded from public queries. Individual restoration remains available in the deleted-items list. Existing ingestion payloads, scoped keys, publication policy, university records, advertisements and other content are unchanged. No bulk publishing/editing or permanent deletion is introduced.

## Plesk update

After your normal database backup, Pull Updates from GitHub `main` and Deploy in Plesk, run **`npm run build`**, then **Restart App** after a successful build. No new migration, seed, dependency installation, environment variable or hosting configuration change is required. Keep Node 22, `server.js`, existing Application Root and its `public` Document Root, credentials and persistent uploads unchanged. No Plesk deployment or production database operation is performed by development verification.

## Verification

Verified on 21 October 2026 with Node 22 and a disposable local PostgreSQL 18 database (`campus_bulk_test`):

| Check | Result |
| --- | --- |
| TypeScript, ESLint, Prisma validation | Passed |
| Unit tests | 36 passed, 0 failures, 0 skips |
| PostgreSQL/HTTP/browser integration tests | 40 passed, 0 failures, 0 skips across 4 suites |
| Production build | Passed with the installed Next.js 16.4.2 and Prisma 7.9.1 |
| `server.js` production smoke test | Passed: 11 CSS/JS/preload assets, 24 font requests, 5 private-file denials; no copying |

Tests cover bounded/unique ID validation, individual and page-level selection, deselection, page navigation, confirmation/cancellation, error retention, successful clearing/refresh, owner/editor permissions, CSRF, stale selections, exact-row deletion, retained edit/audit records, public invisibility, repeat ingestion/deduplication and recovery. Microsoft Edge browser tests executed at desktop (1440 px) and mobile (390 px) widths. Existing administrator, category, university, publication, ingestion, advertisement, visitor counter and API-key regression tests also passed. Production PostgreSQL and Plesk were not modified; actual Passenger/TLS deployment remains an operator step.
