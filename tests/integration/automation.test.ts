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
import { seedUniversityLogos } from '../../prisma/seed-logos.ts';
import { seedNewsCategories } from '../../prisma/seed-news-categories.ts';
import { NEWS_CATEGORIES } from '../../src/lib/news-categories.ts';
const databaseUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL + HTTP + browser: publication policies, structured ingestion, Telegram and official links', { skip: !databaseUrl, timeout: 300000 }, async t => {
  assert.match(new URL(databaseUrl!).pathname, /_test$/);
  const suffix = randomBytes(5).toString('hex'), slug = `auto-${suffix}`, otherSlug = `other-${suffix}`;
  const secret = randomBytes(48).toString('hex'), legacy = randomBytes(48).toString('hex'), password = randomBytes(8).toString('hex');
  const listener = createServer().listen(0, '127.0.0.1'); await once(listener, 'listening'); const address = listener.address(); assert.ok(address && typeof address === 'object'); const port = address.port;
  await new Promise<void>(resolve => listener.close(() => resolve())); const origin = `http://localhost:${port}`;
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, AUTH_SECRET: secret, INGEST_API_KEY: legacy, APP_URL: origin, NODE_ENV: 'development', TRUST_PROXY: 'false' };
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr);
  const { createDatabase } = await import('../../src/server/database-client.ts'); const db = createDatabase(databaseUrl);
  const university = await db.university.create({ data: { name: 'جامعة الاختبار', slug, websiteUrl: 'https://uqu.edu.sa', logoUrl: '/university-logos/uqu.png' } });
  const other = await db.university.create({ data: { name: 'جامعة ثانية للاختبار', slug: otherSlug } });
  const source = await db.ingestionSource.create({ data: { key: `${slug}-rss`, name: 'مصدر اختباري', url: 'https://uqu.edu.sa/App/Rss', universityId: university.id } });
  const owner = await db.administrator.create({ data: { email: `auto-${suffix}@test.invalid`, name: 'المالك', passwordHash: await hashPassword(password), role: 'owner' } });
  const editor = await db.administrator.create({ data: { email: `editor-${suffix}@test.invalid`, name: 'المحرر', passwordHash: owner.passwordHash, role: 'editor' } });
  const key = (await manageUniversityKey(db, owner.id, university.id, 'create')).secret!;
  const otherKey = (await manageUniversityKey(db, owner.id, other.id, 'create')).secret!;
  const priorSettings = await db.siteSettings.findUnique({ where: { id: 'main' } });
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', String(port)], { env, stdio: 'ignore' });
  const headers = { Authorization: `Bearer ${key}` };
  async function request(path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) {
    return fetch(origin + path, { method, headers: { origin, 'content-type': 'application/json', ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
  }
  async function login(email: string) { const response = await request(`${ADMIN_PATH}/api/auth/login`, 'POST', { email, password }); assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie')!.split(';')[0]; return { cookie, 'x-csrf-token': csrfToken(tokenDigest(cookie.slice(cookie.indexOf('=') + 1), secret), secret) }; }
  const news = { university_slug: slug, source_id: 'news-1', source_url: 'https://uqu.edu.sa/App/News/1', title: 'خبر اختباري من مصدر موثوق', summary: 'هذا ملخص خبري مفصل بما يكفي لمراجعة النشر التلقائي في قاعدة الاختبار فقط.', published_at: new Date().toISOString() };
  const common = { university_slug: slug, source_id: 'item-1', source_url: 'https://uqu.edu.sa/content/1', title: 'محتوى اختباري' };
  const starts = '2027-01-20T10:00:00Z';
  const payloads = { links: { ...common, kind: 'student_service', destination_url: 'https://uqu.edu.sa/service' }, events: { ...common, starts_at: starts }, calendar: { ...common, starts_at: starts, kind: 'examination' }, programs: { ...common, starts_at: starts, application_url: 'https://uqu.edu.sa/program' } };
  const records: Record<string, string> = {};
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) { try { if ((await request(ADMIN_PATH)).status === 307) { ready = true; break; } } catch { /* startup */ } await new Promise(resolve => setTimeout(resolve, 500)); }
    assert.ok(ready); const auth = await login(owner.email), editorAuth = await login(editor.email);
    await t.test('news defaults to review; only owner can opt in; invalid and suspicious news remain pending', async () => {
      assert.equal(university.autoPublishNews, false);
      assert.equal((await request('/api/ingest/articles', 'POST', news, headers)).status, 201);
      assert.equal((await db.article.findFirstOrThrow({ where: { universityId: university.id } })).status, 'pending_review');
      const update = { name: university.name, slug, websiteUrl: university.websiteUrl, autoPublishNews: true };
      assert.equal((await request(`${ADMIN_PATH}/api/universities/${university.id}`, 'PATCH', update, editorAuth)).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/universities/${university.id}`, 'PATCH', update, auth)).status, 200);
      const published = await (await request('/api/ingest/articles', 'POST', news, headers)).json(); assert.equal(published.results[0].publication.status, 'published');
      assert.ok((await db.article.findUniqueOrThrow({ where: { id: published.results[0].article_id } })).autoPublishedAt);
      for (const [source_id, patch] of [['weak', { summary: '' }], ['suspicious', { content_text: '<script>alert(1)</script>' }], ['no-date', { published_at: null }]] as const) {
        const body = await (await request('/api/ingest/articles', 'POST', { ...news, source_id, ...patch }, headers)).json(); assert.equal(body.results[0].publication.status, 'pending_review');
      }
      assert.equal((await request('/api/ingest/articles', 'POST', { ...news, title: '' }, headers)).status, 422);
    });
    await t.test('automatic news respects manual edits, unpublish/hide/delete and concurrent duplicate imports', async () => {
      const article = await db.article.findFirstOrThrow({ where: { universityId: university.id, originalArticleId: 'news-1' } });
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${article.id}`, 'PATCH', { title: 'عنوان محرر محفوظ', status: 'unpublished' }, editorAuth)).status, 200);
      const responses = await Promise.all([request('/api/ingest/articles', 'POST', { ...news, title: 'تحديث المصدر' }, headers), request('/api/ingest/articles', 'POST', { ...news, title: 'تحديث المصدر' }, headers)]);
      assert.ok(responses.every(r => r.status === 200));
      assert.equal(await db.article.count({ where: { sourceId: source.id, originalArticleId: news.source_id } }), 1);
      let stored = await db.article.findUniqueOrThrow({ where: { id: article.id } }); assert.equal(stored.title, 'عنوان محرر محفوظ'); assert.equal(stored.status, 'unpublished');
      for (const patch of [{ status: 'hidden' }, { action: 'soft_delete' }]) {
        assert.equal((await request(`${ADMIN_PATH}/api/articles/${article.id}`, 'PATCH', patch, auth)).status, 200);
        await request('/api/ingest/articles', 'POST', news, headers); stored = await db.article.findUniqueOrThrow({ where: { id: article.id } }); assert.notEqual(stored.status, 'published');
      }
      assert.ok(stored.deletedAt);
      assert.ok(await db.ingestionLog.count({ where: { sourceId: source.id, publicationDecision: 'published_automatically' } }));
      assert.ok(await db.ingestionLog.count({ where: { sourceId: source.id, publicationDecision: 'preserved_editorial_decision' } }));
    });
    await t.test('every structured endpoint enforces university scope, validates explicit fields and deduplicates', async () => {
      for (const type of Object.keys(payloads) as (keyof typeof payloads)[]) {
        const path = `/api/ingest/${type}`, payload = payloads[type];
        assert.equal((await request(path, 'POST', payload)).status, 401);
        assert.equal((await request(path, 'POST', payload, { Authorization: `Bearer ${legacy}` })).status, 401);
        assert.equal((await request(path, 'POST', payload, { Authorization: `Bearer ${otherKey}` })).status, 403);
        assert.equal((await request(path, 'POST', { items: [payload, { ...payload, university_slug: otherSlug }] }, headers)).status, 403);
        assert.equal((await request(path, 'POST', { ...payload, status: 'published' }, headers)).status, 422);
        const created = await request(path, 'POST', payload, headers); assert.equal(created.status, 201); const result = (await created.json()).results[0]; records[type] = result.resource_id; assert.equal(result.publication.status, 'pending_review');
        const duplicate = await (await request(path, 'POST', payload, headers)).json(); assert.equal(duplicate.counts.unchanged, 1);
        const batch = await (await request(path, 'POST', { items: [payload, { ...payload, title: '' }] }, headers)).json(); assert.equal(batch.counts.unchanged, 1); assert.equal(batch.counts.rejected, 1);
      }
      assert.equal(await db.contentSync.count({ where: { sourceId: source.id } }), 4);
      for (const path of ['links', 'events', 'programs']) { const data = await (await request(`/api/${path}?university=${slug}`)).json(); assert.equal(data.total, 0); }
    });
    await t.test('editor approvals surface in correct sections; future imports preserve edits and deletions', async () => {
      for (const type of Object.keys(payloads) as (keyof typeof payloads)[]) {
        const resource = type === 'calendar' ? 'events' : type, id = records[type];
        const input = type === 'links' ? { title: `محرر ${type}`, universityId: university.id, description: 'وصف محرر', destinationUrl: payloads.links.destination_url, kind: 'student_service', category: 'general', status: 'published', active: true } : { title: `محرر ${type}`, universityId: university.id, description: 'وصف محرر', startsAt: starts, endsAt: null, status: 'published', visible: true, ...(type === 'events' || type === 'calendar' ? { kind: type === 'events' ? 'event' : 'examination' } : {}) };
        assert.equal((await request(`${ADMIN_PATH}/api/${resource}/${id}`, 'PATCH', input, editorAuth)).status, 200);
        const response = await request(`/api/ingest/${type}`, 'POST', { ...payloads[type], title: 'عنوان مستبدل من المصدر', description: 'وصف من المصدر' }, headers); assert.equal(response.status, 200);
        const results = await (await request(`/api/${resource}?university=${slug}`)).json(); assert.ok(results.items.some((r: { id: string; title: string }) => r.id === id && r.title === `محرر ${type}`));
        const section = type === 'links' ? 'services' : type;
        assert.match(await (await request(`/universities/${slug}?section=${section}`)).text(), new RegExp(`محرر ${type}`));
        assert.doesNotMatch(await (await request('/')).text(), new RegExp(`محرر ${type}`));
      }
      assert.equal((await request(`${ADMIN_PATH}/api/links/${records.links}`, 'DELETE', undefined, auth)).status, 200);
      const reimport = await (await request('/api/ingest/links', 'POST', payloads.links, headers)).json(); assert.equal(reimport.results[0].publication.decision, 'preserved_manual_deletion');
      assert.equal(await db.managedLink.count({ where: { id: records.links } }), 0);
      assert.equal((await request(`${ADMIN_PATH}/api/sources/${source.id}`, 'PATCH', { key: `${slug}-changed`, universityId: other.id, name: source.name, url: source.url }, auth)).status, 409);
    });
    await t.test('Telegram settings validate, remain owner-controlled and render separately without resetting counters', async () => {
      const update = { name: university.name, slug, websiteUrl: university.websiteUrl, telegramCommunityUrl: 'https://t.me/example_campus' };
      assert.equal((await request(`${ADMIN_PATH}/api/universities/${university.id}`, 'PATCH', { ...update, telegramCommunityUrl: 'https://evil.com' }, auth)).status, 422);
      assert.equal((await request(`${ADMIN_PATH}/api/universities/${university.id}`, 'PATCH', update, auth)).status, 200);
      assert.equal((await db.university.findUniqueOrThrow({ where: { id: university.id } })).autoPublishNews, true, 'old clients do not reset the policy');
      assert.equal((await request(`${ADMIN_PATH}/api/settings`, 'PATCH', { telegramSupportUrl: 'https://t.me/example_support' }, editorAuth)).status, 403);
      assert.equal((await request(`${ADMIN_PATH}/api/settings`, 'PATCH', { telegramSupportUrl: 'https://t.me/example_support' }, auth)).status, 200);
      const page = await (await request(`/universities/${slug}`)).text(); assert.match(page, /مجتمع طلاب جامعة الاختبار \| eStudy24/); assert.match(page, /مجتمع طلابي تديره منصة eStudy24، وغير تابع للإدارة الرسمية للجامعة\./); assert.match(page, /الدعم الفني لمنصة eStudy24 عبر تيليجرام/);
      assert.equal((await db.siteSettings.findUniqueOrThrow({ where: { id: 'main' } })).visitorStartingValue, priorSettings?.visitorStartingValue || 0);
    });
    const executable = process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    await t.test('desktop/mobile mouse, touch and keyboard official links; RTL Western digits and logos', { skip: !existsSync(executable) }, async () => {
      const browser = await chromium.launch({ executablePath: executable, headless: true });
      try {
        for (const mobile of [false, true]) {
          const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile });
          await context.route('https://uqu.edu.sa/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Official navigation test</title>' }));
          const page = await context.newPage();
          for (const path of [`/universities?search=${encodeURIComponent(university.name)}`, `/universities/${slug}`]) {
            await page.goto(origin + path); const link = page.locator('[data-official-website]').first(); await link.scrollIntoViewIfNeeded();
            assert.equal(await link.getAttribute('href'), 'https://uqu.edu.sa/'); assert.match(await link.getAttribute('rel') || '', /noopener/);
            const bounds = await link.boundingBox(); assert.ok(bounds);
            assert.equal(await link.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true);
            const popup = page.waitForEvent('popup'); if (mobile) await link.tap(); else await link.click(); const opened = await popup; await opened.waitForLoadState(); assert.equal(opened.url(), 'https://uqu.edu.sa/'); assert.equal(await opened.evaluate(() => window.opener), null); await opened.close();
            await link.focus(); const keyboardPopup = page.waitForEvent('popup'); await page.keyboard.press('Enter'); const keyboardOpened = await keyboardPopup; await keyboardOpened.close();
            assert.equal(await page.locator('html').getAttribute('dir'), 'rtl'); assert.doesNotMatch(await page.locator('body').innerText(), /[\u0660-\u0669\u06f0-\u06f9]/);
            const image = page.locator('img[src="/university-logos/uqu.png"]').first(); await image.scrollIntoViewIfNeeded(); await image.evaluate(img => (img as HTMLImageElement).decode()); assert.ok(await image.evaluate(img => (img as HTMLImageElement).naturalWidth > 0));
          }
          const parts = auth.cookie.split('='); await context.addCookies([{ name: parts[0], value: parts[1], url: origin + ADMIN_PATH }]);
          await page.goto(origin + ADMIN_PATH); assert.doesNotMatch(await page.locator('body').innerText(), /[\u0660-\u0669\u06f0-\u06f9]/);
          await context.close();
        }
      } finally { await browser.close(); }
    });
    await t.test('cleared or invalid links are hidden and private workflow downloads stay authenticated', async () => {
      await db.university.update({ where: { id: university.id }, data: { telegramCommunityUrl: null, websiteUrl: 'javascript:invalid' } });
      assert.equal((await request(`${ADMIN_PATH}/api/settings`, 'PATCH', { telegramSupportUrl: null }, auth)).status, 200);
      const page = await (await request(`/universities/${slug}`)).text(); assert.doesNotMatch(page, /مجتمع طلاب جامعة الاختبار \| eStudy24|data-official-website|example_support/);
      for (const type of Object.keys(payloads)) { assert.equal((await request(`${ADMIN_PATH}/api/integrations/n8n?type=${type}`)).status, 401); assert.equal((await request(`${ADMIN_PATH}/api/integrations/n8n?type=${type}`, 'GET', undefined, auth)).status, 200); }
      assert.equal((await request(`${ADMIN_PATH}/api/integrations/n8n?type=constructor`, 'GET', undefined, auth)).status, 422);
    });
    await t.test('category initialization preserves IDs, custom names, existing articles and repeated seed counts', async () => {
      const general = await db.articleCategory.findUniqueOrThrow({ where: { slug: 'general' } });
      const articles = await db.article.findMany({ where: { universityId: university.id }, orderBy: { id: 'asc' } });
      await db.articleCategory.update({ where: { id: general.id }, data: { name: 'عام' } });
      await db.$transaction(tx => seedNewsCategories(tx));
      const initialized = await db.articleCategory.findUniqueOrThrow({ where: { slug: 'general' } }); assert.equal(initialized.id, general.id); assert.equal(initialized.name, 'أخبار عامة');
      await db.articleCategory.update({ where: { id: general.id }, data: { name: 'اسم عام مخصص للإدارة' } });
      await db.$transaction(tx => seedNewsCategories(tx)); await db.$transaction(tx => seedNewsCategories(tx));
      assert.equal(await db.articleCategory.count({ where: { slug: { in: NEWS_CATEGORIES.map(category => category.slug) } } }), 9);
      assert.equal((await db.articleCategory.findUniqueOrThrow({ where: { slug: 'general' } })).name, 'اسم عام مخصص للإدارة');
      assert.deepEqual(await db.article.findMany({ where: { universityId: university.id }, orderBy: { id: 'asc' } }), articles);
      await db.articleCategory.update({ where: { id: general.id }, data: { name: 'أخبار عامة' } });
    });
    await t.test('scoped category imports, university filters, empty categories and editorial category locks', async () => {
      await db.university.update({ where: { id: university.id }, data: { autoPublishNews: false } });
      const imported: Record<string, string> = {};
      for (const category of NEWS_CATEGORIES) {
        const response = await request('/api/ingest/articles', 'POST', { ...news, source_id: `category-${category.slug}`, category: category.slug, title: `اختبار التصنيف ${category.slug}` }, headers); assert.equal(response.status, 201);
        const result = (await response.json()).results[0]; imported[category.slug] = result.article_id;
        const stored = await db.article.findUniqueOrThrow({ where: { id: result.article_id }, include: { category: true } }); assert.equal(stored.category!.slug, category.slug); assert.equal(stored.status, 'pending_review');
        await db.article.update({ where: { id: stored.id }, data: { status: 'published', publishedAt: new Date() } });
      }
      const general = await db.articleCategory.findUniqueOrThrow({ where: { slug: 'general' } });
      await db.article.create({ data: { universityId: other.id, title: 'خبر جامعة أخرى محظور في التصفية', categoryId: general.id, status: 'published', publishedAt: new Date(), origin: 'manual' } });
      for (const category of NEWS_CATEGORIES) {
        const api = await (await request(`/api/news?university=${slug}&category=${category.slug}`)).json(); assert.equal(api.total, 1); assert.equal(api.items[0].id, imported[category.slug]);
        const html = await (await request(`/universities/${slug}?section=news&category=${category.slug}`)).text(); assert.match(html, /تصنيفات أخبار الجامعة/); assert.match(html, new RegExp(`اختبار التصنيف ${category.slug}`)); assert.doesNotMatch(html, /خبر جامعة أخرى محظور في التصفية/);
      }
      const bad = await request('/api/ingest/articles', 'POST', { ...news, source_id: 'category-unknown', category: 'misspelled-category' }, headers); assert.equal(bad.status, 422); assert.equal((await bad.json()).results[0].error.code, 'UNKNOWN_CATEGORY');
      assert.equal(await db.articleCategory.count({ where: { slug: 'misspelled-category' } }), 0);
      const custom = await db.articleCategory.create({ data: { slug: `legacy-${suffix}`, name: 'تصنيف إداري قديم' } });
      assert.equal((await request('/api/ingest/articles', 'POST', { ...news, source_id: 'category-legacy', category: custom.slug }, headers)).status, 201);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${imported.admissions}`, 'PATCH', { categoryId: general.id }, auth)).status, 200);
      await request('/api/ingest/articles', 'POST', { ...news, source_id: 'category-admissions', title: 'عنوان جديد من المصدر', category: 'research' }, headers);
      assert.equal((await db.article.findUniqueOrThrow({ where: { id: imported.admissions } })).categoryId, general.id);
      assert.match(await (await request(`/universities/${slug}?section=news&category=admissions`)).text(), /لا توجد أخبار منشورة مطابقة/);
      if (existsSync(executable)) {
        const browser = await chromium.launch({ executablePath: executable, headless: true });
        try { for (const width of [390, 1440]) {
          const page = await browser.newPage({ viewport: { width, height: 900 } }); await page.goto(`${origin}/universities/${slug}?section=news`);
          const navigation = page.getByRole('navigation', { name: 'تصنيفات أخبار الجامعة', exact: true }); assert.equal(await navigation.getByRole('link').count(), 10);
          assert.equal(await page.getByRole('navigation', { name: 'أقسام الجامعة', exact: true }).getByRole('link').count(), 9);
          assert.equal(await navigation.getByRole('link', { name: 'الكل', exact: true }).getAttribute('aria-current'), 'page');
          await navigation.getByRole('link', { name: 'الدورات والتدريب', exact: true }).click(); await page.waitForURL('**category=training');
          assert.equal(await page.locator('form input[name="category"]').inputValue(), 'training');
          await navigation.getByRole('link', { name: 'الكل', exact: true }).focus(); await page.keyboard.press('Enter'); await page.waitForURL(url => !url.searchParams.has('category'));
          await page.close();
        } } finally { await browser.close(); }
      }
    });
    await t.test('bulk deletion enforces owner/CSRF, validates exact bounded IDs, rolls back stale selections and survives n8n reimport', async () => {
      const path = `${ADMIN_PATH}/api/articles/bulk-delete`;
      await db.university.update({ where: { id: university.id }, data: { autoPublishNews: true } });
      const batch = [0, 1, 2].map(index => ({ ...news, source_id: `bulk-${index}`, title: `أخبار اختبار الحذف الجماعي ${index}` }));
      const imported = await (await request('/api/ingest/batch', 'POST', { articles: batch }, headers)).json(); assert.equal(imported.counts.created, 3);
      const ids = imported.results.map((result: { article_id: string }) => result.article_id) as string[], selected = ids.slice(0, 2);
      assert.equal((await request(path, 'POST', { ids: selected })).status, 401);
      assert.equal((await request(path, 'POST', { ids: selected }, headers)).status, 401);
      assert.equal((await request(path, 'POST', { ids: selected }, editorAuth)).status, 403);
      assert.equal((await request(path, 'POST', { ids: selected }, { cookie: auth.cookie })).status, 403);
      assert.equal((await request(path, 'POST', { ids: selected }, { ...auth, origin: 'https://attacker.invalid' })).status, 403);
      for (const body of [{ ids: [] }, { ids: [ids[0], ids[0]] }, { ids: ['../all'] }, { ids: Array.from({ length: 101 }, (_, i) => `too-many-${i}`) }, { ids: selected, all: true }]) assert.equal((await request(path, 'POST', body, auth)).status, 422);
      const editsBefore = await db.articleEdit.count(); const auditsBefore = await db.auditLog.count();
      const invalid = await request(path, 'POST', { ids: [ids[0], 'missing-article'] }, auth); assert.equal(invalid.status, 409); assert.equal((await invalid.json()).error.code, 'STALE_SELECTION');
      assert.equal(await db.article.count({ where: { id: { in: ids }, deletedAt: null } }), 3); assert.equal(await db.articleEdit.count(), editsBefore); assert.equal(await db.auditLog.count(), auditsBefore);
      const universityBefore = await db.university.findUniqueOrThrow({ where: { id: university.id } }), adsBefore = await db.advertisement.count();
      const deleted = await request(path, 'POST', { ids: selected }, auth); assert.equal(deleted.status, 200); assert.deepEqual(await deleted.json(), { ids: selected, deleted_count: 2 });
      assert.equal(await db.article.count({ where: { id: { in: selected }, deletedAt: { not: null }, publicationLocked: true } }), 2);
      assert.equal((await db.article.findUniqueOrThrow({ where: { id: ids[2] } })).deletedAt, null);
      assert.equal(await db.articleEdit.count(), editsBefore + 2); assert.equal(await db.auditLog.count(), auditsBefore + 2);
      assert.equal((await request(path, 'POST', { ids: selected }, auth)).status, 409);
      assert.equal(await db.articleEdit.count(), editsBefore + 2);
      const repeated = await (await request('/api/ingest/batch', 'POST', { articles: batch.map(item => ({ ...item, title: item.title + ' تحديث المصدر' })) }, headers)).json(); assert.equal(repeated.counts.created, 0);
      assert.equal(await db.article.count({ where: { sourceId: source.id, originalArticleId: { in: batch.map(item => item.source_id) } } }), 3);
      assert.equal(await db.article.count({ where: { id: { in: selected }, deletedAt: { not: null } } }), 2);
      for (const id of selected) assert.equal((await request(`/api/news/${id}`)).status, 404);
      assert.equal((await request(`/api/news/${ids[2]}`)).status, 200);
      assert.equal((await request(`${ADMIN_PATH}/api/articles/${selected[0]}`, 'PATCH', { action: 'restore' }, auth)).status, 200); assert.equal((await request(`/api/news/${selected[0]}`)).status, 200);
      assert.deepEqual(await db.university.findUniqueOrThrow({ where: { id: university.id } }), universityBefore); assert.equal(await db.advertisement.count(), adsBefore);
    });
    await t.test('desktop/mobile selection, current-page select all, deselection, confirmation, failures and successful bulk deletion', { skip: !existsSync(executable) }, async () => {
      const browser = await chromium.launch({ executablePath: executable, headless: true });
      try {
        for (const width of [1440, 390]) {
          const marker = `BULKUI-${suffix}-${width}`;
          await db.article.createMany({ data: [1, 2, 3].map(index => ({ universityId: university.id, title: `${marker} خبر ${index}`, origin: 'manual' as const, discoveredAt: new Date(Date.now() + index), status: 'published' as const, publishedAt: new Date() })) });
          const fixtures = await db.article.findMany({ where: { universityId: university.id, title: { startsWith: marker } }, orderBy: [{ discoveredAt: 'desc' }, { id: 'desc' }] });
          const context = await browser.newContext({ viewport: { width, height: 900 } });
          const [name, value] = auth.cookie.split('='); await context.addCookies([{ name, value, url: origin + ADMIN_PATH }]);
          const page = await context.newPage(), url = `${origin}${ADMIN_PATH}/articles?search=${marker}&page_size=2`;
          await page.goto(url); const all = page.getByRole('checkbox', { name: 'تحديد جميع سجلات الصفحة الحالية', exact: true }), rows = page.getByRole('checkbox', { name: /^تحديد السجل:/ });
          assert.equal(await rows.count(), 2); await page.getByRole('combobox', { name: 'الإجراء الجماعي' }).selectOption('delete');
          await all.check(); assert.equal(await page.getByRole('button', { name: 'حذف المحدد (2)', exact: true }).count(), 1);
          await page.getByRole('button', { name: 'التالي', exact: true }).click(); await page.waitForURL('**page=2'); assert.equal(await rows.count(), 1); assert.equal(await rows.first().isChecked(), false);
          await page.goto(url); await page.getByRole('button', { name: 'مسح التحديد', exact: true }).click(); await rows.first().check(); assert.equal(await all.evaluate(el => (el as HTMLInputElement).indeterminate), true); await rows.first().uncheck(); assert.equal(await all.isChecked(), false);
          await all.check(); await all.uncheck(); assert.equal(await page.locator('input[type="checkbox"]:checked').count(), 0); await all.check();
          await page.getByRole('combobox', { name: 'الإجراء الجماعي' }).selectOption('delete');
          await page.getByRole('button', { name: 'حذف المحدد (2)', exact: true }).click(); await page.getByRole('dialog').waitFor(); assert.match(await page.getByRole('dialog').innerText(), /2/); await page.getByRole('dialog').getByRole('button', { name: 'إلغاء', exact: true }).click();
          assert.equal(await db.article.count({ where: { id: { in: fixtures.map(item => item.id) }, deletedAt: null } }), 3);
          await page.route('**/api/bulk/articles', route => route.request().postDataJSON()?.op === 'execute' ? route.abort() : route.continue());
          await page.getByRole('button', { name: 'حذف المحدد (2)', exact: true }).click(); await page.getByRole('dialog').waitFor(); await page.getByRole('button', { name: 'تأكيد التنفيذ على 2 سجلًا', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'تعذّر تأكيد النتيجة بسبب الاتصال' }).first().waitFor();
          assert.equal(await db.article.count({ where: { id: { in: fixtures.map(item => item.id) }, deletedAt: null } }), 3);
          await page.unroute('**/api/bulk/articles');
          const response = page.waitForResponse(response => response.url().endsWith('/api/bulk/articles') && response.request().postDataJSON()?.op === 'execute');
          await page.getByRole('button', { name: 'تأكيد التنفيذ على 2 سجلًا', exact: true }).click(); assert.equal((await response).status(), 200);
          await page.getByRole('status').filter({ hasText: 'تم تنفيذ حذف المحدد على 2' }).waitFor(); await page.getByText('تم تحديد 0 سجلًا', { exact: true }).waitFor();
          await page.waitForFunction(() => document.querySelectorAll('tbody input[type="checkbox"]').length === 1); assert.equal(await rows.first().isChecked(), false);
          assert.equal(await db.article.count({ where: { id: { in: fixtures.slice(0, 2).map(item => item.id) }, deletedAt: { not: null } } }), 2); assert.equal((await db.article.findUniqueOrThrow({ where: { id: fixtures[2].id } })).deletedAt, null);
          await page.goto(`${origin}${ADMIN_PATH}/articles?search=${marker}&deleted=true`); assert.equal(await page.getByRole('option', { name: 'حذف المحدد', exact: true }).count(), 0);
          await context.close();
        }
        const context = await browser.newContext(); const [name, value] = editorAuth.cookie.split('='); await context.addCookies([{ name, value, url: origin + ADMIN_PATH }]); const page = await context.newPage(); await page.goto(`${origin}${ADMIN_PATH}/articles`); assert.equal(await page.getByRole('option', { name: 'حذف المحدد', exact: true }).count(), 0); await context.close();
      } finally { await browser.close(); }
    });
    await t.test('logo seed is repeatable and preserves uploaded logos and configured policies', async () => {
      const before = await db.university.findUniqueOrThrow({ where: { id: university.id } }); await seedUniversityLogos(db); await seedUniversityLogos(db);
      assert.deepEqual(await db.university.findUniqueOrThrow({ where: { id: university.id } }), before);
    });
  } finally {
    server.kill(); if (server.exitCode === null) await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 10000))]); if (server.exitCode === null) server.kill('SIGKILL');
    const ids = [university.id, other.id];
    await db.ingestionLog.deleteMany({ where: { sourceId: source.id } });
    await db.contentSync.deleteMany({ where: { sourceId: source.id } });
    await db.article.deleteMany({ where: { universityId: { in: ids } } });
    await db.managedLink.deleteMany({ where: { universityId: { in: ids } } }); await db.event.deleteMany({ where: { universityId: { in: ids } } }); await db.program.deleteMany({ where: { universityId: { in: ids } } });
    await db.universityApiKey.deleteMany({ where: { universityId: { in: ids } } }); await db.ingestionSource.deleteMany({ where: { universityId: { in: ids } } }); await db.university.deleteMany({ where: { id: { in: ids } } });
    await db.adminBulkSelection.deleteMany({ where: { administratorId: { in: [owner.id, editor.id] } } });
    await db.auditLog.deleteMany({ where: { administratorId: { in: [owner.id, editor.id] } } }); await db.administrator.deleteMany({ where: { id: { in: [owner.id, editor.id] } } });
    if (priorSettings) { const { id: _id, ...data } = priorSettings; await db.siteSettings.update({ where: { id: 'main' }, data }); } else await db.siteSettings.deleteMany({ where: { id: 'main' } });
    await db.$disconnect();
  }
});
