import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { ADMIN_PATH, hashPassword, csrfToken, tokenDigest } from '../../src/server/security.ts';
import { manageUniversityKey } from '../../src/server/university-keys.ts';
const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL + HTTP + browser: academic directory, variant imports, editorial protection and university isolation', { skip: !databaseUrl, timeout: 360000 }, async t => {
  assert.match(new URL(databaseUrl!).pathname, /_test$/);
  const suffix = randomBytes(5).toString('hex'), password = randomBytes(12).toString('base64url'), secret = randomBytes(48).toString('hex');
  const listener = createServer().listen(0, '127.0.0.1'); await once(listener, 'listening'); const address = listener.address(); assert.ok(address && typeof address === 'object'); const port = address.port;
  await new Promise<void>(resolve => listener.close(() => resolve())); const origin = `http://localhost:${port}`;
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, AUTH_SECRET: secret, APP_URL: origin, NODE_ENV: 'development', TRUST_PROXY: 'true', INGEST_API_KEY: randomBytes(40).toString('hex') };
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr);
  const { createDatabase } = await import('../../src/server/database-client.ts'); const db = createDatabase(databaseUrl);
  const university = await db.university.create({ data: { slug: `degrees-${suffix}`, name: 'جامعة الدليل للاختبار', autoPublishNews: true } });
  const other = await db.university.create({ data: { slug: `other-degrees-${suffix}`, name: 'جامعة أخرى للاختبار' } });
  const source = await db.ingestionSource.create({ data: { key: `${university.slug}-degrees`, universityId: university.id, name: 'مصدر دليل توضيحي للاختبار', url: 'https://uqu.edu.sa/App/Degrees' } });
  const otherSource = await db.ingestionSource.create({ data: { key: `${other.slug}-degrees`, universityId: other.id, name: 'مصدر آخر للاختبار', url: 'https://uqu.edu.sa/App/Degrees' } });
  const owner = await db.administrator.create({ data: { email: `owner-degrees-${suffix}@test.invalid`, name: 'مدير الاختبار', passwordHash: await hashPassword(password), role: 'owner' } });
  const editor = await db.administrator.create({ data: { email: `editor-degrees-${suffix}@test.invalid`, name: 'محرر الاختبار', passwordHash: owner.passwordHash, role: 'editor' } });
  const ambassador = await db.administrator.create({ data: { email: `amb-degrees-${suffix}@test.invalid`, name: 'سفير الاختبار', passwordHash: owner.passwordHash, role: 'ambassador', universityId: university.id } });
  const key = (await manageUniversityKey(db, owner.id, university.id, 'create')).secret!, otherKey = (await manageUniversityKey(db, owner.id, other.id, 'create')).secret!;
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', String(port)], { env, stdio: 'ignore' });
  const requestIds: string[] = [], importedIds: string[] = [];
  type Auth = Record<string, string>;
  async function request(url: string, method = 'GET', body?: unknown, auth: Auth = {}) { return fetch(origin + url, { method, headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${parseInt(suffix.slice(0, 2), 16) % 200 + 1}`, ...auth }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' }); }
  async function login(email: string) { const response = await request(`${ADMIN_PATH}/api/auth/login`, 'POST', { email, password }); assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie')!.split(';')[0]; return { cookie, 'x-csrf-token': csrfToken(tokenDigest(cookie.slice(cookie.indexOf('=') + 1), secret), secret) }; }
  const ingestAuth = { Authorization: `Bearer ${key}` };
  async function ingest(body: unknown, auth: Auth = ingestAuth) { const response = await request('/api/ingest/academic-programs', 'POST', body, auth); const result = await response.json(); if (result.request_id) requestIds.push(result.request_id); return { response, result }; }
  const sample = { source_key: source.key, source_id: 'illustrative-variant-1', name: 'برنامج توضيحي للاختبار فقط', degree_name: 'دبلوم متوسط', college: 'كلية توضيحية', department: 'قسم توضيحي', campus: 'مقر توضيحي', credit_hours: 60, source_url: source.url };
  const adminBase = `${ADMIN_PATH}/api/academic-programs`;
  let manualId = '';
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) { try { if ((await request(ADMIN_PATH)).status === 307) { ready = true; break; } } catch { /* startup */ } await new Promise(resolve => setTimeout(resolve, 500)); }
    assert.ok(ready); const auth = await login(owner.email), editorAuth = await login(editor.email), ambAuth = await login(ambassador.email);
    const foreign = await db.academicProgram.create({ data: { universityId: other.id, title: 'سجل جامعة أخرى غير منشور' } });
    await t.test('authenticated manual CRUD, publication, verified fees, nullable data and Editor behavior', async () => {
      assert.equal((await request(adminBase, 'POST', { title: 'غير مصرح' })).status, 401);
      assert.equal((await request(adminBase, 'POST', { title: 'دون CSRF' }, { cookie: ambAuth.cookie })).status, 403);
      const created = await request(adminBase, 'POST', { title: 'برنامج يدوي توضيحي', status: 'published' }, ambAuth); assert.equal(created.status, 201);
      const item = await created.json(); manualId = item.id; assert.equal(item.universityId, university.id); assert.equal(item.degreeName, null); assert.equal(item.creditHours, null);
      assert.equal((await request(`${adminBase}/${manualId}`, 'PATCH', { degreeName: 'زمالة وفق المصدر', college: 'كلية يدوية', tuitionInfo: 'رسوم غير مؤكدة' }, ambAuth)).status, 422);
      assert.equal((await request(`${adminBase}/${manualId}`, 'PATCH', { degreeName: 'زمالة وفق المصدر', college: 'كلية يدوية', tuitionInfo: 'رسوم توضيحية مؤكدة للاختبار', tuitionVerified: true, tuitionSourceUrl: 'https://uqu.edu.sa/fees', studyPlanUrl: 'https://uqu.edu.sa/plan' }, ambAuth)).status, 200);
      assert.equal((await request(`${adminBase}/${foreign.id}`, 'PATCH', { title: 'مسموح للمحرر', status: 'published' }, editorAuth)).status, 200);
      assert.equal((await request(`${adminBase}/${foreign.id}`, 'DELETE', undefined, editorAuth)).status, 403);
      assert.equal((await request(`${adminBase}/${manualId}`, 'PATCH', { status: 'unpublished' }, ambAuth)).status, 200);
      assert.equal((await (await request(`/api/academic-programs?university=${university.slug}`)).json()).total, 0);
      assert.equal((await request(`${adminBase}/${manualId}`, 'PATCH', { status: 'published' }, ambAuth)).status, 200);
      assert.ok(await db.auditLog.count({ where: { administratorId: ambassador.id, entity: 'academic-programs', details: { path: ['universityId'], equals: university.id } } }));
    });
    await t.test('Ambassadors cannot read, update, delete, reassign or bulk-modify foreign records', async () => {
      for (const method of ['GET', 'PATCH', 'DELETE']) assert.equal((await request(`${adminBase}/${foreign.id}`, method, method === 'PATCH' ? { title: 'محاولة' } : undefined, ambAuth)).status, 404);
      for (const payload of [{ universityId: other.id }, { universityId: null }, { university_slug: other.slug }, { university: { connect: { id: other.id } } }]) assert.equal((await request(adminBase, 'POST', { title: 'محاولة', ...payload }, ambAuth)).status, 403);
      assert.equal((await request(`${adminBase}/${manualId}`, 'PATCH', { universityId: other.id }, ambAuth)).status, 403);
      assert.equal((await request(`${adminBase}?university=${other.slug}`, 'GET', undefined, ambAuth)).status, 403);
      assert.equal((await request(adminBase, 'POST', { ids: [manualId, foreign.id] }, ambAuth)).status, 422);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/bulk-delete`, 'POST', { ids: [manualId, foreign.id] }, ambAuth)).status, 409);
      const list = await (await request(adminBase, 'GET', undefined, ambAuth)).json(); assert.ok(list.items.every((item: { universityId: string }) => item.universityId === university.id));
      assert.equal((await db.academicProgram.findUniqueOrThrow({ where: { id: foreign.id } })).deletedAt, null);
    });
    await t.test('scoped authentication, single/batch validation, limits and foreign batches are enforced', async () => {
      assert.equal((await ingest(sample, {})).response.status, 401);
      assert.equal((await ingest(sample, { Authorization: `Bearer ${env.INGEST_API_KEY}` })).response.status, 401);
      assert.equal((await ingest(sample, { Authorization: `Bearer ${otherKey}` })).response.status, 403);
      assert.equal((await ingest({ ...sample, universityId: other.id })).response.status, 403);
      assert.equal((await ingest({ items: [sample, { ...sample, university_slug: other.slug }] })).response.status, 403);
      assert.equal(await db.academicProgram.count({ where: { sourceId: source.id } }), 0);
      assert.equal((await ingest({ items: [] })).response.status, 422);
      assert.equal((await ingest({ items: Array.from({ length: 51 }, () => sample) })).response.status, 422);
      for (const patch of [{ name: '' }, { credit_hours: -1 }, { tuition_info: 'غير مؤكد' }, { study_plan_url: 'javascript:alert(1)' }, { status: 'published' }, { source_key: 'unknown-academic-source' }]) assert.equal((await ingest({ ...sample, ...patch })).response.status, 422);
      assert.equal((await ingest({ ...sample, source_url: 'https://evil.invalid/program' })).response.status, 422);
      assert.equal((await ingest({ ...sample, name: 'x'.repeat(1100000) })).response.status, 413);
    });
    await t.test('variants survive equal names, repeated and concurrent imports; publication is always reviewed', async () => {
      const { response, result } = await ingest({ items: [sample, { ...sample, source_id: 'illustrative-variant-2', degree_name: 'ماجستير كما في المصدر' }, { ...sample, source_id: 'illustrative-variant-3', campus: 'مقر مختلف' }, { source_key: source.key, source_id: 'incomplete-but-valid', name: 'سجل توضيحي ناقص الحقول الاختيارية', source_url: source.url }] });
      assert.equal(response.status, 200); assert.equal(result.counts.created, 4); importedIds.push(...result.results.map((item: { resource_id: string }) => item.resource_id));
      assert.equal(await db.academicProgram.count({ where: { sourceId: source.id, status: 'pending_review' } }), 4);
      const before = await db.academicProgram.findUniqueOrThrow({ where: { id: importedIds[0] } });
      const repeated = await ingest(sample); assert.equal(repeated.result.counts.unchanged, 1);
      assert.ok((await db.academicProgram.findUniqueOrThrow({ where: { id: importedIds[0] } })).lastSyncedAt! >= before.lastSyncedAt!);
      const concurrent = await Promise.all([ingest({ ...sample, source_id: 'concurrent-variant' }), ingest({ ...sample, source_id: 'concurrent-variant' })]); assert.ok(concurrent.every(item => [200, 201].includes(item.response.status)));
      assert.equal(await db.academicProgram.count({ where: { sourceId: source.id, externalId: 'concurrent-variant' } }), 1);
      const partial = await ingest({ items: [sample, { ...sample, name: '' }] }); assert.equal(partial.response.status, 207); assert.equal(partial.result.counts.rejected, 1); assert.equal(partial.result.counts.unchanged, 1);
      const minimal = await db.academicProgram.findUniqueOrThrow({ where: { id: importedIds[3] } }); assert.equal(minimal.degreeName, null); assert.equal(minimal.creditHours, null); assert.equal(minimal.tuitionInfo, null);
    });
    await t.test('manual corrections, null overrides, hidden and deleted records survive later synchronization', async () => {
      const id = importedIds[0];
      assert.equal((await request(`${adminBase}/${id}`, 'PATCH', { title: 'تصحيح السفير المحفوظ', degreeName: 'درجة محررة', creditHours: null, tuitionInfo: 'رسوم يدوية مؤكدة', tuitionVerified: true, tuitionSourceUrl: 'https://uqu.edu.sa/manual-fees', status: 'published' }, ambAuth)).status, 200);
      await ingest({ ...sample, name: 'تحديث المصدر', credit_hours: 90, tuition_info: null, tuition_verified: false });
      let stored = await db.academicProgram.findUniqueOrThrow({ where: { id } }); assert.equal(stored.title, 'تصحيح السفير المحفوظ'); assert.equal(stored.degreeName, 'درجة محررة'); assert.equal(stored.creditHours, null); assert.equal(stored.tuitionInfo, 'رسوم يدوية مؤكدة'); assert.equal(stored.status, 'published');
      assert.equal((await request(`${adminBase}/${id}`, 'PATCH', { status: 'hidden', visible: false }, ambAuth)).status, 200); await ingest(sample); stored = await db.academicProgram.findUniqueOrThrow({ where: { id } }); assert.equal(stored.status, 'hidden'); assert.equal(stored.visible, false);
      assert.equal((await request(`${adminBase}/${importedIds[1]}`, 'DELETE', undefined, ambAuth)).status, 200);
      await ingest({ ...sample, source_id: 'illustrative-variant-2', degree_name: 'دكتوراه جديدة', name: 'لا تعد نشر المحذوف' });
      stored = await db.academicProgram.findUniqueOrThrow({ where: { id: importedIds[1] } }); assert.ok(stored.deletedAt); assert.equal(stored.degreeName, 'ماجستير كما في المصدر');
      assert.equal((await request(`${adminBase}/${importedIds[2]}`, 'PATCH', { status: 'published' }, ambAuth)).status, 200);
      const count = await db.academicProgram.count({ where: { sourceId: source.id } }); await ingest(sample); assert.equal(await db.academicProgram.count({ where: { sourceId: source.id } }), count, 'smaller fetches do not remove absent programs');
      assert.equal((await request(`${ADMIN_PATH}/api/sources/${source.id}`, 'PATCH', { key: source.key, name: source.name, universityId: other.id, url: source.url }, auth)).status, 409);
      assert.equal((await request(`${adminBase}/${manualId}`, 'PATCH', { universityId: other.id }, auth)).status, 422);
    });
    await t.test('public search, exact degree/college/department filters, pagination and private-field exclusion', async () => {
      await db.academicProgram.createMany({ data: Array.from({ length: 15 }, (_, index) => ({ universityId: university.id, title: `فهرس توضيحي ${index}`, degreeName: 'درجة فهرسة توضيحية', college: 'كلية الفهرسة', department: index % 2 ? 'قسم أول' : 'قسم ثان', status: 'published' as const })) });
      const filtered = await (await request(`/api/academic-programs?university=${university.slug}&search=${encodeURIComponent('فهرس')}&degree=${encodeURIComponent('درجة فهرسة توضيحية')}&college=${encodeURIComponent('كلية الفهرسة')}&page_size=5&page=2`)).json();
      assert.equal(filtered.total, 15); assert.equal(filtered.items.length, 5); assert.equal(filtered.pages, 3);
      const department = await (await request(`/api/academic-programs?university=${university.slug}&department=${encodeURIComponent('قسم أول')}`)).json(); assert.equal(department.total, 7);
      assert.doesNotMatch(JSON.stringify(filtered), /sourceSnapshot|editedFields|fingerprint|passwordHash|keyHash|externalId/);
      assert.equal((await request('/api/academic-programs')).status, 422); assert.equal((await request(`/api/academic-programs?university=${university.slug}&scope=homepage`)).status, 422);
      const foreignPublic = await (await request(`/api/academic-programs?university=${other.slug}`)).json(); assert.equal(foreignPublic.total, 1);
      assert.doesNotMatch(await (await request('/')).text(), /فهرس توضيحي|تصحيح السفير المحفوظ/);
      assert.equal((await request(`${adminBase}?degree=${encodeURIComponent('درجة فهرسة توضيحية')}&page_size=5`, 'GET', undefined, ambAuth)).status, 200);
    });
    const executable = process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    await t.test('desktop/mobile nine tabs, incomplete fields, verified plans, filters, empty state and Ambassador creation form', { skip: !existsSync(executable) }, async () => {
      const browser = await chromium.launch({ executablePath: executable, headless: true });
      try {
        for (const mobile of [false, true]) {
          const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile }); const page = await context.newPage();
          await page.goto(`${origin}/universities/${university.slug}?section=academic-programs`);
          await page.getByRole('heading', { name: 'التخصصات والبرامج الأكاديمية', exact: true }).waitFor();
          const tabs = page.getByRole('navigation', { name: 'أقسام الجامعة' }).locator('a'); assert.equal(await tabs.count(), 10);
          assert.deepEqual((await tabs.evaluateAll(nodes => nodes.map(node => new URL((node as HTMLAnchorElement).href).searchParams.get('section')))).slice(0, 8), ['all', 'news', 'programs', 'events', 'calendar', 'schedules', 'services', 'links']);
          await page.getByLabel('اسم البرنامج', { exact: true }).fill('برنامج يدوي توضيحي'); await page.getByRole('button', { name: 'بحث وتصفية', exact: true }).click(); await page.getByRole('heading', { name: 'برنامج يدوي توضيحي', exact: true }).waitFor();
          assert.equal(await page.getByRole('link', { name: 'الخطة الدراسية', exact: true }).getAttribute('href'), 'https://uqu.edu.sa/plan'); assert.equal(await page.getByRole('link', { name: 'الخطة الدراسية', exact: true }).getAttribute('rel'), 'noopener noreferrer');
          await page.getByLabel('اسم البرنامج', { exact: true }).fill('لا توجد نتيجة كهذه'); await page.getByRole('button', { name: 'بحث وتصفية', exact: true }).click(); await page.getByRole('heading', { name: 'لا توجد برامج أكاديمية منشورة مطابقة' }).waitFor(); assert.equal(await page.getByRole('link', { name: 'الخطة الدراسية', exact: true }).count(), 0);
          const [name, value] = ambAuth.cookie.split('='); await context.addCookies([{ name, value, url: origin + ADMIN_PATH }]); await page.goto(origin + `${ADMIN_PATH}/academic-programs`); await page.getByRole('button', { name: 'إضافة جديد', exact: true }).click(); assert.equal(await page.locator('#field-universityId').count(), 0);
          await page.locator('#field-title').fill(`برنامج متصفح توضيحي ${mobile ? 'هاتف' : 'مكتب'}`); assert.equal(await page.locator('#field-creditHours').inputValue(), '');
          const save = page.waitForResponse(response => response.url().endsWith('/api/academic-programs') && response.request().method() === 'POST'); await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click(); assert.equal((await save).status(), 201);
          assert.doesNotMatch(await page.locator('main').innerText(), /[٠-٩]/); await context.close();
        }
        const ownerContext = await browser.newContext(); const [name, value] = auth.cookie.split('='); await ownerContext.addCookies([{ name, value, url: origin + ADMIN_PATH }]);
        const ownerPage = await ownerContext.newPage(); await ownerPage.goto(origin + `${ADMIN_PATH}/academic-programs?search=${encodeURIComponent('برنامج يدوي توضيحي')}`);
        await ownerPage.getByRole('button', { name: 'تعديل السجل', exact: true }).click(); assert.ok(await ownerPage.locator('#field-universityId').isDisabled());
        await ownerPage.locator('#field-department').fill('قسم مُراجع من المتصفح');
        const changed = ownerPage.waitForResponse(response => response.url().endsWith(`/api/academic-programs/${manualId}`) && response.request().method() === 'PATCH');
        await ownerPage.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click(); assert.equal((await changed).status(), 200); await ownerContext.close();
      } finally { await browser.close(); }
    });
    await t.test('private documentation contains the new contract and OpenAPI; existing workflow exports are untouched', async () => {
      const docs = await request(`${ADMIN_PATH}/api-docs`, 'GET', undefined, auth); assert.match(await docs.text(), /API التخصصات والبرامج الأكاديمية/);
      const specification = await (await request(`${ADMIN_PATH}/api/integrations/openapi`, 'GET', undefined, auth)).json(); assert.ok(specification.paths['/api/ingest/academic-programs']);
      assert.equal((await request(`${ADMIN_PATH}/api/integrations/openapi`, 'GET', undefined, ambAuth)).status, 403);
      assert.equal(await db.program.count({ where: { universityId: university.id } }), 0, 'training programs are not academic degree records');
      assert.equal(await db.article.count({ where: { universityId: university.id } }), 0);
    });
  } finally {
    server.kill(); if (server.exitCode === null) await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 10000))]); if (server.exitCode === null) server.kill('SIGKILL');
    await db.ingestionLog.deleteMany({ where: { OR: [{ requestId: { in: requestIds } }, { sourceId: { in: [source.id, otherSource.id] } }] } });
    await db.academicProgram.deleteMany({ where: { universityId: { in: [university.id, other.id] } } }); await db.universityApiKey.deleteMany({ where: { universityId: { in: [university.id, other.id] } } }); await db.ingestionSource.deleteMany({ where: { id: { in: [source.id, otherSource.id] } } });
    const actors = [owner.id, editor.id, ambassador.id]; await db.auditLog.deleteMany({ where: { administratorId: { in: actors } } }); await db.administrator.deleteMany({ where: { id: { in: actors } } }); await db.university.deleteMany({ where: { id: { in: [university.id, other.id] } } }); await db.$disconnect();
  }
});
