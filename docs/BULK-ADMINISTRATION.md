# Unified administration selection and actions

This release extends the existing private dashboard. It adds no public accounts, RSS scheduler, workflow changes, deployment architecture, or production-data script.

## Complete management-list inventory

| Collection / dashboard list | Available bulk operations | Authorization / constraints |
| --- | --- | --- |
| News (`articles`) | Publish, unpublish, hide, soft-delete, restore | Owner / Editor content permissions; Editor cannot delete. Ambassadors operate within their university only. |
| Academic degrees (`academic-programs`) | Publish, unpublish, hide, soft-delete, restore | Same role boundaries. Preserves source identity and manual editorial fields. |
| eStudy24 homepage/news/blog/guides (`platform_posts`) | Publish, unpublish, hide, soft-delete, restore | Owner / Editor; delete Owner-only. No Ambassador access. |
| Events, academic dates, registrations and examinations (`events`, filtered by `kind`) | Publish, unpublish, hide, delete | Owner / Editor; delete Owner-only except Ambassadors' own university. Imported deletion retains a ContentSync tombstone. These types share one list, not separate unimplemented screens. |
| Training programs and opportunities (`programs`) | Publish, unpublish, hide, delete | Same content authorization and import tombstones. Separate from academic degrees. |
| Student services, timetable/calendar resources and university/global links (`links`, filtered by `kind`) | Publish, unpublish, hide, enable, disable, delete | Same content authorization; Ambassadors cannot access global/null-university rows. Imported deletion retains a tombstone. |
| Advertisements (`ads`) | Activate, pause, archive, delete | Owner / Editor; delete Owner-only. Ambassadors denied. Other advertisements, associations and metrics remain intact. Deleting selected ads uses existing hard-delete semantics. |
| Universities (`universities`) | Enable, disable | Owner only. No university deletion or content cascade. Disabling revokes assigned Ambassador sessions and reset authorizations. |
| Import sources (`sources`) | Enable, disable | Owner only. Preserves provenance and independent academic policy. No bulk credential generation/rotation or automation-policy editing. |
| Shared categories (`categories`) | Delete unused categories | Owner only; any association with university or platform content rejects the entire deletion. No published articles are reclassified or detached. Category names/slugs remain individually editable. |
| Administrator / Editor / Ambassador cards (`administrators`) | Enable, disable | Owner only; typed confirmation. No bulk deletion, role reassignment or password reset. Self-disable and removal of the last active Owner are rejected. Disabled accounts lose sessions and reset authorizations. |
| University integration active-key list (`api-keys`) | Revoke | Owner only, one explicit university; typed irreversible confirmation. Returned data contains no hashes/secrets. Revoked-key history is read-only and has no meaningless checkbox. Current key creation/rotation remains individual. |

The following were audited and deliberately remain unselectable: overview metrics/recent-content summaries, ingestion logs, audit history, API documentation, settings forms, visitor statistics, login/setup/reset forms and lookup options (placements, universities in dropdowns, media form inputs). They have no record-level management actions. Uploaded media has no standalone management list: uploads are controlled form operations; the authenticated file reader is not a media-management collection. The audit did not find any other manageable dashboard list.

The same selection hook, page selector, per-record checkbox, action policy, toolbar and confirmation dialog are used by standard tables, administrator cards and active integration keys. Editors do not receive checkboxes on collections for which they have no bulk write capability. Read-only screens remain read-only.

## Selection contract and consistency

- Individual selections persist in **sessionStorage**, scoped to the current authenticated browser session and collection. Page/page-size changes retain the selection. Search, university and other filter changes clear it and show an Arabic notice. Nothing is stored in public cookies or localStorage.
- The page checkbox explicitly says **تحديد الصفحة الحالية**. It adds/removes only that page's eligible rows; selections on other pages remain intact.
- **تحديد جميع النتائج المطابقة للفلاتر (N)** creates an authenticated, session-bound server snapshot, with a maximum of **5000 records**. The browser receives a token and exact count, never the complete cross-page ID/revision set. Exceeding the limit returns an explicit validation error and requires narrower filters; it never truncates or falls back to the visible page.
- A snapshot freezes identities and relevant record revisions for **30 minutes**. New matching records do not join it. Explicit exclusions remove selected identities from the action count. Page membership is checked server-side in batches of at most 100 so newly arrived rows are not falsely shown as selected. Such rows remain outside the snapshot until a fresh selection.
- Listing and bulk filters use the same `managementQuery` parser and database predicates, including university, category, publication/deletion state, academic degree/college/department, event kind/date, source enabled state and account filters. Unknown fields, forged university identifiers and unsupported filters are rejected.
- Preview rechecks current permissions, assignment, filters, revisions and action eligibility. It returns a single-action confirmation valid for **up to 10 minutes**, never beyond the snapshot expiry, with the exact count and university scope. Security operations require typing the exact displayed Arabic action/count phrase. Other actions use the shared explicit confirmation button.
- Execution locks the confirmation and selected rows and rechecks everything in one serializable transaction. A removed, edited, reassigned or no-longer-matching selected record rejects the whole action with no partial content changes. Unselected additions or excluded-record changes do not expand the dataset. A concurrent import that updates selected metadata may invalidate a snapshot: refresh and review again.
- Completed confirmations retain their result for replay while their private snapshot is retained (up to 24 hours). Retry the **same confirmation** after an uncertain connection result; the action is not repeated. Never infer failure solely from a client timeout. Fresh authentication is required on every replay.
- Results report affected, semantically changed, unchanged and failed counts, plus an operation ID. Operations are **atomic**, not best-effort loops: database or permission errors roll back all selected content changes and audit writes. A completed action reports zero failures. The UI clears selection and refreshes after confirmed success; failures remain visible in Arabic.
- Private snapshot/confirmation rows older than 24 hours are cleaned opportunistically when a new all-results snapshot is created. No new infrastructure or scheduler is needed. Expired selections cannot authorize actions even before cleanup. IDs are bound to actor, role/assignment, resource and session; they are not authentication credentials.

