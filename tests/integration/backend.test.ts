import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { ADMIN_PATH, csrfToken, hashPassword, tokenDigest } from "../../src/server/security.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;
test("PostgreSQL + HTTP: authentication, authorization, ingestion deduplication, and public visibility", { skip: !databaseUrl, timeout: 240000 }, async t => {
  assert.match(new URL(databaseUrl!).pathname, /_test$/, "TEST_DATABASE_URL must use a dedicated database whose name ends in _test.");
  const suffix = randomBytes(6).toString("hex");
  const slug = `it-${suffix}`;
  const secret = randomBytes(48).toString("hex");
  const apiKey = randomBytes(48).toString("hex");
  const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const address = listener.address(); assert.ok(address && typeof address === "object"); const port = address.port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const origin = `http://localhost:${port}`;
  const environment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl!, AUTH_SECRET: secret, INGEST_API_KEY: apiKey, APP_URL: origin, NODE_ENV: "development", TRUST_PROXY: "false" };
  const migrated = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: environment, encoding: "utf8" });
  assert.equal(migrated.status, 0, "Test database migration failed. Run prisma migrate deploy against TEST_DATABASE_URL.");
  const { createDatabase } = await import("../../src/server/database-client.ts");
  const db = createDatabase(databaseUrl);
  const university = await db.university.create({ data: { slug, name: `اختبار ${suffix}` } });
  const source = await db.ingestionSource.create({ data: { key: `${slug}-rss`, name: "مصدر اختبار", universityId: university.id, url: "https://uqu.edu.sa/App/Rss" } });
  const password = `test-only-password-${suffix}`;
  const admin = await db.administrator.create({ data: { email: `${suffix}@test.invalid`, name: "مدير الاختبار", passwordHash: await hashPassword(password), role: "owner" } });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", String(port)], { env: environment, stdio: "ignore" });
  const requestIds: string[] = [];
  let articleId = "";
  let cookie = "";
  let csrf = "";
  const payload = { university_slug: slug, source_id: "179777", source_url: "https://uqu.edu.sa/App/News/179777", title: "عنوان المصدر", summary: "ملخص المصدر", content_text: "محتوى المصدر", published_at: "2026-10-18T14:06:32Z", image_urls: [], pdf_urls: [], registration_links: [], category: "training" };
  async function post(path: string, body: unknown, headers: Record<string, string> = {}) { return fetch(origin + path, { method: "POST", headers: { "content-type": "application/json", origin, ...headers }, body: JSON.stringify(body), redirect: "manual" }); }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) throw new Error("Test Next.js server exited before startup.");
      try { const result = await fetch(origin + ADMIN_PATH, { redirect: "manual", signal: AbortSignal.timeout(1000) }); if (result.status === 307) { ready = true; break; } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, "Private route did not become ready.");
    await t.test("private pages redirect and unauthorized operations cannot modify data", async () => {
      for (const path of [ADMIN_PATH, `${ADMIN_PATH}/articles`, `${ADMIN_PATH}/universities`]) { const response = await fetch(origin + path, { redirect: "manual" }); assert.equal(response.status, 307); assert.ok(response.headers.get("location")?.endsWith(`${ADMIN_PATH}/login`)); assert.match(response.headers.get("x-robots-tag") || "", /noindex/); }
      assert.equal((await post(`${ADMIN_PATH}/api/universities`, { name: "forbidden" })).status, 401);
      assert.equal((await post("/api/ingest/articles", payload)).status, 401);
      assert.equal(await db.article.count({ where: { sourceId: source.id } }), 0);
    });
    await t.test("login creates a scoped HTTP-only SameSite session; CSRF is enforced", async () => {
      const response = await post(`${ADMIN_PATH}/api/auth/login`, { email: admin.email, password });
      assert.equal(response.status, 200);
      const setCookie = response.headers.get("set-cookie") || "";
      assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=strict/i); assert.ok(setCookie.includes(`Path=${ADMIN_PATH}`));
      cookie = setCookie.split(";")[0]; const rawToken = cookie.slice(cookie.indexOf("=") + 1);
      csrf = csrfToken(tokenDigest(rawToken, secret), secret);
      assert.equal((await post(`${ADMIN_PATH}/api/articles`, {}, { cookie })).status, 403);
      assert.equal((await post("/api/ingest/articles", payload, { cookie })).status, 401);
    });
    await t.test("invalid ingestion is rejected and logged", async () => {
      const response = await post("/api/ingest/articles", { ...payload, title: "", status: "published" }, { authorization: `Bearer ${apiKey}` });
      assert.equal(response.status, 422); const body = await response.json(); requestIds.push(body.request_id); assert.equal(body.counts.rejected, 1);
      assert.ok(await db.ingestionLog.count({ where: { requestId: body.request_id, outcome: "rejected" } }));
    });
    await t.test("concurrent duplicate imports create exactly one pending article", async () => {
      const responses = await Promise.all([post("/api/ingest/articles", payload, { authorization: `Bearer ${apiKey}` }), post("/api/ingest/articles", payload, { authorization: `Bearer ${apiKey}` }), post("/api/ingest/articles", payload, { authorization: `Bearer ${apiKey}` })]);
      for (const response of responses) { assert.ok([200, 201].includes(response.status)); const body = await response.json(); requestIds.push(body.request_id); articleId = body.results[0].article_id; }
      assert.equal(await db.article.count({ where: { sourceId: source.id, originalArticleId: "179777" } }), 1);
      assert.equal((await db.article.findUniqueOrThrow({ where: { id: articleId } })).status, "pending_review");
      assert.equal((await fetch(`${origin}/api/news/${articleId}`)).status, 404);
    });
    await t.test("editorial changes and publishing survive reimport", async () => {
      const changed = await fetch(`${origin}${ADMIN_PATH}/api/articles/${articleId}`, { method: "PATCH", headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ title: "عنوان المدير", status: "published" }) });
      assert.equal(changed.status, 200);
      const reimport = await post("/api/ingest/articles", { ...payload, title: "عنوان جديد من المصدر", summary: "ملخص محدّث" }, { authorization: `Bearer ${apiKey}` });
      const body = await reimport.json(); requestIds.push(body.request_id); assert.equal(body.counts.updated, 1);
      const row = await db.article.findUniqueOrThrow({ where: { id: articleId } }); assert.equal(row.title, "عنوان المدير"); assert.equal(row.summary, "ملخص محدّث"); assert.equal(row.status, "published");
      const visible = await fetch(`${origin}/api/news/${articleId}`); assert.equal(visible.status, 200); const publicData = await visible.json(); assert.equal("sourceSnapshot" in publicData, false); assert.equal("editedFields" in publicData, false);
      const deleted = await fetch(`${origin}${ADMIN_PATH}/api/articles/${articleId}`, { method: "DELETE", headers: { cookie, origin, "x-csrf-token": csrf } }); assert.equal(deleted.status, 200);
      assert.equal((await fetch(`${origin}/api/news/${articleId}`)).status, 404);
      assert.equal((await db.article.findUniqueOrThrow({ where: { id: articleId } })).status, "published");
      await fetch(`${origin}${ADMIN_PATH}/api/articles/${articleId}`, { method: "PATCH", headers: { cookie, origin, "content-type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ action: "restore" }) });
      assert.equal((await fetch(`${origin}/api/news/${articleId}`)).status, 200);
    });
    await t.test("phase three: platform homepage isolation, multi-placement ads, visitor deduplication and settings", async () => {
      const postSlug = `platform-${suffix}`;
      const postTitle = `eStudy24 fixture ${suffix}`;
      let platformId = "";
      let adId = "";
      const createdPlacements: string[] = [];
      const priorSettings = await db.siteSettings.findUnique({ where: { id: "main" } });
      const nonce = randomUUID();
      const visitKey = tokenDigest(`visit:${nonce}`, secret);
      try {
        const created = await post(`${ADMIN_PATH}/api/platform_posts`, { slug: postSlug, type: "guide", title: postTitle, summary: "دليل تعليمي للاختبار", content: "محتوى eStudy24 فقط", status: "published" }, { cookie, "x-csrf-token": csrf });
        assert.equal(created.status, 201); platformId = (await created.json()).id;
        const content = await fetch(`${origin}/api/content/${postSlug}`); assert.equal(content.status, 200);
        assert.equal("university" in await content.json(), false);
        assert.equal((await fetch(`${origin}/api/content?university=${slug}`)).status, 422);
        assert.equal((await fetch(`${origin}/api/news?scope=homepage`)).status, 422);
        assert.equal((await fetch(`${origin}/api/news/${articleId}?university=other-university`)).status, 404);
        const homepage = await fetch(origin + "/"); assert.equal(homepage.status, 200);
        const homepageHtml = await homepage.text(); assert.ok(homepageHtml.includes(postTitle)); assert.equal(homepageHtml.includes("عنوان المدير"), false); assert.equal(homepageHtml.includes(ADMIN_PATH), false);
        const universityPage = await fetch(`${origin}/universities/${slug}`); assert.equal(universityPage.status, 200); assert.ok((await universityPage.text()).includes("عنوان المدير"));

        for (const placement of ["homepage_banner", "sidebar"]) {
          if (!await db.advertisementPlacement.findUnique({ where: { id: placement } })) { await db.advertisementPlacement.create({ data: { id: placement, name: placement } }); createdPlacements.push(placement); }
        }
        const adInput = { title: `Ad ${suffix}`, description: "اختبار", destinationUrl: "https://estudy24.com", global: true, placementIds: ["homepage_banner", "sidebar"], status: "active" };
        const ad = await post(`${ADMIN_PATH}/api/ads`, adInput, { cookie, "x-csrf-token": csrf }); assert.equal(ad.status, 201); adId = (await ad.json()).id;
        for (const placement of adInput.placementIds) { const list = await fetch(`${origin}/api/ads?scope=homepage&placement=${placement}`); assert.ok((await list.json()).items.some((item: { id: string }) => item.id === adId)); }
        const paused = await fetch(`${origin}${ADMIN_PATH}/api/ads/${adId}`, { method: "PATCH", headers: { cookie, origin, "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ ...adInput, status: "paused" }) }); assert.equal(paused.status, 200);
        const hiddenAds = await fetch(`${origin}/api/ads?placement=sidebar`); assert.equal((await hiddenAds.json()).items.some((item: { id: string }) => item.id === adId), false);

        const settingsBody = { visitorCounterEnabled: true, visitorCounterLabel: "زيارات الاختبار", visitorBaseline: 0, visitorBaselineVerified: false, visitorBaselineEvidence: null, visitorBaselineAsOf: null };
        const setSettings = (body: unknown, headers: Record<string, string> = {}) => fetch(`${origin}${ADMIN_PATH}/api/settings`, { method: "PATCH", headers: { origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
        assert.equal((await setSettings(settingsBody)).status, 401);
        assert.equal((await setSettings(settingsBody, { cookie })).status, 403);
        assert.equal((await setSettings(settingsBody, { cookie, "x-csrf-token": csrf })).status, 200);
        const before = await (await fetch(`${origin}/api/visitors`)).json();
        const browser = { "user-agent": "Mozilla/5.0 Chrome/130.0 Safari/537.36" };
        const firstVisit = await post("/api/visitors", { nonce }, browser); assert.equal(firstVisit.status, 200);
        assert.equal((await firstVisit.json()).counted, true);
        const visitCookie = (firstVisit.headers.get("set-cookie") || "").split(";")[0]; assert.ok(visitCookie.startsWith("campus_visit="));
        const refresh = await post("/api/visitors", { nonce }, { ...browser, cookie: visitCookie }); assert.equal((await refresh.json()).counted, false);
        const newTab = await post("/api/visitors", { nonce: randomUUID() }, { ...browser, cookie: visitCookie }); assert.equal((await newTab.json()).counted, false);
        const bot = await post("/api/visitors", { nonce: randomUUID() }, { "user-agent": "Googlebot/2.1" }); assert.equal((await bot.json()).counted, false);
        const after = await (await fetch(`${origin}/api/visitors`)).json(); assert.equal(after.count, before.count + 1); assert.equal("visitorBaselineEvidence" in after, false);
        assert.equal((await setSettings({ ...settingsBody, visitorCounterEnabled: false }, { cookie, "x-csrf-token": csrf })).status, 200);
        assert.equal((await (await fetch(`${origin}/api/visitors`)).json()).enabled, false);
        const disabled = await post("/api/visitors", { nonce: randomUUID() }, browser); assert.equal((await disabled.json()).counted, false);
      } finally {
        await db.advertisement.deleteMany({ where: { id: adId || "missing-fixture" } });
        await db.platformPost.deleteMany({ where: { id: platformId || "missing-fixture" } });
        await db.advertisementPlacement.deleteMany({ where: { id: { in: createdPlacements } } });
        const dedup = await db.visitDedup.findUnique({ where: { key: visitKey } });
        if (dedup) {
          const day = new Date(`${new Date(dedup.expiresAt.getTime() - 1800000).toISOString().slice(0, 10)}T00:00:00Z`);
          await db.visitorDaily.update({ where: { day }, data: { visits: { decrement: 1 } } });
          await db.visitDedup.delete({ where: { key: visitKey } });
        }
        if (priorSettings) { const { id: _id, ...prior } = priorSettings; await db.siteSettings.update({ where: { id: "main" }, data: prior }); }
        else await db.siteSettings.deleteMany({ where: { id: "main" } });
      }
    });
    await t.test("logout invalidates the database session", async () => { assert.equal((await post(`${ADMIN_PATH}/api/auth/logout`, {}, { cookie, "x-csrf-token": csrf })).status, 200); const response = await fetch(`${origin}${ADMIN_PATH}/api/articles`, { headers: { cookie } }); assert.equal(response.status, 401); });
  } finally {
    if (server.exitCode === null) { server.kill(); await Promise.race([once(server, "exit"), new Promise(resolve => setTimeout(resolve, 5000))]); }
    await db.ingestionLog.deleteMany({ where: { OR: [{ sourceId: source.id }, { requestId: { in: requestIds } }] } });
    await db.article.deleteMany({ where: { sourceId: source.id } });
    await db.auditLog.deleteMany({ where: { administratorId: admin.id } });
    await db.administrator.delete({ where: { id: admin.id } });
    await db.ingestionSource.delete({ where: { id: source.id } });
    await db.university.delete({ where: { id: university.id } });
    await db.$disconnect();
  }
});
