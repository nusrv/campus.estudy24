import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { seedCampus } from '../../prisma/seed-campus.ts';
import { seedUniversityLogos } from '../../prisma/seed-logos.ts';
import { SAUDI_UNIVERSITIES, demoAdId } from '../../prisma/campus-seed-data.ts';
import { ADMIN_PATH, hashPassword, csrfToken, tokenDigest } from '../../src/server/security.ts';
import { manageUniversityKey, authenticateUniversityKey } from '../../src/server/university-keys.ts';
const databaseUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL + HTTP: seed, advertisements, counter, private API docs and scoped n8n credentials', { skip: !databaseUrl, timeout: 300000 }, async t => {
  assert.match(new URL(databaseUrl!).pathname, /_test$/);
  const secret = randomBytes(48).toString('hex'); const legacy = randomBytes(48).toString('hex');
  const listener = createServer().listen(0, '127.0.0.1'); await once(listener, 'listening'); const address = listener.address(); assert.ok(address && typeof address === 'object'); const port = address.port;
  await new Promise<void>(resolve => listener.close(() => resolve())); const origin = `http://localhost:${port}`;
  const environment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, AUTH_SECRET: secret, INGEST_API_KEY: legacy, APP_URL: origin, NODE_ENV: 'development', TRUST_PROXY: 'false' };
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: environment, encoding: 'utf8' }); assert.equal(migration.status, 0);
  const { createDatabase } = await import('../../src/server/database-client.ts'); const db = createDatabase(databaseUrl);
  const slugs = SAUDI_UNIVERSITIES.map(u => u.slug);
  assert.equal(await db.university.count({ where: { slug: { in: slugs } } }), 0, 'Use a fresh disposable _test database: this suite owns the ten reserved slugs.');
  const password = randomBytes(8).toString('hex'); const suffix = randomBytes(5).toString('hex');
  const owner = await db.administrator.create({ data: { email: `owner-${suffix}@test.invalid`, name: 'Owner fixture', passwordHash: await hashPassword(password), role: 'owner' } });
  const editor = await db.administrator.create({ data: { email: `editor-${suffix}@test.invalid`, name: 'Editor fixture', passwordHash: owner.passwordHash, role: 'editor' } });
  const priorSettings = await db.siteSettings.findUnique({ where: { id: 'main' } });
  const visitsBefore = (await db.visitorDaily.aggregate({ _sum: { visits: true } }))._sum.visits || 0;
  const visitDay = new Date('2000-01-01T00:00:00Z');
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', String(port)], { env: environment, stdio: 'ignore' });
  const uniIds: string[] = []; const extraPlacements: string[] = []; const articleIds: string[] = [];
  let lifecycleAdId = ''; let uquKey = ''; let ksuKey = '';
  let visitsAdded = false;
  async function request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    return fetch(origin + path, { method, headers: { origin, 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
  }
  async function login(email: string) { const response = await request(`${ADMIN_PATH}/api/auth/login`, 'POST', { email, password }); assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie')!.split(';')[0]; return { cookie, 'x-csrf-token': csrfToken(tokenDigest(cookie.slice(cookie.indexOf('=') + 1), secret), secret) }; }
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) { try { if ((await request(ADMIN_PATH)).status === 307) { ready = true; break; } } catch { /* startup */ } await new Promise(resolve => setTimeout(resolve, 500)); }
    assert.ok(ready);
    const auth = await login(owner.email); const editorAuth = await login(editor.email);
    await t.test('idempotent seed creates ten active scoped demo ads, preserves edits and adds no news', async () => {
      const articlesBefore = await db.article.count();
      await seedCampus(db); await seedCampus(db);
      const universities = await db.university.findMany({ where: { slug: { in: slugs } } }); uniIds.push(...universities.map(u => u.id));
      assert.equal(universities.length, 10); assert.ok(universities.every(u => u.enabled));
      const ads = await db.advertisement.findMany({ where: { id: { in: slugs.map(demoAdId) } }, include: { universities: true, placementAssignments: true } });
      assert.equal(ads.length, 10);
      for (const university of universities) { const ad = ads.find(ad => ad.id === demoAdId(university.slug))!; assert.equal(ad.status, 'active'); assert.equal(ad.global, false); assert.deepEqual(ad.universities.map(u => u.universityId), [university.id]); assert.equal(ad.placementAssignments[0].placementId, 'university_banner'); assert.match(ad.title, /إعلان تجريبي/); }
      const uqu = universities.find(u => u.slug === 'uqu')!;
      await db.university.update({ where: { id: uqu.id }, data: { description: 'تحرير محفوظ', enabled: false } });
      await db.advertisement.update({ where: { id: demoAdId('uqu') }, data: { title: 'إعلان تجريبي — تحرير محفوظ', status: 'paused' } });
      await seedCampus(db);
      assert.equal((await db.university.findUniqueOrThrow({ where: { id: uqu.id } })).description, 'تحرير محفوظ');
      const preservedAd = await db.advertisement.findUniqueOrThrow({ where: { id: demoAdId('uqu') } });
      assert.equal(preservedAd.title, 'إعلان تجريبي — تحرير محفوظ'); assert.equal(preservedAd.status, 'paused');
      await db.advertisement.update({ where: { id: demoAdId('uqu') }, data: { status: 'active' } });
      assert.equal(await db.article.count(), articlesBefore);
    });
    await t.test('verified logo seed fills missing assets once and preserves manual uploads and disabled publication policies', async () => {
      const first = await seedUniversityLogos(db); assert.equal(first.filled, 8);
      assert.equal((await seedUniversityLogos(db)).filled, 0);
      const ksu = await db.university.findUniqueOrThrow({ where: { slug: 'ksu' } });
      await db.university.update({ where: { id: ksu.id }, data: { logoUrl: '/media/owner-upload.png' } });
      await seedUniversityLogos(db);
      assert.equal((await db.university.findUniqueOrThrow({ where: { id: ksu.id } })).logoUrl, '/media/owner-upload.png');
      assert.equal(await db.university.count({ where: { id: { in: uniIds }, autoPublishNews: true } }), 0);
    });
    await t.test('all ten university pages and advertisements are public; demos never appear on homepage', async () => {
      for (const slug of slugs) {
        const ads = await (await request(`/api/ads?university=${slug}&placement=university_banner`)).json();
        assert.ok(ads.items.some((ad: { id: string }) => ad.id === demoAdId(slug)));
        const page = await request(`/universities/${slug}`); assert.equal(page.status, 200); assert.match(await page.text(), /إعلان تجريبي/);
      }
      const homepageAds = await (await request('/api/ads?placement=homepage_banner')).json(); assert.equal(homepageAds.items.length, 0);
      assert.doesNotMatch(await (await request('/')).text(), /campus-demo-/);
      const directory = await (await request('/api/universities?page_size=100')).json(); assert.equal(directory.total, 10);
    });
    await t.test('advertisement create/edit/retarget/pause/reactivate/delete updates public pages without builds', async () => {
      for (const id of ['sidebar', 'footer']) { if (!await db.advertisementPlacement.findUnique({ where: { id } })) { await db.advertisementPlacement.create({ data: { id, name: id } }); extraPlacements.push(id); } }
      const uqu = await db.university.findUniqueOrThrow({ where: { slug: 'uqu' } }); const ksu = await db.university.findUniqueOrThrow({ where: { slug: 'ksu' } });
      const input = { title: 'إعلان اختبار دورة الحياة', description: 'نص تجريبي', imageUrl: 'https://uqu.edu.sa/example-image.png', destinationUrl: 'https://campus.estudy24.com/universities/uqu', buttonText: 'استكشاف', global: false, universityIds: [uqu.id], placementIds: ['sidebar'], status: 'active', priority: 999 };
      assert.equal((await request(`${ADMIN_PATH}/api/ads`, 'POST', input)).status, 401);
      const created = await request(`${ADMIN_PATH}/api/ads`, 'POST', input, auth); assert.equal(created.status, 201); lifecycleAdId = (await created.json()).id;
      assert.match(await (await request('/universities/uqu')).text(), /إعلان اختبار دورة الحياة/);
      const changed = { ...input, title: 'إعلان اختبار بعد التعديل', description: 'وصف محدّث', imageUrl: null, destinationUrl: 'https://campus.estudy24.com/universities/ksu', placementIds: ['footer'], universityIds: [ksu.id] };
      assert.equal((await request(`${ADMIN_PATH}/api/ads/${lifecycleAdId}`, 'PATCH', changed, auth)).status, 200);
      assert.doesNotMatch(await (await request('/universities/uqu')).text(), /إعلان اختبار بعد التعديل/);
      assert.match(await (await request('/universities/ksu')).text(), /إعلان اختبار بعد التعديل/);
      assert.equal((await request(`${ADMIN_PATH}/api/ads/${lifecycleAdId}`, 'PATCH', { ...changed, status: 'paused' }, auth)).status, 200);
      assert.doesNotMatch(await (await request('/universities/ksu')).text(), /إعلان اختبار بعد التعديل/);
      assert.equal((await request(`${ADMIN_PATH}/api/ads/${lifecycleAdId}`, 'PATCH', changed, auth)).status, 200);
      assert.match(await (await request('/universities/ksu')).text(), /إعلان اختبار بعد التعديل/);
      assert.equal((await request(`${ADMIN_PATH}/api/ads/${lifecycleAdId}`, 'DELETE', undefined, auth)).status, 200);
      assert.doesNotMatch(await (await request('/universities/ksu')).text(), /إعلان اختبار بعد التعديل/);
    });
    await t.test('counter updates starting value without resetting recorded visits or existing settings', async () => {
      await db.siteSettings.upsert({ where: { id: 'main' }, create: { id: 'main', visitorCounterEnabled: true }, update: { visitorCounterEnabled: true } });
      await db.visitorDaily.upsert({ where: { day: visitDay }, create: { day: visitDay, visits: 350 }, update: { visits: { increment: 350 } } });
      visitsAdded = true;
      const before = await db.siteSettings.findUniqueOrThrow({ where: { id: 'main' } });
      assert.equal((await request(`${ADMIN_PATH}/api/settings`, 'PATCH', { visitorStartingValue: -1 }, auth)).status, 422);
      for (const [value, expected] of [[200000, 200350], [100, 450]]) { assert.equal((await request(`${ADMIN_PATH}/api/settings`, 'PATCH', { visitorStartingValue: value }, auth)).status, 200); const summary = await (await request('/api/visitors')).json(); assert.equal(summary.count, expected + visitsBefore); assert.equal('includes_verified_baseline' in summary, false); }
      assert.equal((await db.visitorDaily.aggregate({ _sum: { visits: true } }))._sum.visits, visitsBefore + 350);
      const after = await db.siteSettings.findUniqueOrThrow({ where: { id: 'main' } }); assert.equal(after.visitorCounterLabel, before.visitorCounterLabel);
    });
    const uqu = await db.university.findUniqueOrThrow({ where: { slug: 'uqu' } }); const ksu = await db.university.findUniqueOrThrow({ where: { slug: 'ksu' } });
    const keyPath = `${ADMIN_PATH}/api/universities/${uqu.id}/keys`;
    await t.test('only owner manages keys; key hashes and secrets never appear in lists, audits or public APIs', async () => {
      assert.equal((await request(keyPath, 'POST', { action: 'create' })).status, 401);
      assert.equal((await request(keyPath, 'POST', { action: 'create' }, editorAuth)).status, 403);
      assert.equal((await request(keyPath, 'POST', { action: 'create' }, { cookie: auth.cookie })).status, 403);
      const result = await request(keyPath, 'POST', { action: 'create' }, auth); assert.equal(result.status, 201); const body = await result.json(); uquKey = body.secret;
      const pnu = await db.university.findUniqueOrThrow({ where: { slug: 'pnu' } });
      const competing = await Promise.allSettled([manageUniversityKey(db, owner.id, pnu.id, 'create'), manageUniversityKey(db, owner.id, pnu.id, 'create')]);
      assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(await db.universityApiKey.count({ where: { universityId: pnu.id, revokedAt: null } }), 1);
      ksuKey = (await manageUniversityKey(db, owner.id, ksu.id, 'create')).secret!;
      const keyRows = await db.universityApiKey.findMany(); assert.ok(keyRows.every(key => key.keyHash.length === 64 && !uquKey.includes(key.keyHash)));
      const list = await (await request(keyPath, 'GET', undefined, auth)).text(); assert.ok(!list.includes(uquKey)); assert.doesNotMatch(list, /keyHash/);
      const audits = JSON.stringify(await db.auditLog.findMany({ where: { entity: 'university_api_keys' } })); assert.ok(!audits.includes(uquKey));
      const publicUniversities = await (await request('/api/universities')).text(); assert.doesNotMatch(publicUniversities, /apiKeys|keyHash|campus_uak_/);
      assert.equal((await request(`${ADMIN_PATH}/api/settings`, 'PATCH', { visitorStartingValue: 0 }, { Authorization: `Bearer ${uquKey}` })).status, 401);
    });
    const payload = { university_slug: 'uqu', source_id: `scoped-${suffix}`, source_url: 'https://uqu.edu.sa/App/News/179777', title: 'اختبار استيراد نطاق الجامعة', summary: 'اختبار' };
    await t.test('scoped keys reject cross-university and mixed batches; legacy key remains compatible', async () => {
      assert.equal((await request('/api/ingest/articles', 'POST', payload)).status, 401);
      assert.equal((await request('/api/ingest/articles', 'POST', payload, { Authorization: `Bearer ${uquKey.slice(0, -5)}wrong` })).status, 401);
      assert.equal((await request('/api/ingest/articles', 'POST', payload, { Authorization: `Bearer ${ksuKey}` })).status, 403);
      assert.equal((await request('/api/ingest/batch', 'POST', { articles: [payload, { ...payload, university_slug: 'ksu' }] }, { Authorization: `Bearer ${uquKey}` })).status, 403);
      assert.equal(await db.article.count({ where: { originalArticleId: payload.source_id } }), 0);
      const created = await request('/api/ingest/articles', 'POST', payload, { Authorization: `Bearer ${uquKey}` }); assert.equal(created.status, 201); const id = (await created.json()).results[0].article_id; articleIds.push(id);
      assert.equal((await db.article.findUniqueOrThrow({ where: { id } })).status, 'pending_review');
      assert.equal((await request('/api/ingest/articles', 'POST', payload, { Authorization: `Bearer ${legacy}` })).status, 200);
    });
    await t.test('scoped duplicate import is idempotent and preserves administrator edits/publication', async () => {
      const id = articleIds[0];
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${id}`, 'PATCH', { title: 'عنوان محرّر محفوظ', status: 'published' }, auth)).status, 200);
      const results = await Promise.all([request('/api/ingest/articles', 'POST', { ...payload, title: 'تحديث المصدر' }, { Authorization: `Bearer ${uquKey}` }), request('/api/ingest/articles', 'POST', { ...payload, title: 'تحديث المصدر' }, { Authorization: `Bearer ${uquKey}` })]); assert.ok(results.every(r => r.status === 200));
      assert.equal(await db.article.count({ where: { originalArticleId: payload.source_id } }), 1);
      const stored = await db.article.findUniqueOrThrow({ where: { id } }); assert.equal(stored.title, 'عنوان محرّر محفوظ'); assert.equal(stored.status, 'published');
    });
    await t.test('rotation and revocation invalidate previous credentials and remain university scoped', async () => {
      const rotated = await request(keyPath, 'POST', { action: 'rotate' }, auth); assert.equal(rotated.status, 200); const next = (await rotated.json()).secret;
      assert.equal((await request('/api/ingest/articles', 'POST', payload, { Authorization: `Bearer ${uquKey}` })).status, 401);
      assert.equal((await request('/api/ingest/articles', 'POST', payload, { Authorization: `Bearer ${next}` })).status, 200);
      assert.equal((await request(keyPath, 'POST', { action: 'revoke' }, auth)).status, 200);
      await assert.rejects(authenticateUniversityKey(db, next));
      assert.equal((await request('/api/ingest/articles', 'POST', payload, { Authorization: `Bearer ${next}` })).status, 401);
      assert.equal((await authenticateUniversityKey(db, ksuKey)).universityId, ksu.id);
    });
    await t.test('API reference and OpenAPI/workflow exports require administrator authentication', async () => {
      assert.equal((await request(`${ADMIN_PATH}/api-docs`)).status, 307);
      for (const path of ['openapi', 'n8n']) { assert.equal((await request(`${ADMIN_PATH}/api/integrations/${path}`)).status, 401); assert.equal((await request(`${ADMIN_PATH}/api/integrations/${path}`, 'GET', undefined, editorAuth)).status, 200); }
      assert.equal((await request(`${ADMIN_PATH}/universities/${uqu.id}/integration`, 'GET', undefined, auth)).status, 200);
    });
  } finally {
    server.kill(); if (server.exitCode === null) await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 10000))]); if (server.exitCode === null) server.kill('SIGKILL');
    await db.ingestionLog.deleteMany({ where: { source: { universityId: { in: uniIds } } } });
    await db.article.deleteMany({ where: { universityId: { in: uniIds } } });
    await db.universityApiKey.deleteMany({ where: { universityId: { in: uniIds } } });
    await db.advertisement.deleteMany({ where: { id: { in: [...slugs.map(demoAdId), lifecycleAdId] } } });
    await db.ingestionSource.deleteMany({ where: { universityId: { in: uniIds } } });
    await db.university.deleteMany({ where: { id: { in: uniIds } } });
    await db.advertisementPlacement.deleteMany({ where: { id: { in: extraPlacements } } });
    await db.auditLog.deleteMany({ where: { administratorId: { in: [owner.id, editor.id] } } });
    await db.administrator.deleteMany({ where: { id: { in: [owner.id, editor.id] } } });
    if (visitsAdded) await db.visitorDaily.updateMany({ where: { day: visitDay }, data: { visits: { decrement: 350 } } });
    if (priorSettings) { const { id: _id, ...data } = priorSettings; await db.siteSettings.update({ where: { id: 'main' }, data }); } else await db.siteSettings.deleteMany({ where: { id: 'main' } });
    await db.$disconnect();
  }
});
