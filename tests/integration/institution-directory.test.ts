import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { seedCampus } from '../../prisma/seed-campus.ts';
import { institutionPreflight, reconcileInstitutions } from '../../src/server/institution-reconciliation.ts';
import { seedCourseMappings, syncCourseCatalog, publicCourseCatalog } from '../../src/server/course-catalog-service.ts';
import { manageUniversityKey, authenticateUniversityKey } from '../../src/server/university-keys.ts';
import { VERIFIED_COURSE_MAPPINGS } from '../../src/lib/course-catalog.ts';
import { reconciliationInstitutions } from '../../src/lib/institutions.ts';
import { parseCourse, type CatalogInventory } from '../../src/server/course-source.ts';
import { ADMIN_PATH, hashPassword, csrfToken, tokenDigest } from '../../src/server/security.ts';
import { bulkOperation } from '../../src/server/bulk-service.ts';
const url = process.env.TEST_DATABASE_URL;
test('Institution directory: safe preflight, Owner reconciliation, dependencies, discovery and rollback', { skip: !url, timeout: 600000 }, async t => {
  assert.equal(new URL(url!).hostname, '127.0.0.1'); assert.match(new URL(url!).pathname, /_test$/);
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr);
  const { createDatabase } = await import('../../src/server/database-client.ts'); const db = createDatabase(url); t.after(() => db.$disconnect());
  assert.equal(await db.university.count(), 0, 'Use a fresh disposable test database.');
  const secret = randomBytes(48).toString('hex'), password = randomBytes(20).toString('base64url'), hash = await hashPassword(password);
  await seedCampus(db); await seedCourseMappings(db);
  const initial = await db.university.findMany({ orderBy: { id: 'asc' } }); assert.equal(initial.length, 10); assert.ok(initial.every(u => u.enabled && u.showInDirectory && u.institutionType === 'UNIVERSITY'));
  const ksu = initial.find(u => u.slug === 'ksu')!, uqu = initial.find(u => u.slug === 'uqu')!;
  const baha = await db.university.create({ data: { name: 'جامعة الباحة', slug: 'owner-baha', enabled: false, showInDirectory: false, description: 'تحرير محفوظ', websiteUrl: null } });
  const owner = await db.administrator.create({ data: { name: 'مدير اختبار', email: 'directory-owner@test.invalid', passwordHash: hash, role: 'owner' } });
  const editor = await db.administrator.create({ data: { name: 'محرر اختبار', email: 'directory-editor@test.invalid', passwordHash: hash, role: 'editor' } });
  const ambassador = await db.administrator.create({ data: { name: 'سفير اختبار', email: 'directory-ambassador@test.invalid', passwordHash: hash, role: 'ambassador', universityId: ksu.id } });
  const session = await db.adminSession.create({ data: { administratorId: owner.id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } }); const actor = { id: owner.id, sessionId: session.id };
  const article = await db.article.create({ data: { universityId: ksu.id, title: 'خبر مؤسسة مخفية من الدليل', status: 'published', visible: true, publishedAt: new Date() } });
  await db.event.create({ data: { universityId: ksu.id, title: 'موعد اختبار محفوظ', startsAt: new Date(), status: 'published' } });
  await db.program.create({ data: { universityId: ksu.id, title: 'فرصة تدريب محفوظة', startsAt: new Date(), status: 'published' } });
  await db.academicProgram.create({ data: { universityId: ksu.id, title: 'تخصص مستقل محفوظ', status: 'published' } });
  await db.managedLink.create({ data: { universityId: ksu.id, title: 'خدمة محفوظة', destinationUrl: 'https://ksu.edu.sa', status: 'published' } });
  const key = (await manageUniversityKey(db, owner.id, ksu.id, 'create')).secret!;
  for (const i of reconciliationInstitutions) await db.courseSourceCategory.create({ data: { id: i.categoryId, name: i.name, slug: `category-${i.categoryId}`, parent: 0, courseCount: i.categoryId === 287 ? 16 : i.categoryId === 159 ? 1 : 9, lastSyncedAt: new Date() } });
  const originalMappings = await db.courseUniversityMapping.findMany({ orderBy: { categoryId: 'asc' } });
  const makePlan = (snapshot: string) => ({ action: 'reconcile', snapshot, confirmation: 'تأكيد تسوية دليل المؤسسات', choices: reconciliationInstitutions.map(i => ({ categoryId: i.categoryId, action: i.categoryId === 287 ? 'reuse' : 'create', ...(i.categoryId === 287 ? { universityId: baha.id } : { slug: i.categoryId === 159 ? 'owner-tabuk' : 'owner-yic' }), verifiedIdentity: true, approveMapping: true })) });
  let server: ReturnType<typeof spawn> | undefined;
  try {
    await t.test('preflight is read-only, includes inactive records/dependencies and excludes secrets/personal data', async () => {
      const before = await db.auditLog.count(), report = await institutionPreflight(db, actor);
      assert.equal(await db.auditLog.count(), before); assert.equal(report.institutions.length, 11); assert.equal(report.conflicts.length, 0);
      assert.equal(report.planned[0].candidates[0], baha.id); assert.equal(report.institutions.find(u => u.id === baha.id)!.enabled, false);
      const scoped = report.institutions.find(u => u.id === ksu.id)!; assert.equal(scoped._count.administrators, 1); assert.equal(scoped._count.articles, 1); assert.equal(scoped._count.academicPrograms, 1); assert.equal(scoped._count.apiKeys, 1);
      const serialized = JSON.stringify(report); assert.doesNotMatch(serialized, /passwordHash|keyHash|tokenHash|directory-owner@|directory-ambassador@|campus_uak_/);
    });
    await t.test('duplicates, changed snapshots, occupied slugs and wrong mappings fail atomically', async () => {
      const before = await institutionPreflight(db, actor);
      const duplicate = await db.university.create({ data: { name: 'جامعة الباحة', slug: 'possible-duplicate', enabled: false } });
      const conflict = await institutionPreflight(db, actor); assert.ok(conflict.conflicts.some(c => c.includes('أكثر من سجل')));
      await assert.rejects(() => reconcileInstitutions(db, actor, makePlan(before.snapshot)), (e: { code?: string }) => e.code === 'STALE_PREFLIGHT');
      await assert.rejects(() => reconcileInstitutions(db, actor, makePlan(conflict.snapshot)), (e: { code?: string }) => e.code === 'IDENTITY_CONFLICT');
      await db.university.delete({ where: { id: duplicate.id } });
      const fresh = await institutionPreflight(db, actor), broken = makePlan(fresh.snapshot); broken.choices[2] = { ...broken.choices[2], slug: 'uqu' };
      await assert.rejects(() => reconcileInstitutions(db, actor, broken)); assert.equal(await db.university.count(), 11); assert.equal(await db.university.count({ where: { slug: 'owner-tabuk' } }), 0); assert.equal((await db.university.findUniqueOrThrow({ where: { id: ksu.id } })).showInDirectory, true);
      const bad = await db.courseUniversityMapping.create({ data: { categoryId: 310, universityId: uqu.id } });
      const wrong = await institutionPreflight(db, actor); assert.ok(wrong.conflicts.some(c => c.includes('متعارض'))); await assert.rejects(() => reconcileInstitutions(db, actor, makePlan(wrong.snapshot))); await db.courseUniversityMapping.delete({ where: { id: bad.id } });
    });
    const listener = createServer().listen(0, '127.0.0.1'); await once(listener, 'listening'); const address = listener.address(); assert.ok(address && typeof address !== 'string'); const port = address.port; await new Promise<void>(resolve => listener.close(() => resolve())); const origin = `http://localhost:${port}`;
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', String(port)], { env: { ...process.env, DATABASE_URL: url, AUTH_SECRET: secret, APP_URL: origin, NODE_ENV: 'development', TRUST_PROXY: 'false' }, stdio: 'ignore' });
    async function request(path: string, method = 'GET', payload?: unknown, headers: Record<string, string> = {}) { return fetch(origin + path, { method, redirect: 'manual', headers: { origin, 'Content-Type': 'application/json', ...headers }, ...(payload !== undefined && { body: JSON.stringify(payload) }) }); }
    for (let i = 0; i < 120; i++) { try { if ((await request('/api/universities')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
    async function login(email: string) { const r = await request(`${ADMIN_PATH}/api/auth/login`, 'POST', { email, password }); assert.equal(r.status, 200); const cookie = r.headers.get('set-cookie')!.split(';')[0]; return { cookie, 'x-csrf-token': csrfToken(tokenDigest(cookie.slice(cookie.indexOf('=') + 1), secret), secret) }; }
    const ownerAuth = await login(owner.email), editorAuth = await login(editor.email), ambassadorAuth = await login(ambassador.email);
    const sessionsBefore = await db.adminSession.findMany({ where: { administratorId: ambassador.id } });
    await t.test('HTTP denies anonymous, Editors, Ambassadors, missing CSRF and forged visibility requests', async () => {
      const endpoint = `${ADMIN_PATH}/api/institution-reconciliation`;
      assert.equal((await request(endpoint)).status, 401);
      for (const auth of [editorAuth, ambassadorAuth]) { assert.equal((await request(endpoint, 'GET', undefined, auth)).status, 403); assert.equal((await request(endpoint, 'POST', makePlan('a'.repeat(64)), auth)).status, 403); assert.equal((await request(`${ADMIN_PATH}/api/universities/${ksu.id}`, 'PATCH', { showInDirectory: false }, auth)).status, 403); }
      const report = await institutionPreflight(db, actor);
      assert.equal((await request(endpoint, 'POST', makePlan(report.snapshot), { cookie: ownerAuth.cookie })).status, 403);
      assert.equal((await request(endpoint, 'POST', { ...makePlan(report.snapshot), enabled: false }, ownerAuth)).status, 422);
      assert.equal((await request(endpoint, 'GET', undefined, ownerAuth)).status, 200);
    });
    await t.test('concurrent Owner approvals commit once, reuse inactive identity and preserve all original IDs/mappings', async () => {
      // A verified institution can already have other category aliases. Preserve them, including disabled choices.
      const alias = await db.courseUniversityMapping.create({ data: { categoryId: 9010, universityId: baha.id, enabled: false } });
      const report = await institutionPreflight(db, actor), plan = makePlan(report.snapshot);
      const results = await Promise.allSettled([reconcileInstitutions(db, actor, plan), reconcileInstitutions(db, actor, plan)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(await db.university.count(), 13);
      const reused = await db.university.findUniqueOrThrow({ where: { id: baha.id } }); assert.equal(reused.enabled, false); assert.equal(reused.slug, 'owner-baha'); assert.equal(reused.description, 'تحرير محفوظ'); assert.equal(reused.showInDirectory, true);
      const college = await db.university.findUniqueOrThrow({ where: { slug: 'owner-yic' } }); assert.equal(college.institutionType, 'COLLEGE'); assert.equal(college.name, 'كلية ينبع الصناعية'); assert.equal(college.websiteUrl, null); assert.equal(college.logoUrl, null);
      for (const original of initial) { const current = await db.university.findUniqueOrThrow({ where: { id: original.id } }); assert.equal(current.slug, original.slug); assert.equal(current.enabled, original.enabled); }
      assert.deepEqual(await db.courseUniversityMapping.findMany({ where: { categoryId: { in: VERIFIED_COURSE_MAPPINGS.map(m => m.categoryId) } }, orderBy: { categoryId: 'asc' } }), originalMappings);
      for (const slug of ['ksu', 'kku', 'taibah']) { const row = await db.university.findUniqueOrThrow({ where: { slug } }); assert.equal(row.enabled, true); assert.equal(row.showInDirectory, false); }
      assert.deepEqual(await db.adminSession.findMany({ where: { administratorId: ambassador.id } }), sessionsBefore); assert.equal((await authenticateUniversityKey(db, key)).universityId, ksu.id);
      assert.deepEqual(await db.courseUniversityMapping.findUniqueOrThrow({ where: { id: alias.id } }), alias);
      await db.courseUniversityMapping.delete({ where: { id: alias.id } }); // Only remove this synthetic fixture alias.
    });
    await t.test('hidden institution pages, scoped content, Ambassador session and n8n key remain operational', async () => {
      for (const slug of ['ksu', 'kku', 'taibah']) assert.equal((await request(`/universities/${slug}`)).status, 200);
      assert.equal((await request(`/universities/ksu/news/${article.id}`)).status, 200);
      assert.equal((await request(`${ADMIN_PATH}/api/articles`, 'GET', undefined, ambassadorAuth)).status, 200);
      const r = await request('/api/ingest/articles', 'POST', { university_slug: 'ksu', source_id: 'directory-visibility-import', source_url: 'https://ksu.edu.sa/news/test', title: 'خبر اختبار نطاق الجامعة', content_text: 'محتوى اختبار التكامل', category: 'general' }, { authorization: `Bearer ${key}` }); assert.equal(r.status, 201);
      const imported = await db.article.findFirstOrThrow({ where: { originalArticleId: 'directory-visibility-import' } }); assert.equal(imported.universityId, ksu.id); assert.equal(imported.status, 'pending_review');
      assert.equal((await db.ingestionSource.findUniqueOrThrow({ where: { key: 'ksu-rss' } })).enabled, true);
      for (const resource of ['events', 'programs', 'academic-programs', 'links', 'ads']) { const r = await request(`/api/${resource}?university=ksu`); assert.equal(r.status, 200); assert.ok((await r.json()).total >= 1); }
    });
    await t.test('Owner can explicitly activate a reused record; normal sync repairs missing IAU and maps new identities', async () => {
      const full = await db.university.findUniqueOrThrow({ where: { id: baha.id } });
      assert.equal((await request(`${ADMIN_PATH}/api/universities/${baha.id}`, 'PATCH', { name: full.name, slug: full.slug, description: full.description, enabled: true, showInDirectory: true, institutionType: full.institutionType }, ownerAuth)).status, 200);
      const ids = [...VERIFIED_COURSE_MAPPINGS.map(m => m.categoryId), 287, 159, 310, 999];
      const inventory: CatalogInventory = { categories: ids.map(id => ({ id, name: reconciliationInstitutions.find(i => i.categoryId === id)?.name || `تصنيف اختبار ${id}`, slug: `fixture-${id}`, parent: 0, count: 1 })), courses: ids.map((categoryId, index) => parseCourse({ id: categoryId === 378 ? 33899 : 700000 + index, status: 'publish', title: { rendered: categoryId === 378 ? 'فيزياء رياضية 2 &#8211; PHYS 303 (القسم الثاني)' : `شرح اختبار ${categoryId}` }, content: { rendered: '<p>شرح مفاهيم أكاديمية وتطبيقاتها العلمية.</p>' }, slug: `fixture-${categoryId}`, link: `https://estudy24.com/courses/fixture-${categoryId}/`, modified_gmt: '2026-10-28T08:05:23', 'course-category': [categoryId] })) };
      await db.courseCatalogSettings.upsert({ where: { id: 'main' }, create: { enabled: true }, update: { enabled: true } });
      assert.equal((await institutionPreflight(db, actor)).iauCourse, null);
      await syncCourseCatalog(db, { actor, inventory: async () => inventory }); const before = await db.courseExplanation.findMany({ orderBy: { wordpressId: 'asc' }, select: { id: true, wordpressId: true } });
      await syncCourseCatalog(db, { actor, inventory: async () => inventory }); assert.deepEqual(await db.courseExplanation.findMany({ orderBy: { wordpressId: 'asc' }, select: { id: true, wordpressId: true } }), before);
      assert.equal((await publicCourseCatalog(db, new URLSearchParams('university=iau'))).total, 1); assert.equal((await institutionPreflight(db, actor)).iauCourse!.sourcePublished, true);
      for (const slug of ['owner-baha', 'owner-tabuk', 'owner-yic']) assert.equal((await publicCourseCatalog(db, new URLSearchParams({ university: slug }))).total, 1);
      assert.equal((await publicCourseCatalog(db, new URLSearchParams())).total, 10);
    });
    await t.test('discovery, type/search filters and sitemap preserve independent visibility', async () => {
      const response = await request('/api/universities?page_size=100'); const data = await response.json(); assert.equal(data.total, 10); assert.ok(data.items.every((u: { slug: string }) => !['ksu', 'kku', 'taibah'].includes(u.slug)));
      const college = await (await request('/api/universities?institution_type=COLLEGE')).json(); assert.equal(college.total, 1); assert.equal(college.items[0].slug, 'owner-yic');
      assert.equal((await (await request('/api/universities?search=ينبع')).json()).total, 1); assert.equal((await (await request('/api/universities?search=سعود')).json()).total, 1); // الإمام محمد بن سعود remains discoverable.
      const courses = await (await request('/api/courses')).json(); assert.ok(courses.universities.every((u: { slug: string }) => !['ksu', 'kku', 'taibah'].includes(u.slug)));
      const sitemap = await (await request('/sitemap.xml')).text(); for (const slug of ['ksu', 'kku', 'taibah']) assert.ok(sitemap.includes(`/universities/${slug}`));
    });
    await t.test('repeat reconciliation is idempotent; distinct bulk hide/show and rollback preserve operational state', async () => {
      const fresh = await institutionPreflight(db, actor); const plan = { action: 'reconcile', snapshot: fresh.snapshot, confirmation: 'تأكيد تسوية دليل المؤسسات', choices: fresh.planned.map(i => ({ categoryId: i.categoryId, action: 'reuse', universityId: fresh.mappings.find(m => m.categoryId === i.categoryId)!.universityId, verifiedIdentity: true, approveMapping: true })) };
      await reconcileInstitutions(db, actor, plan); assert.equal(await db.university.count(), 13); assert.equal(await db.courseUniversityMapping.count(), 10);
      const preview = await bulkOperation(db, 'universities', { op: 'preview', action: 'directory_show', selection: { mode: 'ids', ids: [ksu.id], filters: {} } }, owner.id, session.id) as { token: string; confirmation: string };
      await bulkOperation(db, 'universities', { op: 'execute', token: preview.token, confirmation: preview.confirmation }, owner.id, session.id); assert.equal((await db.university.findUniqueOrThrow({ where: { id: ksu.id } })).enabled, true); assert.equal((await authenticateUniversityKey(db, key)).universityId, ksu.id);
      const report = await institutionPreflight(db, actor); await reconcileInstitutions(db, actor, { action: 'restore_directory', snapshot: report.snapshot, confirmation: 'إظهار الجامعات الثلاث في الدليل' });
      assert.equal(await db.university.count(), 13); for (const slug of ['ksu', 'kku', 'taibah']) assert.equal((await db.university.findUniqueOrThrow({ where: { slug } })).showInDirectory, true);
      assert.ok(await db.auditLog.count({ where: { entity: 'institution_directory' } }) >= 3); assert.deepEqual(await db.adminSession.findMany({ where: { administratorId: ambassador.id } }), sessionsBefore);
    });
    await t.test('repeated seeds preserve operational/visibility decisions, custom fields and all new mappings', async () => {
      await db.university.update({ where: { id: ksu.id }, data: { enabled: false, showInDirectory: false, name: 'اسم محفوظ للاختبار', websiteUrl: null } }); await seedCampus(db); await seedCampus(db);
      const row = await db.university.findUniqueOrThrow({ where: { id: ksu.id } }); assert.equal(row.enabled, false); assert.equal(row.showInDirectory, false); assert.equal(row.name, 'اسم محفوظ للاختبار'); assert.equal(row.websiteUrl, null); assert.equal(await db.courseUniversityMapping.count(), 10); assert.equal(await db.university.count(), 13);
      await db.university.update({ where: { id: ksu.id }, data: { enabled: true, name: ksu.name } });
    });
    const executable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    await t.test('mobile/desktop Owner preflight and college UI, search, visibility controls and preserved direct routes', { skip: !existsSync(executable), timeout: 180000 }, async () => {
      const browser = await chromium.launch({ executablePath: executable, headless: true });
      try { for (const width of [320, 390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 } }); const page = await context.newPage();
        await page.goto(`${origin}/universities?institution_type=COLLEGE`); await page.getByRole('heading', { name: 'كلية ينبع الصناعية', exact: true }).waitFor(); assert.equal(await page.getByRole('link', { name: 'بوابة الكلية', exact: true }).count(), 1); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.goto(`${origin}/universities/owner-yic?section=news`); await page.getByRole('heading', { name: 'أخبار الكلية وإعلاناتها', exact: true }).waitFor(); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.goto(`${origin}/universities/ksu`); await page.getByRole('heading', { name: ksu.name, exact: true }).waitFor();
        await context.addCookies([{ name: ownerAuth.cookie.split('=')[0], value: ownerAuth.cookie.split('=').slice(1).join('='), url: origin }]);
        await page.goto(`${origin}${ADMIN_PATH}/institution-reconciliation`); await page.getByRole('heading', { name: 'فحص وتسوية دليل المؤسسات', exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: 'مراجعة التسوية قبل التنفيذ' }).isDisabled(), true);
        await page.getByRole('button', { name: 'استعادة ظهور الجامعات الثلاث فقط' }).click(); await page.getByLabel('نص موافقة التسوية').fill('إظهار الجامعات الثلاث في الدليل'); await page.getByRole('button', { name: 'تأكيد التنفيذ', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'تم تنفيذ العملية كاملة' }).waitFor();
        await page.goto(`${origin}${ADMIN_PATH}/universities`); await page.getByRole('button', { name: 'إضافة جديد', exact: true }).click(); await page.getByLabel('إظهار في دليل المؤسسات التعليمية', { exact: true }).waitFor(); await page.getByText('يؤثر هذا الخيار على ظهور المؤسسة في قوائم التصفح فقط، دون تعطيل صفحتها أو محتواها أو تكاملاتها.', { exact: true }).waitFor();
        await context.close();
      } } finally { await browser.close(); }
    });
  } finally {
    if (server) { server.kill('SIGTERM'); if (server.exitCode === null) await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 10000))]); if (server.exitCode === null) server.kill('SIGKILL'); }
    // Disposable suite-owned database only. Explicit dependency order; no production connection is accepted.
    await db.adminBulkConfirmation.deleteMany(); await db.adminBulkSelection.deleteMany(); await db.articleEdit.deleteMany(); await db.ingestionLog.deleteMany(); await db.contentSync.deleteMany(); await db.article.deleteMany(); await db.academicProgram.deleteMany(); await db.event.deleteMany(); await db.program.deleteMany(); await db.managedLink.deleteMany(); await db.courseExplanation.deleteMany(); await db.courseUniversityMapping.deleteMany(); await db.courseSourceCategory.deleteMany(); await db.courseSyncRun.deleteMany(); await db.courseCatalogSettings.deleteMany(); await db.auditLog.deleteMany(); await db.administrator.deleteMany(); await db.universityApiKey.deleteMany(); await db.ingestionSource.deleteMany(); await db.advertisement.deleteMany(); await db.university.deleteMany();
  }
});
