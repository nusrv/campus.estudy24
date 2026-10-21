# Plesk production deployment — campus.estudy24.com

For the Ambassador release, apply the additive migration and follow [AMBASSADORS.md](AMBASSADORS.md). Hosting settings, `server.js`, environment variables and n8n requests remain unchanged.

For the news-category update, run the explicit category seed described in [NEWS-CATEGORIES.md](NEWS-CATEGORIES.md). No new migration or hosting configuration change is required for that update.

For the current content-automation release, apply [CONTENT-AUTOMATION.md](CONTENT-AUTOMATION.md) first. For the earlier university/key/counter release, also apply [the current migration and explicit ten-university seed instructions](INTEGRATIONS.md). Hosting settings below stay the same.

This is the current deployment guide. Older phase reports describe historical standalone/container experiments and are not deployment instructions. No containers, standalone bundle, asset copying, SSH account provisioning, database reset, or production deployment automation is required.

## One-time settings

Deploy this repository's `main` branch to the domain's `httpdocs` directory. In **Domains → campus.estudy24.com → Node.js** set:

| Setting | Exact value |
| --- | --- |
| Application Root | `/httpdocs` (the directory containing `package.json` and `server.js`) |
| Document Root | `/httpdocs/public` |
| Application Startup File | `server.js` |
| Application Mode | `production` |
| Node.js | Node 22 LTS, **22.14 or newer** |

Paths above are relative to the domain/subscription home, not Linux `/`. If Git already deploys to a different directory, keep that directory as Application Root and select its `public` child as Document Root; do not move or overwrite production data to match the example. Never set Document Root to the repository root, `.next`, or `.next/standalone`.

Under **Apache & nginx Settings**, keep **Proxy mode** enabled and disable **Smart static files processing** and **Serve static files directly by nginx** for this domain. Requests, including `/_next/static/*`, must reach Passenger/Next.js. The checked-in `public/.htaccess` denies dotfiles and directory listings on Apache; `public/web.config` disables directory browsing for IIS. Keep nginx directory listing disabled (the default). Do not add an alias exposing the application root, `.next`, uploads, or `node_modules`. In particular, never publish an `.env` or a project archive in `public`. This document-root boundary protects private files even when Node is stopped. Uploaded files remain outside Document Root and go through the existing authorized media routes.

`server.js` always runs production Next.js, accepts Passenger's listener/`PORT` (including socket paths), and drains HTTP requests on SIGTERM/SIGINT with a ten-second shutdown deadline. Do not hardcode a production port or modify Passenger's listener. `npm start` uses the same entry. Next.js serves its normal `.next/static` CSS/JS/font output and `public` assets directly; there is no copy step.

Preserve existing custom environment variables. Confirm `APP_URL` and `SITE_URL` are `https://campus.estudy24.com`, and retain the current `DATABASE_URL`, `AUTH_SECRET`, `INGEST_API_KEY`, `UPLOAD_DIR`, and trusted-proxy policy. `UPLOAD_DIR` must remain persistent and writable outside `public`. Never replace existing variables with `.env.example`, rotate secrets accidentally, or copy development credentials to production. Install build dependencies too: use `npm install --include=dev` if Plesk's production mode omits dev dependencies (Prisma CLI, TypeScript, Tailwind and ESLint are needed for build/checks).

## Normal releases

1. Push to GitHub; in Plesk Git **Pull Updates**, then **Deploy** into the existing Application Root. Preserve uploads and environment settings.
2. When `package.json` or `package-lock.json` changes, run **NPM Install** with dev dependencies included (`npm install --include=dev` via the Node.js npm interface). Do not replace installed dependencies while a build is running.
3. Back up PostgreSQL and uploads. For releases with new committed migrations run **Run script → db:migrate** once against the existing database. It runs `prisma migrate deploy`, applies only unapplied migrations, and does not reset or seed over existing data. Never use `migrate reset`, `db push`, or baseline an existing database without reviewing its history. This release adds `202610210001_administrator_setup`; it must be applied before restarting the updated application.
4. **Run script → build** (`prisma generate && next build --webpack`). Do not restart if the build fails. Build does not run migrations or change PostgreSQL data. Existing environment variables remain in Plesk.
5. Click **Restart App**. Verify `/`, `/design-system`, a university page, and the private login. In browser network tools confirm CSS, JS, and local font requests under `/_next/static/` return 200. Check that `/.env`, `/.git/config`, `/package.json`, `/prisma/schema.prisma`, and `/server.js` return 403/404. No build-file copying or standalone directory is used.

