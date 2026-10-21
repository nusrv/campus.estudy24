# Content automation verification — 21 October 2026

Run in the existing checkout on Windows, Node 22, PostgreSQL 18 on loopback using dedicated disposable databases whose names end in `_test`. No production database credentials, Plesk writes, migration reset or production deployment were used. The existing project/deployment architecture and previous migration files are retained.

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`) | Passed, including application, Prisma types and new tests. |
| ESLint (`npm run lint`) | Passed. |
| Prisma (`npm run db:validate`) | Passed; generated Prisma 7.9.1 client. |
| Unit tests (`npm test`) | 32 passed, no failures or skips. |
| Production build (`npm run build`) | Passed, installed Next.js 16.4.2 with webpack, all routes generated. |
| Standard production server (`npm run verify:production`) | Passed using the unchanged `server.js`: 11 CSS/JS/preload assets, 24 font requests, 5 private-file denials, no artifact copying. |
| Full PostgreSQL/HTTP/browser suite | Passed on fresh `campus_release_test`: 36 tests, 0 failures, 0 skips across all 4 suites. Desktop/mobile browser checks executed successfully. |
| Secret/generated-file review | No private keys, inline scoped API secrets, GitHub tokens, `.env`, generated build files or persistent uploads found among release candidates. Only the existing `.env.example` is tracked. |

The new suite exercises opt-in news publication; disabled defaults; incomplete/suspicious records; owner-only policy changes; manual title, unpublish, hide and soft-delete protection; concurrent duplicates; every structured endpoint's credential/scope enforcement, strict schemas, approval, correct public section, homepage isolation, edit preservation and deletion tombstones; Telegram validation, owner permissions, footer/community separation and clearing; authenticated workflow downloads; and repeatable logo seeding. Existing suites retain authentication/session/CSRF, setup concurrency, 8-character passwords, resets, last-owner protection, advertisement lifecycle, visitor counters, scoped key rotation/revocation and legacy news-key compatibility.

Playwright Core drove installed Microsoft Edge at 1440×1000 desktop and 390×844 touch/mobile viewports. Directory cards and dedicated pages were checked for correct mouse/touch hit targets, native secure new-tab navigation, Enter-key operation, RTL, Western digits, and successful local logo decoding. External official-site navigation was intercepted with a test page; this verifies anchor behavior without depending on university-server uptime. The browser subtest was executed, not skipped. On another workstation set `BROWSER_EXECUTABLE` to an installed Chromium/Edge executable; without a usable executable that subtest explicitly skips.

Before code changes, the reported official-link problem did not reproduce in a clean browser on production. Desktop/mobile hit-testing and new-tab navigation already worked there. No desktop overlay was observed. An extension-related failure is possible given the earlier popup-extension exception, but its cause is unproven. The shared native-link component validates stored URLs and adds consistent accessible hit targets; an affected browser with its actual extensions still needs post-deployment testing.

An initial development-suite run passed the new automation/browser suite, backend suite and university suite, but returned an unexpected 500 once on an existing editor/settings assertion. A fresh isolated administrator run passed all 8 tests. Reusing the first disposable database for setup then encountered its persisted bootstrap rate limit, as designed. Final verification uses a new database. Running a type check concurrently with Next dev startup also encountered removed generated `.next/dev/types` files; the final successful static checks ran with dev servers stopped. None of these checks contacted production PostgreSQL.

## Operational limits

Eight locally hosted logos were verified against university-owned pages and recorded in [the provenance manifest](university-logos.json). King Khalid and Imam Abdulrahman bin Faisal's brand assets could not be retrieved from their university servers; their fallback icons remain. Owners can upload authentic approved assets through university management. No unrelated emblem or generated replacement was used.

No university-specific Telegram community, platform support URL, additional RSS source, deadline, event or training information was invented. Owners must supply real Telegram URLs and explicitly enable automatic news publication for chosen universities. All structured imports continue requiring review, publication and visibility controls. Existing eStudy24 demo advertisements and tracking are reused.

One additive migration is required: `202610210003_content_automation_telegram`. It was applied only to disposable local databases during integration checks. `prisma migrate status` confirmed all 5 repository migrations applied and the disposable schema up to date. Production must run `db:migrate`, `db:generate`, the optional explicit `db:seed:logos`, `build`, then Restart App through Plesk, as detailed in [CONTENT-AUTOMATION.md](CONTENT-AUTOMATION.md). Existing news requests/keys remain compatible; the four new endpoints require new structured resource mappings using the same scoped university keys. No production deployment or Passenger/TLS/proxy verification is claimed.
