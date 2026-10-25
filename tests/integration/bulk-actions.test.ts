import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { bulkOperation } from '../../src/server/bulk-service.ts';
import { academicSourceKey, publicAcademicPage } from '../../src/server/academic-programs.ts';
import { ADMIN_PATH, csrfToken, hashPassword, tokenDigest } from '../../src/server/security.ts';
import { manageUniversityKey } from '../../src/server/university-keys.ts';
const url = process.env.TEST_DATABASE_URL;
test('Unified bulk: all collections, snapshots, authorization, atomicity, academic policies and browser navigation', { skip: !url, timeout: 600000 }, async t => {
  assert.match(new URL(url!).pathname, /_test$/);
  const tag = randomBytes(5).toString('hex'), secret = randomBytes(48).toString('hex'), password = randomBytes(18).toString('base64url');
  const { createDatabase } = await import('../../src/server/database-client.ts');
  const migrate = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' }); assert.equal(migrate.status, 0, migrate.stderr);
  const db = createDatabase(url); t.after(() => db.$disconnect());
  const universities = await Promise.all(['own', 'other', 'toggle', 'order'].map(name => db.university.create({ data: { name: `جامعة اختبار ${name} ${tag}`, slug: `bulk-${name}-${tag}` } })));
  const [university, other, toggleUniversity, orderUniversity] = universities;
  const owner = await db.administrator.create({ data: { email: `bulk-owner-${tag}@test.invalid`, name: `مدير ${tag}`, role: 'owner', passwordHash: await hashPassword(password) } });
  const editor = await db.administrator.create({ data: { email: `bulk-editor-${tag}@test.invalid`, name: `محرر ${tag}`, role: 'editor', passwordHash: owner.passwordHash } });
  const ambassador = await db.administrator.create({ data: { email: `bulk-amb-${tag}@test.invalid`, name: `سفير ${tag}`, role: 'ambassador', universityId: university.id, passwordHash: owner.passwordHash } });
  const sessions = await Promise.all([owner, editor, ambassador].map(actor => db.adminSession.create({ data: { administratorId: actor.id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 86400000) } })));
  const source = await db.ingestionSource.create({ data: { universityId: university.id, key: `bulk-source-${tag}`, name: `مصدر ${tag}`, url: 'https://uqu.edu.sa/App/Degrees' } });
  const category = await db.articleCategory.create({ data: { slug: `bulk-category-${tag}`, name: `تصنيف ${tag}` } });
  const placement = await db.advertisementPlacement.upsert({ where: { id: 'university_banner' }, create: { id: 'university_banner', name: 'بانر الجامعة' }, update: {} });
  await db.academicProgram.createMany({ data: Array.from({ length: 333 }, (_, i) => ({ universityId: university.id, title: `cohort-${tag}-${String(i).padStart(3, '0')}`, degreeName: i % 2 ? 'بكالوريوس' : 'دبلوم متوسط', college: 'كلية الاختبار', origin: 'imported' as const, sourceId: source.id, sourceSystem: source.key, externalId: `cohort-${i}`, sourceKey: academicSourceKey(university.id, source.key, `cohort-${i}`) })) });
  const cohort = await db.academicProgram.findMany({ where: { universityId: university.id }, orderBy: { title: 'asc' } });
  const foreign = await db.academicProgram.create({ data: { universityId: other.id, title: 'غير متاح للسفير' } });
  const article = await db.article.create({ data: { universityId: university.id, title: `خبر ${tag}`, origin: 'imported', sourceId: source.id, originalArticleId: `bulk-article-${tag}`, sourceUrl: source.url, fingerprint: '0'.repeat(64) } });
  const platform = await db.platformPost.create({ data: { title: `منصة ${tag}`, slug: `bulk-post-${tag}` } });
  const event = await db.event.create({ data: { title: `موعد ${tag}`, kind: 'academic_date', universityId: university.id, startsAt: new Date() } });
  const program = await db.program.create({ data: { title: `تدريب ${tag}`, universityId: university.id, startsAt: new Date() } });
  const link = await db.managedLink.create({ data: { title: `خدمة ${tag}`, universityId: university.id, destinationUrl: 'https://uqu.edu.sa', active: false } });
  const ad = await db.advertisement.create({ data: { title: `إعلان ${tag}`, destinationUrl: 'https://estudy24.com', placementId: placement.id } });
  const key = await manageUniversityKey(db, owner.id, university.id, 'create');
  const op = async (resource: string, input: unknown, actor = owner, sessionId = sessions[0].id) => JSON.parse(JSON.stringify(await bulkOperation(db, resource, input, actor.id, sessionId)));
  async function preview(resource: string, action: string, ids: string[], filters: Record<string, string> = {}, actor = owner, sessionId = sessions[0].id) { return op(resource, { op: 'preview', action, selection: { mode: 'ids', ids, filters } }, actor, sessionId); }
  const execute = (resource: string, p: { token: string; confirmation: string }, actor = owner, sessionId = sessions[0].id) => op(resource, { op: 'execute', token: p.token, confirmation: p.confirmation }, actor, sessionId);
  let child: ReturnType<typeof spawn> | undefined;
  const requestIds: string[] = [];
  try {
    await t.test('333 imported programs selected server-side across pages; additions stay out; replay is idempotent', async () => {
      const filters = { university: university.slug, search: `cohort-${tag}` };
      const s = await op('academic-programs', { op: 'snapshot', filters }); assert.equal(s.count, 333); assert.equal(s.records, undefined);
      const addition = await db.academicProgram.create({ data: { universityId: university.id, title: `cohort-${tag}-new` } });
      const member = await op('academic-programs', { op: 'membership', token: s.token, ids: [cohort[0].id, addition.id] }); assert.deepEqual(member.ids, [cohort[0].id]);
      const p = await op('academic-programs', { op: 'preview', action: 'publish', selection: { mode: 'all', token: s.token, excluded: [] } }); assert.equal(p.count, 333); assert.match(p.scope, new RegExp(tag));
      const result = await execute('academic-programs', p); assert.equal(result.affected_count, 333); assert.equal(result.changed_count, 333);
      assert.equal(await db.academicProgram.count({ where: { id: { in: cohort.map(r => r.id) }, status: 'published' } }), 333);
      assert.equal((await db.academicProgram.findUniqueOrThrow({ where: { id: addition.id } })).status, 'pending_review');
      assert.deepEqual(await execute('academic-programs', p), result); assert.equal(await db.auditLog.count({ where: { action: 'bulk_publish', entityId: { in: cohort.map(r => r.id) } } }), 333);
      const s2 = await op('academic-programs', { op: 'snapshot', filters }); const p2 = await op('academic-programs', { op: 'preview', action: 'hide', selection: { mode: 'all', token: s2.token, excluded: [cohort[0].id, addition.id] } }); assert.equal(p2.count, 332);
      await execute('academic-programs', p2); assert.equal((await db.academicProgram.findUniqueOrThrow({ where: { id: cohort[0].id } })).visible, true);
      await assert.rejects(() => op('academic-programs', { op: 'preview', action: 'hide', selection: { mode: 'all', token: s2.token, excluded: [foreign.id] } }));
    });
    await t.test('stale edits, changed filters, wrong resource/session, expired and forged snapshots are rejected atomically', async () => {
      const p = await preview('academic-programs', 'publish', [cohort[1].id, cohort[2].id]);
      await db.academicProgram.update({ where: { id: cohort[1].id }, data: { title: 'تعديل بعد التأكيد' } });
      await assert.rejects(() => execute('academic-programs', p)); assert.equal((await db.academicProgram.findUniqueOrThrow({ where: { id: cohort[2].id } })).status, 'hidden');
      await assert.rejects(() => execute('articles', p));
      await assert.rejects(() => execute('academic-programs', p, editor, sessions[1].id));
      await assert.rejects(() => op('academic-programs', { op: 'snapshot', filters: { universityId: other.id } }));
      const s = await op('academic-programs', { op: 'snapshot', filters: { university: university.slug } });
      await db.adminBulkSelection.update({ where: { id: s.token }, data: { expiresAt: new Date(0) } });
      await assert.rejects(() => op('academic-programs', { op: 'preview', action: 'hide', selection: { mode: 'all', token: s.token, excluded: [] } }));
    });
    await t.test('oversized result sets fail explicitly rather than silently selecting a page or truncating', async () => {
      await db.academicProgram.createMany({ data: Array.from({ length: 5001 }, (_, i) => ({ universityId: other.id, title: `limit-${tag}-${i}` })) });
      await assert.rejects(() => op('academic-programs', { op: 'snapshot', filters: { search: `limit-${tag}` } }), error => !!error && typeof error === 'object' && 'code' in error && error.code === 'SELECTION_LIMIT');
      await db.academicProgram.deleteMany({ where: { universityId: other.id, title: { startsWith: `limit-${tag}` } } });
    });
    await t.test('all other manageable collections expose permitted transactional actions without leaking credentials', async () => {
      const cases = [ ['articles', article.id, 'publish', {}], ['platform_posts', platform.id, 'publish', {}], ['events', event.id, 'publish', { kind: 'academic_date' }], ['programs', program.id, 'publish', {}], ['links', link.id, 'enable', {}], ['ads', ad.id, 'activate', {}], ['universities', toggleUniversity.id, 'disable', {}], ['sources', source.id, 'disable', {}], ['api-keys', key.record!.id, 'revoke', { university: university.slug, revoked: 'false' }] ] as const;
      for (const [resource, id, action, filters] of cases) { const p = await preview(resource, action, [id], filters); assert.equal(p.count, 1); const result = await execute(resource, p); assert.equal(result.affected_count, 1); assert.equal(/passwordHash|keyHash|tokenHash|campus_uak_/.test(JSON.stringify(result)), false); }
      assert.equal((await db.event.findUniqueOrThrow({ where: { id: event.id } })).status, 'published');
      assert.equal((await db.advertisement.findUniqueOrThrow({ where: { id: ad.id } })).status, 'active');
      assert.equal((await db.university.findUniqueOrThrow({ where: { id: toggleUniversity.id } })).enabled, false);
      await execute('universities', await preview('universities', 'enable', [toggleUniversity.id]));
      await execute('sources', await preview('sources', 'enable', [source.id]));
      await execute('categories', await preview('categories', 'delete', [category.id])); assert.equal(await db.articleCategory.count({ where: { id: category.id } }), 0);
    });
    await t.test('Editor restrictions and Ambassador scope cannot be bypassed through IDs, filters, exclusions or tokens', async () => {
      await execute('academic-programs', await preview('academic-programs', 'publish', [foreign.id], {}, editor, sessions[1].id), editor, sessions[1].id);
      await assert.rejects(() => preview('academic-programs', 'delete', [foreign.id], {}, editor, sessions[1].id));
      for (const resource of ['sources', 'universities', 'administrators', 'api-keys', 'ads', 'platform_posts', 'categories', 'logs', 'audit']) await assert.rejects(() => op(resource, { op: 'snapshot', filters: {} }, ambassador, sessions[2].id));
      await assert.rejects(() => preview('academic-programs', 'publish', [cohort[3].id, foreign.id], {}, ambassador, sessions[2].id));
      await assert.rejects(() => op('academic-programs', { op: 'snapshot', filters: { university: other.slug } }, ambassador, sessions[2].id));
      await execute('academic-programs', await preview('academic-programs', 'publish', [cohort[3].id], {}, ambassador, sessions[2].id), ambassador, sessions[2].id);
      const global = await db.managedLink.create({ data: { title: `عام ${tag}`, destinationUrl: 'https://estudy24.com' } });
      try { await assert.rejects(() => preview('links', 'hide', [global.id], {}, ambassador, sessions[2].id)); } finally { await db.managedLink.delete({ where: { id: global.id } }); }
    });
    await t.test('account safety, typed confirmation and session revocation preserve the active Owner', async () => {
      const reset = await db.adminPasswordReset.create({ data: { administratorId: editor.id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 60000) } });
      await execute('administrators', await preview('administrators', 'enable', [editor.id]));
      assert.equal(await db.adminPasswordReset.count({ where: { id: reset.id } }), 1, 'A no-op enable must not cancel a pending security reset');
      assert.equal(await db.adminSession.count({ where: { id: sessions[1].id } }), 1, 'A no-op enable must not log out an active editor');
      await assert.rejects(() => preview('administrators', 'delete', [editor.id]));
      await assert.rejects(() => preview('administrators', 'disable', [owner.id, editor.id]));
      const p = await preview('administrators', 'disable', [editor.id, ambassador.id]);
      await assert.rejects(() => op('administrators', { op: 'execute', token: p.token, confirmation: 'غير مطابق' }));
      await execute('administrators', p); assert.equal(await db.adminSession.count({ where: { administratorId: { in: [editor.id, ambassador.id] } } }), 0);
      assert.equal((await db.administrator.findUniqueOrThrow({ where: { id: owner.id } })).active, true);
      await execute('administrators', await preview('administrators', 'enable', [editor.id, ambassador.id]));
    });
    await t.test('database failure rolls back every record and audit; retry of the same confirmation succeeds once', async () => {
      const ids = [cohort[4].id, cohort[5].id], p = await preview('academic-programs', 'publish', ids);
      const before = await db.academicProgram.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
      assert.match(ids[1], /^[a-z0-9]+$/); const fn = `bulk_failure_${tag}`;
      await db.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = TG_ARGV[0] THEN RAISE EXCEPTION 'bulk rollback fixture'; END IF; RETURN NEW; END $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER "${fn}" BEFORE UPDATE ON "AcademicProgram" FOR EACH ROW EXECUTE FUNCTION "${fn}"('${ids[1]}')`);
      try { await assert.rejects(() => execute('academic-programs', p)); assert.deepEqual(await db.academicProgram.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } }), before); assert.equal(await db.auditLog.count({ where: { details: { path: ['operationId'], equals: p.token } } }), 0); }
      finally { await db.$executeRawUnsafe(`DROP TRIGGER "${fn}" ON "AcademicProgram"`); await db.$executeRawUnsafe(`DROP FUNCTION "${fn}"()`); }
      assert.equal((await execute('academic-programs', p)).affected_count, 2);
    });
    await t.test('diploma and bachelor priority is applied before pagination, retaining all degree variants and filters', async () => {
      const degrees = ['دكتوراه', 'ماجستير', 'دبلوم متوسط', 'دبلوم عالٍ', 'بكالوريوس', 'الزمالة الطبية', null];
      await db.academicProgram.createMany({ data: degrees.map((degreeName, i) => ({ universityId: orderUniversity.id, title: `${i < 2 ? 'أ' : 'ي'} برنامج ${i}`, degreeName, college: 'كلية محددة', department: 'قسم محدد', status: 'published' as const })) });
      const ordered = [];
      for (let page = 0; page < 7; page++) ordered.push(...await publicAcademicPage(db, { universityId: orderUniversity.id, status: 'published', college: 'كلية محددة' }, page, 1));
      assert.equal(new Set(ordered.map(r => r.id)).size, 7); assert.ok(ordered.slice(0, 3).every(r => /دبلوم|بكالور/.test(r.degreeName!))); assert.ok(ordered.slice(3).some(r => r.degreeName === 'دكتوراه')); assert.ok(ordered.some(r => r.degreeName === null));
    });
    const listener = createServer().listen(0, '127.0.0.1'); await once(listener, 'listening'); const address = listener.address(); assert.ok(address && typeof address === 'object'); const port = address.port; await new Promise<void>(resolve => listener.close(() => resolve())); const origin = `http://localhost:${port}`;
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', String(port)], { env: { ...process.env, DATABASE_URL: url, AUTH_SECRET: secret, APP_URL: origin, NODE_ENV: 'development', TRUST_PROXY: 'true' }, stdio: 'ignore' });
    async function request(path: string, method = 'GET', body?: unknown, auth: Record<string, string> = {}) { return fetch(origin + path, { method, headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${parseInt(tag.slice(0, 2), 16) % 200 + 1}`, ...auth }, ...(body !== undefined && { body: JSON.stringify(body) }), redirect: 'manual' }); }
    let ready = false; for (let i = 0; i < 120; i++) { try { if ((await request(ADMIN_PATH)).status === 307) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 500)); } assert.ok(ready);
    async function login(email: string) { const response = await request(`${ADMIN_PATH}/api/auth/login`, 'POST', { email, password }); assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie')!.split(';')[0]; return { cookie, 'x-csrf-token': csrfToken(tokenDigest(cookie.slice(cookie.indexOf('=') + 1), secret), secret) }; }
    const ownerAuth = await login(owner.email), editorAuth = await login(editor.email), ambAuth = await login(ambassador.email);
    await t.test('HTTP authentication, CSRF, strict bodies and university scope protect the shared endpoint', async () => {
      const path = `${ADMIN_PATH}/api/bulk/academic-programs`, body = { op: 'snapshot', filters: {} };
      assert.equal((await request(path, 'POST', body)).status, 401);
      assert.equal((await request(path, 'POST', body, { cookie: ownerAuth.cookie })).status, 403);
      assert.equal((await request(path, 'POST', { ...body, ids: [foreign.id] }, ownerAuth)).status, 422);
      assert.equal((await request(path, 'POST', { op: 'preview', action: 'delete', selection: { mode: 'ids', ids: [cohort[0].id], filters: {} } }, editorAuth)).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${article.id}`, 'PATCH', { action: 'soft_delete' }, editorAuth)).status, 403);
      assert.equal((await request(path, 'POST', { op: 'preview', action: 'publish', selection: { mode: 'ids', ids: [foreign.id], filters: {} } }, ambAuth)).status, 409);
    });
    await t.test('academic source auto-publication is Owner-controlled, new-only, audited and protects editorial decisions', async () => {
      const bearer = (await manageUniversityKey(db, owner.id, university.id, 'create')).secret!;
      assert.equal((await request(`${ADMIN_PATH}/api/bulk/academic-programs`, 'POST', { op: 'snapshot', filters: {} }, { Authorization: `Bearer ${bearer}` })).status, 401);
      const sample = { source_key: source.key, source_id: `auto-old-${tag}`, name: 'برنامج أكاديمي رسمي للاختبار', degree_name: 'دبلوم عالٍ', college: 'كلية رسمية للاختبار', source_url: 'https://uqu.edu.sa/App/Degrees/1894', official_program_url: 'https://uqu.edu.sa/App/Degrees/1894' };
      async function ingest(data: object) { const response = await request('/api/ingest/academic-programs', 'POST', data, { Authorization: `Bearer ${bearer}` }); const body = await response.json(); if (body.request_id) requestIds.push(body.request_id); assert.ok(response.ok); return body; }
      const initial = await ingest(sample); assert.equal(initial.results[0].publication.status, 'pending_review');
      const settings = { key: source.key, name: source.name, url: source.url, universityId: university.id, enabled: true, autoPublishAcademicPrograms: true };
      assert.equal((await request(`${ADMIN_PATH}/api/sources/${source.id}`, 'PATCH', settings, editorAuth)).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/sources/${source.id}`, 'PATCH', settings, ownerAuth)).status, 200);
      assert.equal((await ingest(sample)).results[0].publication.status, 'pending_review');
      const created = await ingest({ ...sample, source_id: `auto-new-${tag}` }); assert.equal(created.results[0].publication.status, 'published');
      const id = created.results[0].resource_id;
      assert.equal((await request(`${ADMIN_PATH}/api/academic-programs/${id}`, 'PATCH', { status: 'unpublished', title: 'تصحيح يدوي' }, ownerAuth)).status, 200);
      assert.equal((await ingest({ ...sample, source_id: `auto-new-${tag}`, name: 'تحديث المصدر' })).results[0].publication.status, 'unpublished');
      assert.equal((await db.academicProgram.findUniqueOrThrow({ where: { id } })).title, 'تصحيح يدوي');
      assert.equal((await request(`${ADMIN_PATH}/api/academic-programs/${id}`, 'PATCH', { status: 'hidden', visible: false }, ownerAuth)).status, 200);
      assert.equal((await ingest({ ...sample, source_id: `auto-new-${tag}` })).results[0].publication.status, 'hidden');
      assert.equal((await db.academicProgram.findUniqueOrThrow({ where: { id } })).visible, false);
      const p = await preview('academic-programs', 'delete', [id]); await execute('academic-programs', p); await ingest({ ...sample, source_id: `auto-new-${tag}` }); assert.ok((await db.academicProgram.findUniqueOrThrow({ where: { id } })).deletedAt);
      assert.equal((await ingest({ ...sample, source_id: `auto-missing-${tag}`, college: null })).results[0].publication.status, 'pending_review');
      assert.equal((await ingest({ ...sample, source_id: `auto-suspicious-${tag}`, name: '<script>bad</script>' })).results[0].publication.status, 'pending_review');
      assert.ok(await db.auditLog.count({ where: { action: 'academic_import_publication_decision', entityId: id } }));
    });
    const executable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    await t.test('desktop/mobile shared selection, page persistence, exclusions, filter reset and 333-record publication', { skip: !existsSync(executable), timeout: 240000 }, async () => {
      const browser = await chromium.launch({ executablePath: executable, headless: true });
      try {
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
          await db.academicProgram.updateMany({ where: { id: { in: cohort.map(r => r.id) } }, data: { title: undefined, status: 'pending_review', visible: true } });
          // Restore the one deliberately edited fixture title so the filtered cohort is exactly 333.
          await db.academicProgram.update({ where: { id: cohort[1].id }, data: { title: cohort[1].title } });
          await db.academicProgram.deleteMany({ where: { universityId: university.id, title: `cohort-${tag}-new` } });
          const context = await browser.newContext({ viewport }); const [name, value] = ownerAuth.cookie.split('='); await context.addCookies([{ name, value, url: origin + ADMIN_PATH }]); const page = await context.newPage();
          const path = `${origin}${ADMIN_PATH}/academic-programs?university=${university.slug}&search=cohort-${tag}`;
          await page.goto(path); await page.getByRole('checkbox', { name: 'تحديد جميع سجلات الصفحة الحالية' }).check(); await page.getByText('تم تحديد 12 سجلًا', { exact: true }).waitFor();
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Bulk controls must not create page-level horizontal overflow');
          await page.getByRole('button', { name: 'التالي', exact: true }).click(); await page.waitForURL(/page=2/); await page.getByText('تم تحديد 12 سجلًا', { exact: true }).waitFor();
          await page.getByRole('checkbox', { name: /^تحديد السجل:/ }).first().check(); await page.getByText('تم تحديد 13 سجلًا', { exact: true }).waitFor();
          await page.getByRole('button', { name: /تحديد جميع النتائج المطابقة للفلاتر \(333\)/ }).click(); await page.getByText('تم تحديد 333 سجلًا', { exact: true }).waitFor();
          const checkbox = page.getByRole('checkbox', { name: /^تحديد السجل:/ }).first(); await page.waitForFunction(() => { const input = document.querySelector<HTMLInputElement>('tbody input[type="checkbox"]'); return input?.checked && !input.disabled; }); await checkbox.uncheck(); await page.getByText('تم تحديد 332 سجلًا', { exact: true }).waitFor(); await checkbox.check();
          await page.getByRole('combobox', { name: 'الإجراء الجماعي' }).selectOption('publish'); await page.getByRole('button', { name: 'نشر المحدد (333)', exact: true }).click();
          const dialog = page.getByRole('dialog'); await dialog.waitFor(); assert.match(await dialog.innerText(), /333/); assert.match(await dialog.innerText(), new RegExp(tag));
          await page.getByRole('button', { name: 'تأكيد التنفيذ على 333 سجلًا', exact: true }).click(); await page.getByText('تم تحديد 0 سجلًا', { exact: true }).waitFor();
          assert.equal(await db.academicProgram.count({ where: { id: { in: cohort.map(r => r.id) }, status: 'published' } }), 333);
          const publicPage = await (await request(`/api/academic-programs?university=${university.slug}`)).json(); assert.equal(publicPage.total, 333);
          await page.getByRole('checkbox', { name: /^تحديد السجل:/ }).first().check(); await page.locator('input[name=search]').fill('لا توجد نتائج'); await page.getByRole('button', { name: 'تطبيق التصفية', exact: true }).click(); await page.getByText('تم تحديد 0 سجلًا', { exact: true }).waitFor(); await page.getByText(/أُلغي التحديد السابق/).waitFor();
          assert.equal(await page.locator('body').getAttribute('dir') || await page.locator('html').getAttribute('dir'), 'rtl');
          await context.close();
        }
        const context = await browser.newContext(); const [name, value] = ownerAuth.cookie.split('='); await context.addCookies([{ name, value, url: origin + ADMIN_PATH }]); const page = await context.newPage();
        for (const section of ['articles', 'academic-programs', 'platform_posts', 'events', 'programs', 'links', 'ads', 'universities', 'sources', 'categories', 'administrators']) { await page.goto(`${origin}${ADMIN_PATH}/${section}`); await page.getByRole('region', { name: /التحديد والإجراءات الجماعية/ }).waitFor(); }
        await page.goto(`${origin}${ADMIN_PATH}/universities/${university.id}/integration`); await page.getByRole('region', { name: /التحديد والإجراءات الجماعية/ }).waitFor();
        for (const section of ['logs', 'audit', 'settings', 'platform-settings']) { await page.goto(`${origin}${ADMIN_PATH}/${section}`); assert.equal(await page.getByRole('checkbox', { name: /^تحديد السجل:/ }).count(), 0); }
        await page.goto(`${origin}${ADMIN_PATH}/sources?search=${tag}`); await page.getByRole('button', { name: 'تعديل السجل', exact: true }).first().click();
        const policy = page.getByRole('checkbox', { name: /النشر التلقائي للتخصصات الأكاديمية/ }); assert.equal(await policy.isChecked(), true); await policy.uncheck();
        await page.getByRole('button', { name: 'حفظ التغييرات', exact: true }).click(); await page.getByRole('dialog', { name: 'تعديل السجل' }).waitFor({ state: 'hidden' });
        assert.equal((await db.ingestionSource.findUniqueOrThrow({ where: { id: source.id } })).autoPublishAcademicPrograms, false);
        await page.goto(`${origin}/universities/${university.slug}?section=academic-programs`); await page.getByText(cohort[0].title, { exact: true }).waitFor();
        await page.goto(`${origin}${ADMIN_PATH}/administrators?search=${tag}`);
        for (const [action, phrase, active] of [['disable', 'تعطيل المحدد 1', false], ['enable', 'تفعيل المحدد 1', true]] as const) {
          await page.getByRole('checkbox', { name: `تحديد السجل: ${editor.name}`, exact: true }).check(); await page.getByRole('combobox', { name: 'الإجراء الجماعي' }).selectOption(action);
          await page.getByRole('button', { name: `${phrase.slice(0, -2)} (1)`, exact: true }).click(); const confirm = page.getByRole('button', { name: 'تأكيد التنفيذ على 1 سجلًا', exact: true }); assert.equal(await confirm.isDisabled(), true);
          await page.getByRole('textbox', { name: 'نص تأكيد الإجراء الحساس', exact: true }).fill(phrase); await confirm.click(); await page.getByText('تم تحديد 0 سجلًا', { exact: true }).waitFor();
          assert.equal((await db.administrator.findUniqueOrThrow({ where: { id: editor.id } })).active, active);
        }
        await page.goto(`${origin}${ADMIN_PATH}/universities/${university.id}/integration`); await page.getByRole('checkbox', { name: /^تحديد السجل:/ }).check(); await page.getByRole('combobox', { name: 'الإجراء الجماعي' }).selectOption('revoke');
        await page.getByRole('button', { name: 'إلغاء المفاتيح المحددة (1)', exact: true }).click(); await page.getByRole('textbox', { name: 'نص تأكيد الإجراء الحساس' }).fill('إلغاء المفاتيح المحددة 1'); await page.getByRole('button', { name: 'تأكيد التنفيذ على 1 سجلًا', exact: true }).click(); await page.getByText('تم تحديد 0 سجلًا', { exact: true }).waitFor();
        assert.equal(await db.universityApiKey.count({ where: { universityId: university.id, revokedAt: null } }), 0);
        await context.close();
      } finally { await browser.close(); }
    });
  } finally {
    if (child) { child.kill('SIGTERM'); await Promise.race([once(child, 'exit').catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))]); }
    const allSources = await db.ingestionSource.findMany({ where: { universityId: { in: universities.map(u => u.id) } }, select: { id: true } });
    await db.ingestionLog.deleteMany({ where: { OR: [{ sourceId: { in: allSources.map(s => s.id) } }, { requestId: { in: requestIds } }] } });
    await db.adminBulkSelection.deleteMany({ where: { administratorId: { in: [owner.id, editor.id, ambassador.id] } } });
    await db.articleEdit.deleteMany({ where: { administratorId: { in: [owner.id, editor.id, ambassador.id] } } });
    await db.auditLog.deleteMany({ where: { OR: [{ administratorId: { in: [owner.id, editor.id, ambassador.id] } }, { details: { path: ['universityId'], equals: university.id } }] } });
    await db.academicProgram.deleteMany({ where: { universityId: { in: universities.map(u => u.id) } } });
    await db.article.deleteMany({ where: { universityId: { in: universities.map(u => u.id) } } });
    await db.contentSync.deleteMany({ where: { sourceId: { in: allSources.map(s => s.id) } } });
    await db.ingestionSource.deleteMany({ where: { universityId: { in: universities.map(u => u.id) } } });
    await db.event.deleteMany({ where: { universityId: { in: universities.map(u => u.id) } } }); await db.program.deleteMany({ where: { universityId: { in: universities.map(u => u.id) } } }); await db.managedLink.deleteMany({ where: { universityId: { in: universities.map(u => u.id) } } });
    await db.advertisement.deleteMany({ where: { id: ad.id } }); await db.platformPost.deleteMany({ where: { id: platform.id } }); await db.articleCategory.deleteMany({ where: { id: category.id } });
    await db.universityApiKey.deleteMany({ where: { universityId: { in: universities.map(u => u.id) } } });
    await db.administrator.deleteMany({ where: { id: { in: [owner.id, editor.id, ambassador.id] } } });
    await db.university.deleteMany({ where: { id: { in: universities.map(u => u.id) } } }); await db.$disconnect();
  }
});