For initial empty-database installation only, apply the committed migrations and optionally run `db:seed` for UQU defaults. Existing installations do not need reseeding. Do not run any commands against production automatically from this repository.

## First owner through the browser

Existing administrators and their password hashes continue working. Migration seals bootstrap immediately when any administrator already exists; do not set a bootstrap secret for those installations.

For a genuinely empty installation:

1. In a trusted local password manager generate a unique random authorization secret of at least 32 characters (48 random bytes recommended). Set it privately in Plesk as **`ADMIN_BOOTSTRAP_TOKEN`**, restart, and keep it out of Git, URLs, screenshots and deployment logs. This is separate from `AUTH_SECRET` and the n8n key.
2. Open **`https://campus.estudy24.com/portal-control-x7k92`** over HTTPS. With zero administrators the private login flow displays initial setup. Enter the secret in the masked authorization field, email, display name, password (8–256 characters), and confirmation. The server requires the configured secret, exact origin, size limit and persistent rate limit. Missing configuration closes setup; an arbitrary visitor cannot claim ownership.
3. After success, log in normally. Remove `ADMIN_BOOTSTRAP_TOKEN` from Plesk and restart. Creation permanently seals the setup marker in the same PostgreSQL transaction as the owner and audit record. A database transaction advisory lock makes concurrent attempts yield one owner and one rejection. Removing accounts outside the application does not reopen the marker. Do not delete the marker to recover access.

No setup/admin links appear in public navigation. All private pages inherit no-index/no-store protection. Setup does not sign users in automatically. The old interactive `admin:create` script remains an optional local recovery-free provisioning tool and uses the same one-owner transaction, but is no longer part of deployment.

## Additional administrators and resets

Owners open **المشرفون** in the private dashboard. They can create Owner, Editor and Ambassador accounts. Ambassadors require exactly one enabled university; see [AMBASSADORS.md](AMBASSADORS.md) for scoped content permissions and assignment changes. Owners can edit identity, disable/re-enable or remove accounts, and issue password-reset codes. Editors and Ambassadors cannot manage accounts or security settings. The application prevents self-removal/self-disable/self-demotion and removal, disabling or demotion of the last active Owner, including concurrent requests. Account changes revoke sessions and outstanding reset codes. Deletion retains audit records; response objects never include password hashes.

Reset issuance invalidates sessions immediately and returns a random code once to the authorized owner. Deliver it to the account holder through a trusted private channel, together with **`https://campus.estudy24.com/portal-control-x7k92/reset`**. The account holder enters their email, code and new password; no email service or public registration is added. Codes expire after 30 minutes, are stored only as HMAC digests, are single-use across concurrent requests, and never appear in URLs or audit logs. A pending unexpired reset blocks login with the old password. Expiration cancels that pending reset; the previous password remains valid until a successful reset. Run the existing `maintenance` task to clear expired records. Password fields are masked and never put into command arguments, logs, or audit details.

## Database changes and limitations

The original administrator-setup migration creates `AdministrationBootstrap` and `AdminPasswordReset` plus indexes/foreign key. The subsequent [Ambassador migration](AMBASSADORS.md) adds the role, university assignment and upload scope. Existing administrators, hashes, sessions, content, integrations, and prior migration files are preserved. No production database operation or Plesk deployment is performed by development checks.

Local production-server/asset verification establishes the startup entry works with the built project; final Passenger, TLS, proxy and filesystem permissions must still be checked on your Plesk installation after the manual restart.

References: [Plesk Node.js settings](https://doc.plesk.com/en-US/obsidian/administrator-guide/website-management/hosting-nodejs-applications.76652/), [Next.js custom server API](https://nextjs.org/docs/pages/guides/custom-server).
