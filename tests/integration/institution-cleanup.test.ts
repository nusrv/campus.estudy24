import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { mkdtemp, mkdir, writeFile, access, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { seedCampus } from '../../prisma/seed-campus.ts';
import { cleanupPreflight, cleanupInstitutions } from '../../src/server/institution-cleanup.ts';
import { seedCourseMappings } from '../../src/server/course-catalog-service.ts';
import { removeQueuedMedia } from '../../src/server/media-cleanup.ts';
import { hashPassword, tokenDigest, csrfToken, ADMIN_PATH, SESSION_COOKIE } from '../../src/server/security.ts';
const url = process.env.TEST_DATABASE_URL;
test('Owner-controlled permanent cleanup: graph, conflicts, rollback, shared data and one-time completion', { skip: !url, timeout: 900000 }, async t => {
  assert.equal(new URL(url!).hostname, '127.0.0.1'); assert.match(new URL(url!).pathname, /_test$/);
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr);
  const { createDatabase } = await import('../../src/server/database-client.ts'); const db = createDatabase(url); t.after(() => db.$disconnect());
  assert.equal(await db.university.count(), 0, 'Fresh isolated database required');
  await seedCampus(db); await seedCourseMappings(db);
  const hash = await hashPassword(randomBytes(24).toString('base64url'));
  const owner = await db.administrator.create({ data: { email: 'cleanup-owner@test.invalid', name: 'مدير اختبار', passwordHash: hash, role: 'owner' } });
  const editor = await db.administrator.create({ data: { email: 'cleanup-editor@test.invalid', name: 'محرر اختبار', passwordHash: hash, role: 'editor' } });
  async function session(id: string) { const s = await db.adminSession.create({ data: { administratorId: id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } }); return { id, sessionId: s.id }; }
  const actor = await session(owner.id), editorActor = await session(editor.id);
  const ksu = await db.university.findUniqueOrThrow({ where: { slug: 'ksu' } }), uqu = await db.university.findUniqueOrThrow({ where: { slug: 'uqu' } });
  const target = await db.administrator.create({ data: { email: 'cleanup-target@test.invalid', name: 'سفير اختبار', passwordHash: hash, role: 'ambassador', universityId: ksu.id } }); const ambassadorActor = await session(target.id);
  const retainedAmb = await db.administrator.create({ data: { email: 'cleanup-retained@test.invalid', name: 'سفير باقٍ', passwordHash: hash, role: 'ambassador', universityId: uqu.id } }); const retainedSession = await session(retainedAmb.id);
  const source = await db.ingestionSource.findUniqueOrThrow({ where: { key: 'ksu-rss' } });
  const article = await db.article.create({ data: { title: 'خبر خاص محذوف', universityId: ksu.id, sourceId: source.id } });
  const keptArticle = await db.article.create({ data: { title: 'خبر باقٍ', universityId: uqu.id } });
  await db.articleEdit.create({ data: { articleId: keptArticle.id, administratorId: target.id, before: {}, after: { title: 'تحرير تاريخي محفوظ' } } });
  await db.auditLog.create({ data: { administratorId: target.id, action: 'edit', entity: 'article', entityId: keptArticle.id } });
  const event = await db.event.create({ data: { title: 'موعد خاص', universityId: ksu.id, startsAt: new Date() } });
  await db.program.create({ data: { title: 'تدريب خاص', universityId: ksu.id, startsAt: new Date() } });
  await db.academicProgram.create({ data: { title: 'تخصص خاص', universityId: ksu.id } });
  await db.managedLink.create({ data: { title: 'رابط خاص', universityId: ksu.id, destinationUrl: 'https://ksu.edu.sa' } });
  await db.contentSync.create({ data: { sourceId: source.id, recordId: event.id, contentType: 'events', originalId: 'event-1', fingerprint: 'test', sourceSnapshot: {} } });
  await db.ingestionLog.create({ data: { sourceId: source.id, articleId: article.id, requestId: 'fixture', outcome: 'created' } });
  await db.articleRegistrationLink.create({ data: { articleId: article.id, url: 'https://ksu.edu.sa' } });
  const key = await db.universityApiKey.create({ data: { universityId: ksu.id, keyHash: randomBytes(32).toString('hex') } });
  const retainedKey = await db.universityApiKey.create({ data: { universityId: uqu.id, keyHash: randomBytes(32).toString('hex') } });
  const shared = await db.advertisement.create({ data: { title: 'إعلان مشترك', global: false, destinationUrl: 'https://estudy24.com', buttonText: 'عرض', placementId: 'university_banner', universities: { create: [{ universityId: ksu.id }, { universityId: uqu.id }] } } });
  const global = await db.advertisement.create({ data: { title: 'إعلان عالمي', global: true, destinationUrl: 'https://estudy24.com', buttonText: 'عرض', placementId: 'university_banner', universities: { create: { universityId: ksu.id } } } });
  const sharedFile = await db.uploadedMedia.create({ data: { universityId: ksu.id, filename: `${randomUUID()}.png`, originalName: 'shared.png', mimeType: 'image/png', size: 8 } });
  const exclusiveFile = await db.uploadedMedia.create({ data: { universityId: ksu.id, filename: `${randomUUID()}.png`, originalName: 'exclusive.png', mimeType: 'image/png', size: 8 } });
  await db.advertisement.update({ where: { id: shared.id }, data: { imageUrl: `/media/${sharedFile.id}` } });
  await db.articleMedia.create({ data: { articleId: article.id, url: `/media/${exclusiveFile.id}`, attribution: 'fixture', kind: 'image' } });
  const originalMappings = await db.courseUniversityMapping.findMany({ orderBy: { id: 'asc' } });
  const originalRetained = await db.university.findMany({ where: { slug: { notIn: ['ksu', 'kku', 'taibah'] } }, orderBy: { id: 'asc' } });
  let reusedBaha: { id: string; slug: string; description: string } | undefined;
  const approve = async () => ({ snapshot: (await cleanupPreflight(db, actor)).snapshot, confirmed: true });
  await t.test('Owner only, authenticated session, explicit confirmation and read-only private preflight', async () => {
    for (const denied of [editorActor, ambassadorActor, { id: owner.id, sessionId: 'forged' }]) await assert.rejects(() => cleanupPreflight(db, denied));
    const before = await db.auditLog.count(), report = await cleanupPreflight(db, actor);
    assert.equal(report.targets.length, 3); assert.deepEqual(report.conflicts, []); assert.equal(await db.auditLog.count(), before);
    assert.equal(report.counts.preservedSharedAds, 2); assert.equal(report.counts.preservedSharedUploads, 1); assert.equal(report.counts.exclusiveUploads, 1);
    assert.doesNotMatch(JSON.stringify(report), /passwordHash|keyHash|tokenHash|cleanup-owner@|cleanup-target@/);
    await assert.rejects(() => cleanupInstitutions(db, editorActor, { snapshot: report.snapshot, confirmed: true }));
    await assert.rejects(() => cleanupInstitutions(db, actor, { snapshot: report.snapshot, confirmed: false }));
    await assert.rejects(() => cleanupInstitutions(db, actor, { snapshot: report.snapshot, confirmed: true, universityIds: [uqu.id] }));
  });
  await t.test('unexpected institutions, duplicate identities, inactive matches and occupied slugs fail safely', async () => {
    await db.university.update({ where: { id: ksu.id }, data: { name: 'هوية مختلفة' } }); assert.ok((await cleanupPreflight(db, actor)).conflicts.some(c => c.includes('هوية'))); await assert.rejects(async () => cleanupInstitutions(db, actor, await approve())); await db.university.update({ where: { id: ksu.id }, data: { name: ksu.name } });
    const unknown = await db.university.create({ data: { name: 'مؤسسة غير معتمدة', slug: 'unexpected' } });
    assert.ok((await cleanupPreflight(db, actor)).conflicts.length); await assert.rejects(async () => cleanupInstitutions(db, actor, await approve())); await db.university.delete({ where: { id: unknown.id } });
    const inactive = await db.university.create({ data: { name: 'جامعة الباحة', slug: 'existing-baha', enabled: false } });
    assert.ok((await cleanupPreflight(db, actor)).conflicts.some(c => c.includes('معطلة')));
    const duplicate = await db.university.create({ data: { name: 'جامعة الباحة', slug: 'second-baha' } });
    assert.ok((await cleanupPreflight(db, actor)).conflicts.some(c => c.includes('تعارض')));
    await db.university.delete({ where: { id: duplicate.id } }); await db.university.delete({ where: { id: inactive.id } });
    const occupied = await db.university.create({ data: { name: 'هوية مختلفة', slug: 'baha' } }); assert.ok((await cleanupPreflight(db, actor)).conflicts.length); await db.university.delete({ where: { id: occupied.id } });
    reusedBaha = await db.university.create({ data: { name: 'جامعة الباحة', slug: 'owner-baha', description: 'وصف محفوظ من تحرير المالك' } });
  });
  await t.test('unknown database cascades and cross-university source dependencies block deletion', async () => {
    await db.$executeRawUnsafe('CREATE TABLE "CleanupUnknownFixture" ("id" TEXT PRIMARY KEY, "universityId" TEXT REFERENCES "University"("id") ON DELETE CASCADE)');
    assert.ok((await cleanupPreflight(db, actor)).conflicts.some(c => c.includes('غير معروفة')));
    await assert.rejects(async () => cleanupInstitutions(db, actor, await approve()));
    await db.$executeRawUnsafe('DROP TABLE "CleanupUnknownFixture"');
    await db.article.update({ where: { id: keptArticle.id }, data: { sourceId: source.id } });
    assert.ok((await cleanupPreflight(db, actor)).conflicts.some(c => c.includes('مصدر تابع')));
    await db.article.update({ where: { id: keptArticle.id }, data: { sourceId: null } });
  });
  await t.test('stale graph fails; injected late deletion failure rolls back all earlier changes', async () => {
    const old = await approve(); await db.article.update({ where: { id: article.id }, data: { title: 'تغيير بعد الفحص' } });
    await assert.rejects(() => cleanupInstitutions(db, actor, old), (e: { code?: string }) => e.code === 'STALE_PREFLIGHT');
    await db.$executeRawUnsafe(`CREATE FUNCTION cleanup_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rollback'; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER cleanup_fixture_fail BEFORE DELETE ON "University" FOR EACH ROW EXECUTE FUNCTION cleanup_fixture_fail()');
    const count = await db.university.count(); await assert.rejects(async () => cleanupInstitutions(db, actor, await approve()));
    assert.equal(await db.university.count(), count); assert.ok(await db.article.findUnique({ where: { id: article.id } })); assert.ok(await db.administrator.findUnique({ where: { id: target.id } })); assert.equal(await db.mediaDeletionJob.count(), 0); assert.equal(await db.courseUniversityMapping.count(), originalMappings.length); assert.equal(await db.auditLog.count({ where: { action: 'approved_institution_cleanup_v1' } }), 0);
    await db.$executeRawUnsafe('DROP TRIGGER cleanup_fixture_fail ON "University"'); await db.$executeRawUnsafe('DROP FUNCTION cleanup_fixture_fail()');
  });
  await t.test('authenticated HTTP, CSRF, accordion, RTL desktop/mobile and one-confirmation Owner execution', async () => {
    const listener = createServer().listen(0, '127.0.0.1'); await once(listener, 'listening'); const address = listener.address(); assert.ok(address && typeof address === 'object'); const port = address.port; await new Promise<void>(done => listener.close(() => done()));
    const origin = `http://localhost:${port}`, secret = randomBytes(48).toString('hex');
    const uploadDirectory = await mkdtemp(path.join(tmpdir(), 'campus-owner-cleanup-')); t.after(() => rm(uploadDirectory, { recursive: true, force: true }));
    await writeFile(path.join(uploadDirectory, exclusiveFile.filename), 'exclusive test bytes'); await writeFile(path.join(uploadDirectory, sharedFile.filename), 'shared test bytes');
    const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', String(port)], { env: { ...process.env, NODE_ENV: 'development', APP_URL: origin, DATABASE_URL: url, AUTH_SECRET: secret, TRUST_PROXY: 'false', UPLOAD_DIR: uploadDirectory }, stdio: 'ignore' });
    t.after(() => { server.kill(); });
    let ready = false; for (let attempt = 0; attempt < 180; attempt++) { try { if ((await fetch(origin + '/api/universities')).ok) { ready = true; break; } } catch {} await new Promise(done => setTimeout(done, 1000)); } assert.ok(ready, 'Local application ready');
    const actors = [owner, editor, retainedAmb];
    const auths = await Promise.all(actors.map(async a => { const token = randomBytes(32).toString('base64url'), digest = tokenDigest(token, secret); await db.adminSession.create({ data: { administratorId: a.id, tokenHash: digest, expiresAt: new Date(Date.now() + 3600000) } }); return { token, csrf: csrfToken(digest, secret) }; }));
    const endpoint = origin + ADMIN_PATH + '/api/institution-cleanup';
    assert.equal((await fetch(endpoint)).status, 401);
    for (const auth of auths.slice(1)) for (const method of ['GET', 'POST']) assert.equal((await fetch(endpoint, { method, headers: { cookie: `${SESSION_COOKIE}=${auth.token}`, origin, 'x-csrf-token': auth.csrf, 'content-type': 'application/json' }, ...(method === 'POST' && { body: '{}' }) })).status, 403);
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${auths[0].token}`, origin, 'content-type': 'application/json' }, body: '{}' })).status, 403);
    const old = await fetch(origin + ADMIN_PATH + '/api/institution-reconciliation', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${auths[0].token}`, origin, 'x-csrf-token': auths[0].csrf } }); assert.equal(old.status, 410);
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; assert.ok(existsSync(edge), 'Browser required for verification');
    const browser = await chromium.launch({ executablePath: edge, headless: true });
    try {
      for (let index = 0; index < actors.length; index++) for (const width of [1440, 390, 320]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } }); await context.addCookies([{ name: SESSION_COOKIE, value: auths[index].token, url: origin + ADMIN_PATH }]); const page = await context.newPage();
        await page.goto(origin + ADMIN_PATH + '/articles'); await page.getByRole('button', { name: 'إضافة جديد', exact: true }).waitFor();
        assert.equal(await page.locator('html').getAttribute('dir'), 'rtl'); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (width < 1000) await page.getByRole('button', { name: 'قائمة الإدارة', exact: true }).click();
        const nav = width < 1000 ? page.getByRole('dialog', { name: 'قائمة الإدارة', exact: true }) : page.locator('aside');
        const group = nav.getByRole('button', { name: 'المحتوى', exact: true }); assert.equal(await group.getAttribute('aria-expanded'), 'true'); await group.focus(); await page.keyboard.press('Enter'); assert.equal(await group.getAttribute('aria-expanded'), 'false'); assert.equal(await nav.locator('button[aria-expanded="true"]').count(), 0); await group.click(); assert.equal(await group.getAttribute('aria-expanded'), 'true');
        assert.equal(await nav.getByRole('link', { name: 'فحص وتسوية دليل المؤسسات', exact: true, includeHidden: true }).count(), 0);
        assert.equal(await nav.getByRole('link', { name: 'المشرفون والصلاحيات', exact: true, includeHidden: true }).count(), index === 0 ? 1 : 0);
        assert.equal(await nav.getByRole('link', { name: 'الإعلانات', exact: true, includeHidden: true }).count(), index === 2 ? 0 : 1);
        assert.ok(await nav.getByRole('button', { name: 'تسجيل الخروج', exact: true }).isVisible());
        await page.screenshot({ path: `.npm-logs/admin-sidebar-${actors[index].role}-${width}.png`, fullPage: true });
        if (width < 1000) { await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog', { name: 'قائمة الإدارة', exact: true }).count(), 0); }
        if (index === 0) {
          await page.goto(origin + ADMIN_PATH + '/universities'); await page.getByRole('button', { name: 'مراجعة المؤسسات', exact: true }).click(); const modal = page.getByRole('dialog', { name: 'تأكيد الحذف النهائي', exact: true }); await modal.waitFor(); assert.ok((await modal.innerText()).includes('جامعة الملك سعود')); assert.ok((await modal.innerText()).includes('جامعة الملك خالد')); assert.ok((await modal.innerText()).includes('جامعة طيبة')); await page.screenshot({ path: `.npm-logs/cleanup-confirmation-${width}.png`, fullPage: true }); await modal.getByRole('button', { name: 'إلغاء', exact: true }).click(); assert.equal(await db.university.count(), 11);
          await page.goto(origin + ADMIN_PATH + '/advanced'); await page.getByRole('heading', { name: 'إعدادات متقدمة', exact: true }).waitFor();
          await page.goto(origin + ADMIN_PATH + '/course-catalog'); await page.getByRole('heading', { name: 'مزامنة eStudy24', exact: true }).waitFor(); assert.equal(await page.getByLabel('تصنيف eStudy24', { exact: true }).count(), 0);
          await page.goto(origin + ADMIN_PATH + '/course-catalog?view=catalog'); await page.getByRole('heading', { name: 'شروحات المواد', exact: true }).waitFor();
          if (width === 1440) for (const section of ['academic-programs', 'events', 'programs', 'links', 'ads', 'platform_posts', 'sources', 'categories', 'logs', 'audit', 'administrators', 'platform-settings']) {
            const response = await page.goto(origin + ADMIN_PATH + '/' + section); assert.equal(response?.status(), 200, section); assert.ok(await page.locator('main h1').count() > 0, section);
          }
        }
        await context.close();
      }
      const context = await browser.newContext(); await context.addCookies([{ name: SESSION_COOKIE, value: auths[0].token, url: origin + ADMIN_PATH }]); const page = await context.newPage(); await page.goto(origin + ADMIN_PATH + '/universities'); await page.getByRole('button', { name: 'مراجعة المؤسسات', exact: true }).click(); const modal = page.getByRole('dialog', { name: 'تأكيد الحذف النهائي', exact: true }); await modal.waitFor();
      const response = page.waitForResponse(r => r.url() === endpoint && r.request().method() === 'POST'); await modal.getByRole('button', { name: 'تأكيد الحذف وتنظيم المؤسسات', exact: true }).click(); const result = await response; assert.equal(result.status(), 200, await result.text()); await page.getByRole('button', { name: 'مراجعة المؤسسات', exact: true }).waitFor({ state: 'detached' });
      const directory = await (await fetch(origin + '/api/universities?page_size=100')).json(); assert.equal(directory.total, 10); assert.equal(directory.items.filter((u: { institutionType: string }) => u.institutionType === 'COLLEGE').length, 1);
      // Next.js streams the public shell before notFound(): documented 200 +
      // not-found UI/noindex, rather than an accessible institution page.
      await page.goto(origin + '/universities/ksu'); await page.getByRole('heading', { name: 'الصفحة غير موجودة', exact: true }).waitFor(); assert.ok(await page.locator('meta[name="robots"]').evaluateAll(nodes => nodes.some(n => n.getAttribute('content')?.includes('noindex')))); assert.equal((await fetch(origin + '/universities/yic')).status, 200);
      await assert.rejects(() => access(path.join(uploadDirectory, exclusiveFile.filename))); await access(path.join(uploadDirectory, sharedFile.filename));
      await context.close();
    } finally { await browser.close(); server.kill(); }
  });
  await t.test('atomic deletion preserves shared/global rows, retained IDs, credentials, history and seven mappings', async () => {
    const result = await cleanupInstitutions(db, actor, { snapshot: '0'.repeat(64), confirmed: true }); assert.equal(result.completed, true);
    assert.equal(await db.university.count(), 10); assert.equal(await db.university.count({ where: { slug: { in: ['ksu', 'kku', 'taibah'] } } }), 0);
    for (const row of originalRetained) assert.deepEqual(await db.university.findUnique({ where: { id: row.id } }), row);
    for (const row of originalMappings) assert.deepEqual(await db.courseUniversityMapping.findUnique({ where: { id: row.id } }), row);
    assert.equal((await db.university.findUniqueOrThrow({ where: { slug: 'yic' } })).institutionType, 'COLLEGE');
    const reused = await db.university.findUniqueOrThrow({ where: { id: reusedBaha!.id } }); assert.equal(reused.slug, reusedBaha!.slug); assert.equal(reused.description, reusedBaha!.description); assert.equal((await db.courseUniversityMapping.findUniqueOrThrow({ where: { categoryId: 287 } })).universityId, reused.id);
    assert.equal(await db.administrator.findUnique({ where: { id: target.id } }), null); assert.equal(await db.adminSession.findUnique({ where: { id: ambassadorActor.sessionId } }), null);
    assert.ok(await db.adminSession.findUnique({ where: { id: retainedSession.sessionId } })); assert.deepEqual(await db.universityApiKey.findUnique({ where: { id: retainedKey.id } }), retainedKey); assert.equal(await db.universityApiKey.findUnique({ where: { id: key.id } }), null);
    const remaining = await Promise.all([db.article.count({ where: { universityId: ksu.id } }), db.academicProgram.count({ where: { universityId: ksu.id } }), db.event.count({ where: { universityId: ksu.id } }), db.program.count({ where: { universityId: ksu.id } }), db.managedLink.count({ where: { universityId: ksu.id } }), db.ingestionSource.count({ where: { universityId: ksu.id } }), db.uploadedMedia.count({ where: { universityId: ksu.id } })]); assert.ok(remaining.every(n => n === 0));
    assert.equal(await db.contentSync.count({ where: { sourceId: source.id } }), 0);
    assert.equal(await db.articleEdit.count({ where: { articleId: keptArticle.id, administratorId: null } }), 1);
    assert.equal(await db.auditLog.count({ where: { entityId: keptArticle.id, administratorId: null } }), 1);
    assert.equal((await db.uploadedMedia.findUniqueOrThrow({ where: { id: sharedFile.id } })).universityId, null);
    assert.equal(await db.uploadedMedia.findUnique({ where: { id: exclusiveFile.id } }), null);
    assert.equal(await db.advertisement.count({ where: { id: { in: [shared.id, global.id] } } }), 2);
    assert.equal(await db.advertisementUniversity.count({ where: { advertisementId: shared.id, universityId: uqu.id } }), 1);
    assert.equal(await db.advertisement.count({ where: { id: { in: ['campus-demo-ksu-v1', 'campus-demo-kku-v1', 'campus-demo-taibah-v1'] } } }), 0);
  });
  await t.test('completion is idempotent; seeds cannot recreate deleted institutions; file queue retries safely', async () => {
    const completed = await cleanupPreflight(db, actor); assert.ok(completed.completed);
    assert.equal((await cleanupInstitutions(db, actor, { snapshot: '0'.repeat(64), confirmed: true })).completed, true);
    await seedCampus(db); await seedCampus(db); assert.equal(await db.university.count(), 10);
    assert.equal(await db.auditLog.count({ where: { action: 'approved_institution_cleanup_v1' } }), 1);
    const directory = await mkdtemp(path.join(tmpdir(), 'campus-cleanup-')); t.after(() => rm(directory, { recursive: true, force: true }));
    const retryFile = `${randomUUID()}.png`; await db.mediaDeletionJob.create({ data: { filename: retryFile } });
    await mkdir(path.join(directory, retryFile)); assert.equal(await removeQueuedMedia(db, directory), 0); assert.equal(await db.mediaDeletionJob.count(), 1);
    await rmdir(path.join(directory, retryFile)); await writeFile(path.join(directory, retryFile), 'test bytes'); await writeFile(path.join(directory, sharedFile.filename), 'shared bytes');
    assert.equal(await removeQueuedMedia(db, directory), 1); await assert.rejects(() => access(path.join(directory, retryFile))); await access(path.join(directory, sharedFile.filename)); assert.equal(await db.mediaDeletionJob.count(), 0);
  });
});
