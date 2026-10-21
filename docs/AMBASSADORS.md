# University ambassadors

This release extends the existing private administration system. Public registration, deployment architecture, ingestion payloads, university API keys, publication policies and existing passwords are unchanged.

## Owner workflow

1. Sign in at `https://campus.estudy24.com/portal-control-x7k92` as an Owner.
2. Open **المشرفون**, enter the account name and email, and choose **سفير جامعة** under **الدور**.
3. Select exactly one enabled university under **الجامعة المعيّنة**. Enter an individual password of at least 8 characters and its confirmation, then select **إضافة مشرف**. Deliver credentials through a trusted private channel. No demo accounts are seeded.
4. The Ambassador signs in through the same private login and receives a university-specific dashboard. University assignment is automatic for content creation.

Multiple Ambassadors can serve the same university. Owners can edit assignments, change roles, disable/remove accounts or issue the existing single-use password-reset code. Account changes revoke sessions and outstanding reset codes. Reset issuance revokes sessions immediately. Disabling a university also revokes its Ambassadors' sessions/reset codes and blocks new logins. Re-enabling a university requires a fresh login.

Owners can also create Owners and Editors. A current Owner cannot disable/remove/demote their own account. The last active Owner cannot be disabled, removed or demoted, including concurrent account-management requests.

## Permission boundaries

| Capability | Owner | Editor | Ambassador |
| --- | --- | --- | --- |
| News, events/calendar, programs/opportunities, links/services | All universities | Existing content permissions | Assigned university only |
| Publish reviewed university news directly | Yes | Yes | Assigned university only |
| Individual DELETE / bulk news deletion | Yes | Existing restriction retained | Assigned university only |
| University records / news automation policy | Yes | Existing read-only access | No |
| Advertisements / platform homepage content | Yes | Existing content permissions | No |
| Account management / security / settings / keys | Yes | No | No |
| Integration documentation, sources, global logs/audit | Yes | Existing permissions | No |

Ambassadors are denied resources outside the explicit `articles`, `events`, `programs`, `links` allowlist. Future content models must receive their own server-side scope implementation before becoming available. They cannot create or edit global/null-university content. New content/upload actions retain immutable actor IDs and university IDs in audit details, including after account removal. Old full editorial snapshots are withheld from Ambassadors because they can predate an Owner's reassignment of an article.

## Server enforcement

- Session validation checks that the account is active and that an Ambassador has an enabled university. Cookies, CSRF, password hashing, expiration and login rate limiting use the existing implementation.
- The data layer derives scope from a fresh account lookup. Lists, totals and article details use that university. Supplied foreign identifiers, slugs, null/global scopes and nested associations are rejected. Creates automatically receive the account's university ID.
- Mutations recheck the live session/account inside their database transaction. They share the account-management advisory lock and lock account/session rows, preventing a queued write from using stale authorization after revocation or reassignment.
- Detail reads and mutations of foreign records return no resource data. Mixed-university bulk selections fail in one transaction with no partial deletion/audit success. Existing article soft deletion and imported-content tombstones remain in place.
- Ambassador uploads are tagged with the assigned university. Private media reads and attachment references enforce that scope. Existing unassigned uploads are available only when already attached to an article or service link in the Ambassador's university; arbitrary unassigned uploads remain private. External university image URLs remain references and are not mistaken for private upload IDs.
- University deletion in the administration interface still means disabling. The new foreign key prevents physical deletion of an assigned university without explicitly resolving accounts first.

## Additive migration and Plesk deployment

New migration: **`202610210004_university_ambassadors`**.

It adds the `ambassador` enum value, nullable `Administrator.universityId`, nullable `UploadedMedia.universityId`, their indexes/foreign keys, and a check constraint requiring a university exactly when the account role is Ambassador. Existing Owner/Editor accounts and uploaded media retain null assignments. There are no destructive statements or data resets.

In Plesk, pull/deploy `main` to the existing application root, then use its Node.js 22/npm environment:

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run build
```

Run each command successfully before proceeding, then select **Restart App** in Plesk. Keep the existing application root, document root, `server.js` startup file and configured environment variables. No new environment variables, seed command, containers, standalone output, asset-copy commands or changes to n8n requests are required. Take the normal database backup before applying the additive migration. Do not use `migrate reset`, `db push`, or recreate existing accounts.

After restarting, verify an existing Owner login, create the first Ambassador through **المشرفون**, and test its assigned dashboard. Check one public university page and its CSS/JavaScript as usual. Production deployment and production database changes are deliberately left to the operator.

## Verification

See [the verification report](AMBASSADORS-VERIFICATION.md) for executed checks and results. Automated coverage includes role/assignment validation, PostgreSQL constraints, Owner-only account management, existing Editor restrictions, multiple Ambassadors, scoped content CRUD/publication, forged/nested/global associations, media, mixed-university bulk deletion, imported-news editorial protection, session revocation/reassignment, a queued-write revocation race, audit attribution and desktop/mobile browser navigation/forms.
