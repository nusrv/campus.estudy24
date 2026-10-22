import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdir, readdir, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ADMIN_PATH, hashPassword, csrfToken, tokenDigest } from '../../src/server/security.ts';
import { manageUniversityKey } from '../../src/server/university-keys.ts';
import { lockAdministrators } from '../../src/server/administrator-service.ts';
const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL + HTTP + browser: ambassador account lifecycle and strict university isolation', { skip: !databaseUrl, timeout: 300000 }, async t => {
  assert.match(new URL(databaseUrl!).pathname, /_test$/);
  const suffix = randomBytes(5).toString('hex'), password = randomBytes(12).toString('base64url'), secret = randomBytes(48).toString('hex');
  const listener = createServer().listen(0, '127.0.0.1'); await once(listener, 'listening'); const address = listener.address(); assert.ok(address && typeof address === 'object'); const port = address.port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const origin = `http://localhost:${port}`, uploadDir = path.resolve(`.npm-logs/ambassador-uploads-${suffix}`);
  await mkdir(uploadDir, { recursive: true });
  // Give this loopback-only test client its own rate-limit identity; other suites test fail-closed proxy handling.
  const testClient = `192.0.2.${parseInt(suffix.slice(0, 2), 16) % 200 + 1}`;
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, AUTH_SECRET: secret, APP_URL: origin, NODE_ENV: 'development', TRUST_PROXY: 'true', UPLOAD_DIR: uploadDir };
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr);
  const { createDatabase } = await import('../../src/server/database-client.ts'); const db = createDatabase(databaseUrl);
  const university = await db.university.create({ data: { slug: `amb-${suffix}`, name: 'جامعة السفير للاختبار' } });
  const other = await db.university.create({ data: { slug: `other-amb-${suffix}`, name: 'جامعة أخرى خاصة بالاختبار' } });
  await db.ingestionSource.create({ data: { key: `${university.slug}-rss`, name: 'مصدر اختبار السفير', url: 'https://example.edu/rss', universityId: university.id } });
  const universities = [university.id, other.id], accounts: string[] = [];
  const owner = await db.administrator.create({ data: { email: `owner-amb-${suffix}@test.invalid`, name: 'مدير المنصة', role: 'owner', passwordHash: await hashPassword(password) } }); accounts.push(owner.id);
  const editor = await db.administrator.create({ data: { email: `editor-amb-${suffix}@test.invalid`, name: 'محرر', role: 'editor', passwordHash: owner.passwordHash } }); accounts.push(editor.id);
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', String(port)], { env, stdio: 'ignore' });
  type Auth = Record<string, string>;
  async function request(url: string, method = 'GET', body?: unknown, auth: Auth = {}) {
    return fetch(origin + url, { method, headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': testClient, ...auth }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
  }
  async function login(email: string) {
    const response = await request(`${ADMIN_PATH}/api/auth/login`, 'POST', { email, password }); assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    return { cookie, 'x-csrf-token': csrfToken(tokenDigest(cookie.slice(cookie.indexOf('=') + 1), secret), secret) };
  }
  async function createAccount(auth: Auth, role: string, universityId?: string) {
    const response = await request(`${ADMIN_PATH}/api/administrators`, 'POST', { email: `${role}-${randomBytes(5).toString('hex')}@test.invalid`, name: 'حساب اختبار', password, confirmation: password, role, ...(universityId && { universityId }) }, auth);
    assert.equal(response.status, 201); const item = await response.json(); accounts.push(item.id); assert.equal(item.passwordHash, undefined); return item as { id: string; email: string; name: string; role: string; universityId: string | null };
  }
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) { try { if ((await request(ADMIN_PATH)).status === 307) { ready = true; break; } } catch { /* startup */ } await new Promise(resolve => setTimeout(resolve, 500)); }
    assert.ok(ready); const auth = await login(owner.email), editorAuth = await login(editor.email);
    const create = { email: `invalid-${suffix}@test.invalid`, name: 'سفير', password, confirmation: password, role: 'ambassador' };
    await t.test('only owners manage all roles; ambassadors require exactly one existing active university', async () => {
      assert.equal((await request(`${ADMIN_PATH}/api/administrators`, 'POST', create)).status, 401);
      assert.equal((await request(`${ADMIN_PATH}/api/administrators`, 'POST', create, { cookie: auth.cookie })).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/administrators`, 'POST', { ...create, universityId: university.id }, editorAuth)).status, 403);
      for (const universityId of [undefined, null, 'missing-university']) assert.equal((await request(`${ADMIN_PATH}/api/administrators`, 'POST', { ...create, universityId }, auth)).status, 422);
      const secondOwner = await createAccount(auth, 'owner'); assert.equal(secondOwner.universityId, null);
      assert.equal((await request(`${ADMIN_PATH}/api/administrators/${secondOwner.id}`, 'PATCH', { email: secondOwner.email, name: secondOwner.name, active: true, role: 'editor', universityId: null }, auth)).status, 200);
      assert.equal((await request(`${ADMIN_PATH}/api/administrators/${owner.id}`, 'PATCH', { email: owner.email, name: owner.name, active: true, role: 'editor' }, auth)).status, 409);
      // Enforced in PostgreSQL even if application validation is bypassed.
      await assert.rejects(db.administrator.create({ data: { email: `db-invalid-${suffix}@test.invalid`, name: 'Invalid', role: 'ambassador', passwordHash: owner.passwordHash } }));
      await assert.rejects(db.administrator.update({ where: { id: editor.id }, data: { universityId: university.id } }));
    });
    const ambassador = await createAccount(auth, 'ambassador', university.id), second = await createAccount(auth, 'ambassador', university.id);
    let ambAuth = await login(ambassador.email); const secondAuth = await login(second.email);
    const foreign = await db.article.create({ data: { universityId: other.id, title: 'محتوى جامعة أخرى سري', status: 'pending_review' } });
    const foreignEvent = await db.event.create({ data: { universityId: other.id, title: 'فعالية جامعة أخرى', startsAt: new Date() } });
    const foreignProgram = await db.program.create({ data: { universityId: other.id, title: 'برنامج جامعة أخرى', startsAt: new Date() } });
    const foreignLink = await db.managedLink.create({ data: { universityId: other.id, title: 'رابط جامعة أخرى', destinationUrl: 'https://example.edu' } });
    const globalLink = await db.managedLink.create({ data: { title: 'رابط عام سري', destinationUrl: 'https://example.edu' } });
    let ownId = '';
    await t.test('allowed creates bind university server-side; foreign reads/writes, forged IDs and nested associations fail', async () => {
      const response = await request(`${ADMIN_PATH}/api/articles`, 'POST', { title: 'خبر السفير', status: 'published' }, ambAuth); assert.equal(response.status, 201);
      const own = await response.json(); ownId = own.id; assert.equal(own.universityId, university.id); assert.equal(own.status, 'published');
      for (const input of [{ universityId: other.id }, { universityId: null }, { university_slug: other.slug }, { university: { connect: { id: other.id } } }, { universityIds: [other.id] }]) assert.equal((await request(`${ADMIN_PATH}/api/articles`, 'POST', { title: 'مزوّر', ...input }, ambAuth)).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${foreign.id}`, 'GET', undefined, ambAuth)).status, 404);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${foreign.id}`, 'PATCH', { title: 'محاولة' }, ambAuth)).status, 404);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${foreign.id}`, 'DELETE', undefined, ambAuth)).status, 404);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${ownId}`, 'PATCH', { universityId: other.id }, ambAuth)).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${ownId}`, 'PATCH', { media: { create: { url: 'https://example.edu/private.jpg' } } }, ambAuth)).status, 422);
      for (const [resource, id] of [['events', foreignEvent.id], ['programs', foreignProgram.id], ['links', foreignLink.id], ['links', globalLink.id]]) {
        assert.equal((await request(`${ADMIN_PATH}/api/${resource}/${id}`, 'PATCH', { title: 'محاولة' }, ambAuth)).status, 404);
        assert.equal((await request(`${ADMIN_PATH}/api/${resource}/${id}`, 'DELETE', undefined, ambAuth)).status, 404);
      }
      for (const [resource, payload] of [['events', { startsAt: new Date().toISOString(), kind: 'academic_date' }], ['programs', { startsAt: new Date().toISOString() }], ['links', { destinationUrl: 'https://example.edu/service', kind: 'student_service' }]] as const) {
        const created = await request(`${ADMIN_PATH}/api/${resource}`, 'POST', { title: `محتوى ${resource}`, status: 'published', ...payload }, ambAuth); assert.equal(created.status, 201); assert.equal((await created.json()).universityId, university.id);
        const list = await (await request(`${ADMIN_PATH}/api/${resource}`, 'GET', undefined, ambAuth)).json(); assert.equal(list.total, 1); assert.equal(list.items[0].universityId, university.id);
        const id = list.items[0].id;
        assert.equal((await request(`${ADMIN_PATH}/api/${resource}/${id}`, 'PATCH', { title: 'تعديل السفير', status: 'unpublished', ...payload }, ambAuth)).status, 200);
        assert.equal((await request(`${ADMIN_PATH}/api/${resource}/${id}`, 'DELETE', undefined, ambAuth)).status, 200);
      }
      assert.equal((await request(`${ADMIN_PATH}/api/articles?university=${other.slug}`, 'GET', undefined, ambAuth)).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/articles?universityId=${other.id}`, 'GET', undefined, ambAuth)).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${ownId}`, 'PATCH', { status: 'hidden' }, { cookie: ambAuth.cookie })).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${foreign.id}`, 'PATCH', { title: 'مسموح للمحرر' }, editorAuth)).status, 200);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${ownId}`, 'DELETE', undefined, editorAuth)).status, 403);
    });
    await t.test('all global, advertising, security and integration endpoints deny ambassadors', async () => {
      for (const resource of ['universities', 'ads', 'platform_posts', 'sources', 'categories', 'logs', 'audit', 'administrators']) {
        for (const method of ['GET', 'POST']) assert.equal((await request(`${ADMIN_PATH}/api/${resource}`, method, method === 'POST' ? {} : undefined, ambAuth)).status, 403, `${method} ${resource}`);
        for (const method of ['PATCH', 'DELETE']) assert.equal((await request(`${ADMIN_PATH}/api/${resource}/${foreign.id}`, method, method === 'PATCH' ? {} : undefined, ambAuth)).status, 403, `${method} ${resource}`);
      }
      assert.equal((await request(`${ADMIN_PATH}/api/settings`, 'GET', undefined, ambAuth)).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/settings`, 'PATCH', { visitorStartingValue: 0 }, ambAuth)).status, 403);
      for (const url of ['/api/integrations/openapi', '/api/integrations/n8n', `/api/universities/${university.id}/keys`]) assert.equal((await request(ADMIN_PATH + url, 'GET', undefined, ambAuth)).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/universities/${university.id}/keys`, 'POST', { action: 'create' }, ambAuth)).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/administrators/${ambassador.id}/reset`, 'POST', {}, ambAuth)).status, 403);
      for (const section of ['ads', 'universities', 'administrators', 'settings', 'platform-settings', 'platform_posts', 'audit', 'sources']) {
        const page = await request(`${ADMIN_PATH}/${section}`, 'GET', undefined, ambAuth); assert.equal(page.status, 404); assert.doesNotMatch(await page.text(), new RegExp(other.name));
      }
      for (const section of ['api-docs', `universities/${other.id}/integration`]) { const page = await request(`${ADMIN_PATH}/${section}`, 'GET', undefined, ambAuth); assert.doesNotMatch(await page.text(), /Campus ingestion API|University-scoped API|example_campus/); }
    });
    await t.test('mixed-university bulk deletion rolls back entirely; own deletion survives reimport and manual decisions remain', async () => {
      const key = (await manageUniversityKey(db, owner.id, university.id, 'create')).secret!;
      const news = { university_slug: university.slug, source_id: 'ambassador-import', source_url: 'https://example.edu/news/1', title: 'خبر مستورد ينتظر المراجعة' };
      const ingest = { Authorization: `Bearer ${key}` };
      const imported = await (await request('/api/ingest/articles', 'POST', news, ingest)).json(); const importedId = imported.results[0].article_id;
      const pending = await (await request(`${ADMIN_PATH}/api/articles?status=pending_review`, 'GET', undefined, ambAuth)).json(); assert.equal(pending.total, 1); assert.equal(pending.items[0].id, importedId);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${importedId}`, 'PATCH', { title: 'تحرير السفير المحفوظ', status: 'published' }, ambAuth)).status, 200);
      await request('/api/ingest/articles', 'POST', { ...news, title: 'عنوان المصدر الجديد' }, ingest);
      assert.equal((await db.article.findUniqueOrThrow({ where: { id: importedId } })).title, 'تحرير السفير المحفوظ');
      const count = await db.auditLog.count({ where: { administratorId: ambassador.id } });
      assert.equal((await request(`${ADMIN_PATH}/api/articles/bulk-delete`, 'POST', { ids: [ownId, foreign.id] }, ambAuth)).status, 409);
      assert.equal((await db.article.findUniqueOrThrow({ where: { id: ownId } })).deletedAt, null); assert.equal(await db.auditLog.count({ where: { administratorId: ambassador.id } }), count);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/bulk-delete`, 'POST', { ids: [ownId, importedId] }, ambAuth)).status, 200);
      await request('/api/ingest/articles', 'POST', news, ingest);
      const stored = await db.article.findUniqueOrThrow({ where: { id: importedId } }); assert.ok(stored.deletedAt); assert.equal(stored.title, 'تحرير السفير المحفوظ');
      assert.equal(await db.article.count({ where: { universityId: university.id, originalArticleId: news.source_id } }), 1);
      assert.ok(await db.auditLog.count({ where: { administratorId: ambassador.id, entity: 'articles', entityId: importedId, details: { path: ['universityId'], equals: university.id } } }));
    });
    await t.test('uploads are university-scoped; foreign private files and cross-university attachment injection fail', async () => {
      const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJXkAAAAASUVORK5CYII=', 'base64');
      const form = new FormData(); form.append('file', new File([bytes], 'image.png', { type: 'image/png' }));
      const uploaded = await fetch(origin + `${ADMIN_PATH}/api/uploads`, { method: 'POST', headers: { origin, ...ambAuth }, body: form }); assert.equal(uploaded.status, 201); const file = await uploaded.json();
      assert.equal((await db.uploadedMedia.findUniqueOrThrow({ where: { id: file.id } })).universityId, university.id);
      assert.equal((await request(`${ADMIN_PATH}/api/media/${file.id}`, 'GET', undefined, secondAuth)).status, 200);
      const foreignMedia = await db.uploadedMedia.create({ data: { filename: `${randomBytes(16).toString('hex')}.png`, originalName: 'private.png', mimeType: 'image/png', size: 1, universityId: other.id } });
      assert.equal((await request(`${ADMIN_PATH}/api/media/${foreignMedia.id}`, 'GET', undefined, ambAuth)).status, 404);
      assert.equal((await request(`${ADMIN_PATH}/api/articles`, 'POST', { title: 'صورة غير مصرّحة', imageUrls: [`/media/${foreignMedia.id}`] }, ambAuth)).status, 404);
      assert.equal((await request(`${ADMIN_PATH}/api/articles`, 'POST', { title: 'صورة مصرحّة', imageUrls: [file.url] }, ambAuth)).status, 201);
    });
    const executable = process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    await t.test('desktop/mobile dashboard, safe navigation, auto-assigned content form and owner role controls', { skip: !existsSync(executable) }, async () => {
      const browser = await chromium.launch({ executablePath: executable, headless: true });
      try {
        for (const mobile of [false, true]) {
          const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile });
          const [name, value] = ambAuth.cookie.split('='); await context.addCookies([{ name, value, url: origin + ADMIN_PATH }]); const page = await context.newPage();
          await page.goto(origin + ADMIN_PATH); await page.getByRole('heading', { name: `لوحة سفير ${university.name}` }).waitFor();
          assert.doesNotMatch(await page.locator('main').innerText(), new RegExp(other.name)); assert.doesNotMatch(await page.locator('main').innerText(), /[٠-٩]/);
          if (mobile) await page.getByRole('button', { name: 'قائمة الإدارة', exact: true }).click();
          assert.equal(await page.locator('aside a').count(), 6);
          await page.goto(origin + `${ADMIN_PATH}/articles`); await page.getByRole('button', { name: /إضافة جديد/ }).click();
          assert.equal(await page.locator('#field-universityId').count(), 0); await page.locator('#field-title').fill(`خبر من المتصفح ${mobile ? 'هاتف' : 'مكتب'}`);
          const save = page.waitForResponse(r => r.url().endsWith('/api/articles') && r.request().method() === 'POST'); await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click(); assert.equal((await save).status(), 201);
          await context.close();
        }
        const context = await browser.newContext(); const [name, value] = auth.cookie.split('='); await context.addCookies([{ name, value, url: origin + ADMIN_PATH }]); const page = await context.newPage(); await page.goto(origin + `${ADMIN_PATH}/administrators`);
        await page.locator('select[name="role"]').selectOption('ambassador'); assert.ok(await page.locator('select[name="universityId"]').isVisible()); assert.equal(await page.locator('select[name="universityId"]').getAttribute('required'), ''); await context.close();
      } finally { await browser.close(); }
    });
    await t.test('a content write queued behind session revocation cannot commit using a stale authorization snapshot', async () => {
      let locked!: () => void, release!: () => void;
      const acquired = new Promise<void>(resolve => { locked = resolve; }), released = new Promise<void>(resolve => { release = resolve; });
      const revoke = db.$transaction(async tx => { await lockAdministrators(tx); locked(); await released; await tx.adminSession.deleteMany({ where: { administratorId: ambassador.id } }); }, { timeout: 20000 });
      await acquired;
      const writing = request(`${ADMIN_PATH}/api/articles`, 'POST', { title: 'محاولة بجلسة أُبطلت أثناء الانتظار' }, ambAuth);
      try {
        let waiting = false;
        for (let i = 0; i < 50; i++) {
          const rows = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%pg_advisory_xact_lock%'`;
          if (Number(rows[0].count) > 0) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.ok(waiting, 'Content write must reach the transaction lock before revocation.');
      } finally { release(); await revoke; }
      assert.ok([401, 403, 409, 503].includes((await writing).status));
      assert.equal(await db.article.count({ where: { universityId: university.id, title: 'محاولة بجلسة أُبطلت أثناء الانتظار' } }), 0);
    });
    await t.test('reassignment, disabling, resets and disabled universities revoke or reject sessions', async () => {
      assert.equal((await request(`${ADMIN_PATH}/api/administrators/${ambassador.id}/reset`, 'POST', {}, auth)).status, 200);
      assert.equal((await request(`${ADMIN_PATH}/api/articles`, 'GET', undefined, ambAuth)).status, 401);
      const update = { email: ambassador.email, name: ambassador.name, role: 'ambassador', universityId: other.id, active: true };
      assert.equal((await request(`${ADMIN_PATH}/api/administrators/${ambassador.id}`, 'PATCH', update, auth)).status, 200);
      assert.equal(await db.adminSession.count({ where: { administratorId: ambassador.id } }), 0);
      assert.equal((await request(`${ADMIN_PATH}/api/articles`, 'GET', undefined, ambAuth)).status, 401);
      ambAuth = await login(ambassador.email);
      const list = await (await request(`${ADMIN_PATH}/api/articles`, 'GET', undefined, ambAuth)).json(); assert.ok(list.items.every((a: { universityId: string }) => a.universityId === other.id));
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${ownId}`, 'PATCH', { title: 'جامعة قديمة' }, ambAuth)).status, 404);
      assert.equal((await request(`${ADMIN_PATH}/api/administrators/${ambassador.id}`, 'PATCH', { ...update, active: false }, auth)).status, 200);
      assert.equal((await request(`${ADMIN_PATH}/api/articles`, 'GET', undefined, ambAuth)).status, 401);
      assert.equal((await request(`${ADMIN_PATH}/api/auth/login`, 'POST', { email: ambassador.email, password })).status, 401);
      assert.equal((await request(`${ADMIN_PATH}/api/universities/${university.id}`, 'DELETE', undefined, auth)).status, 200);
      assert.equal(await db.adminSession.count({ where: { administratorId: second.id } }), 0);
      assert.equal((await request(`${ADMIN_PATH}/api/articles`, 'GET', undefined, secondAuth)).status, 401);
      assert.equal((await request(`${ADMIN_PATH}/api/auth/login`, 'POST', { email: second.email, password })).status, 401);
      assert.equal((await request(`${ADMIN_PATH}/api/administrators/${second.id}`, 'PATCH', { email: second.email, name: second.name, active: false }, auth)).status, 200);
    });
    assert.doesNotMatch(await (await request(`${ADMIN_PATH}/api/administrators`, 'GET', undefined, auth)).text(), /passwordHash|tokenHash/);
    assert.equal((await request(`/universities/${other.slug}`)).status, 200);
  } finally {
    server.kill(); if (server.exitCode === null) await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 10000))]); if (server.exitCode === null) server.kill('SIGKILL');
    const sources = await db.ingestionSource.findMany({ where: { universityId: { in: universities } }, select: { id: true } }); const sourceIds = sources.map(item => item.id);
    await db.ingestionLog.deleteMany({ where: { sourceId: { in: sourceIds } } }); await db.contentSync.deleteMany({ where: { sourceId: { in: sourceIds } } });
    await db.article.deleteMany({ where: { universityId: { in: universities } } }); await db.event.deleteMany({ where: { universityId: { in: universities } } }); await db.program.deleteMany({ where: { universityId: { in: universities } } });
    await db.managedLink.deleteMany({ where: { OR: [{ universityId: { in: universities } }, { title: 'رابط عام سري', destinationUrl: 'https://example.edu' }] } });
    await db.universityApiKey.deleteMany({ where: { universityId: { in: universities } } }); await db.ingestionSource.deleteMany({ where: { universityId: { in: universities } } }); await db.uploadedMedia.deleteMany({ where: { universityId: { in: universities } } });
    await db.auditLog.deleteMany({ where: { administratorId: { in: accounts } } }); await db.administrator.deleteMany({ where: { id: { in: accounts } } }); await db.university.deleteMany({ where: { id: { in: universities } } }); await db.$disconnect();
    for (const filename of await readdir(uploadDir)) await unlink(path.join(uploadDir, filename)); await rmdir(uploadDir);
  }
});