Authenticated requests use the existing private route:

```text
POST /portal-control-x7k92/api/bulk/[resource]
```

All require the existing session, same-origin checks and `x-csrf-token`. Requests are capped at the existing 1 MiB body limit and 180 per minute per administrator. Strict Zod schemas support `snapshot`, page `membership`, `preview`, and `execute`; clients cannot send arbitrary mutation fields or change a confirmed ID set. The legacy article bulk-delete endpoint remains supported for compatibility, with its existing limits and semantics.

## Academic source policy

Under **مصادر الاستيراد**, Owners can edit **النشر التلقائي للتخصصات الأكاديمية** independently for each trusted source. The additive database field `IngestionSource.autoPublishAcademicPrograms` defaults to **false**, including every existing source. Source creation defaults false; an update omitting the optional field preserves its previous value.

This setting only affects **new** records received by `/api/ingest/academic-programs`. It does not affect news automation, training, calendar or services workflows. New programs are published automatically only after existing scoped authentication/source-host/strict payload validation and conservative completeness/trust checks: a substantive name, official degree and college, HTTPS official program evidence on the source host, and no suspicious imported markup. Optional unknown fields remain nullable; incomplete or suspicious otherwise-valid records stay pending review. Fee/group validation remains enforced; no tuition or admission information is inferred.

Existing records always preserve publication status, visibility, deletion state and manually corrected fields during synchronization. **Enabling the setting does not publish pending records**, and later imports never automatically republish manually unpublished or hidden programs. Deleted identities remain protected. Each new-record decision is recorded in IngestionLog and AuditLog, with source/university and request identity; Owner policy changes are audited. The option is not exposed to Editors or Ambassadors through write endpoints.

The existing n8n academic workflow and payload format remain unchanged. Its conservative review wording describes the default source policy; an Owner may now explicitly opt a trusted source into the policy above. No workflow or API-key rotation is required.

## Public degree ordering

The public academic directory prioritizes diploma and bachelor's degree designations before pagination, using database predicates on the original degree text. This covers `دبلوم متوسط`, `دبلوم عالٍ`, other labels containing `دبلوم`, Arabic bachelor's variants, and English diploma/bachelor labels. The preferred group retains title/ID ordering; remaining degrees retain title/ID ordering afterward. Master's, doctorates, fellowships, other degrees and null degree names remain available. The original degree values and existing search, college, department and exact-degree filters are not rewritten or removed. No stored rank field or reclassification is introduced.

## Plesk deployment

One additive migration: **`202610250001_unified_bulk_actions`**. It adds the disabled-by-default source option and two private expiring-selection/confirmation tables. It does not modify academic publication states, content, account credentials, API keys or existing university records. **No seed or new environment variable is required.**

In the existing Plesk application root, after the normal backup and Git pull/deploy, use Node.js 22 and run:

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run build
```

Then **Restart App**, keeping the existing `server.js`, document root, PostgreSQL connection and configured environment. No standalone output, containers or asset copying. Do not reset migrations or run any direct publication SQL. This release does not deploy automatically or access production data.

## نشر برامج أم القرى الـ333 عبر الإدارة

1. بعد نشر الإصدار وتنفيذ الترحيل وإعادة التشغيل، سجّل الدخول بحساب **مدير المنصة**.
2. افتح **التخصصات والبرامج الأكاديمية** واختر **جامعة أم القرى**، ثم **تطبيق التصفية**. أزل أي مرشحات إضافية لا تريد تقييد التحديد بها.
3. تحقق من عدد النتائج. إذا كان 333، اضغط **تحديد جميع النتائج المطابقة للفلاتر (333)**، وليس تحديد الصفحة الحالية.
4. تحقق من عبارة **تم تحديد 333 سجلًا**، ثم اختر **نشر المحدد** واضغط زر مراجعة الإجراء.
5. راجع الجامعة والعدد الدقيق 333 في نافذة التأكيد، ثم **تأكيد التنفيذ على 333 سجلًا**. إذا تغيرت البيانات أو العدد، لا تتجاوز التحذير؛ حدّث القائمة وأعد المراجعة.
6. انتظر نتيجة العملية وتصفير التحديد. افتح `/universities/uqu?section=academic-programs`، وراجع العدد والصفحات والمرشحات. الدبلومات والبكالوريوس تظهر أولًا، وبقية الدرجات متاحة دون حذف.

هذه عملية يختارها المالك من الواجهة بعد النشر، وليست جزءًا من الترحيل أو من تفعيل سياسة النشر التلقائي. لا يوجد سكربت خاص لتحديث برامج الإنتاج.
