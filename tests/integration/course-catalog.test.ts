import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { parseCourse, CatalogSourceError } from '../../src/server/course-source.ts';
import { syncCourseCatalog, publicCourseCatalog, manageCatalog, seedCourseMappings, catalogAdministration } from '../../src/server/course-catalog-service.ts';
import { bulkOperation } from '../../src/server/bulk-service.ts';
import { VERIFIED_COURSE_MAPPINGS } from '../../src/lib/course-catalog.ts';
import { ADMIN_PATH, csrfToken, tokenDigest, hashPassword } from '../../src/server/security.ts';
const url = process.env.TEST_DATABASE_URL;
test('Course catalog: staged synchronization, explicit mappings, permissions and public browsing', { skip: !url, timeout: 600000 }, async t => {
  assert.match(new URL(url!).pathname, /_test$/); assert.equal(new URL(url!).hostname, '127.0.0.1');
  const { createDatabase } = await import('../../src/server/database-client.ts');
  const migrate = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' }); assert.equal(migrate.status,0,migrate.stderr);
  const db = createDatabase(url); t.after(() => db.$disconnect());
  const tag = randomBytes(5).toString('hex'), secret = randomBytes(48).toString('hex'), password = randomBytes(18).toString('base64url');
  const madeUniversities: string[] = [];
  for (const m of VERIFIED_COURSE_MAPPINGS) { if (!await db.university.findUnique({ where: { slug: m.slug } })) { const u = await db.university.create({ data: { slug: m.slug, name: `جامعة اختبار ${m.slug} ${tag}` } }); madeUniversities.push(u.id); } }
  const university = await db.university.findUniqueOrThrow({ where: { slug: 'uqu' } }), other = await db.university.findUniqueOrThrow({ where: { slug: 'imamu' } });
  const actors = await Promise.all(['owner','editor','ambassador'].map(async role => db.administrator.create({ data: { email: `catalog-${role}-${tag}@test.invalid`, name: `اختبار ${role}`, role: role as 'owner'|'editor'|'ambassador', universityId: role === 'ambassador' ? university.id : null, passwordHash: await hashPassword(password) } })));
  const sessions = await Promise.all(actors.map(a => db.adminSession.create({ data: { administratorId: a.id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now()+86400000) } })));
  const owner = { id: actors[0].id, sessionId: sessions[0].id }, editor = { id: actors[1].id, sessionId: sessions[1].id }, ambassador = { id: actors[2].id, sessionId: sessions[2].id };
  const raw = (id: number, categories = [227], title = `شرح اختبار ${tag} ${id}`) => ({ id, status: 'publish', title: { rendered: title }, excerpt: { rendered: '<p>شرح مفهوم تعليمي.</p><script>window.bad=true</script>' }, slug: `test-${id}`, link: `https://estudy24.com/courses/test-${id}/`, modified_gmt: '2026-10-27T10:00:00', 'course-category': categories, ...(id===1&&{featured_media:10,_embedded:{'wp:featuredmedia':[{id:10,source_url:'https://estudy24.com/wp-content/uploads/local-fixture.png'}]}}) });
  const categories = [227,375,310].map(id => ({ id, name: id === 310 ? 'موضوع عام' : `جامعة المصدر ${id}`, slug: `category-${id}`, parent: 0, count: 10 }));
  let inventory = { categories, courses: Array.from({ length: 15 }, (_, i) => parseCourse(raw(i+1, i === 0 ? [227,310] : i === 1 ? [227,375] : i === 2 ? [310] : i === 3 ? [375] : [227], i === 4 ? 'أسس الإحصاء Calculus' : `شرح اختبار ${tag} ${i+1}`))) };
  const originalCourses = [...inventory.courses];
  let child: ReturnType<typeof spawn> | undefined;
  const previousSettings = await db.siteSettings.findUnique({ where: { id: 'main' }, select: { telegramSupportUrl: true } });
  try {
    await t.test('seven verified mappings initialize idempotently and preserve Owner edits', async () => {
      await seedCourseMappings(db); await seedCourseMappings(db); assert.equal(await db.courseUniversityMapping.count(), 7);
      await db.courseUniversityMapping.update({ where: { categoryId: 227 }, data: { enabled: false } }); await seedCourseMappings(db); assert.equal((await db.courseUniversityMapping.findUniqueOrThrow({ where: { categoryId: 227 } })).enabled, false);
      await db.courseUniversityMapping.update({ where: { categoryId: 227 }, data: { enabled: true } });
    });
    await t.test('disabled synchronization fetches nothing; Owner alone can configure and synchronize', async () => {
      let fetched = false; await assert.rejects(() => syncCourseCatalog(db, { actor: owner, inventory: async () => { fetched = true; return inventory; } })); assert.equal(fetched,false);
      for (const actor of [editor,ambassador]) { await assert.rejects(() => manageCatalog(db, actor, { action: 'settings', enabled: true })); await assert.rejects(() => syncCourseCatalog(db, { actor, inventory: async () => inventory })); await assert.rejects(() => catalogAdministration(db, actor, new URLSearchParams())); }
      await manageCatalog(db, owner, { action: 'settings', enabled: true }); const run = await syncCourseCatalog(db, { actor: owner, inventory: async () => inventory }); assert.equal(run.fetched,15); assert.equal(run.unknown,1); assert.equal(run.ambiguous,1); assert.equal(run.mapped,13);
      const result = await publicCourseCatalog(db,new URLSearchParams('university=uqu')); assert.equal(result.total,12); assert.ok(result.items.every(c=>c.university?.slug==='uqu')); assert.equal((await publicCourseCatalog(db,new URLSearchParams('university=imamu'))).total,1);
      assert.equal(await db.academicProgram.count({ where: { sourceSystem: 'estudy24' } }),0);
    });
    await t.test('repeated sync is idempotent, updates source changes and never exposes private source fields', async () => {
      await syncCourseCatalog(db,{ inventory: async () => inventory }); assert.equal(await db.courseExplanation.count(),15);
      inventory = { ...inventory, courses: inventory.courses.map(c=>c.wordpressId===1 ? parseCourse(raw(1,[227,310],'شرح محدث Updated')) : c) }; await syncCourseCatalog(db,{ inventory: async () => inventory });
      const result = await publicCourseCatalog(db,new URLSearchParams('university=uqu&search=updated')); assert.equal(result.total,1); assert.equal(result.items[0].title,'شرح محدث Updated');
      const body = JSON.stringify(result); for (const key of ['sourceTitle','categoryIds','wordpressId','leaseToken','sourceModifiedAt','searchText','passwordHash','keyHash']) assert.ok(!body.includes(`"${key}"`));
      assert.equal((await publicCourseCatalog(db,new URLSearchParams('search=اسس الاحصاء'))).total,1); assert.equal((await publicCourseCatalog(db,new URLSearchParams('search=CALCULUS'))).total,1);
      const first = await publicCourseCatalog(db,new URLSearchParams('university=uqu&page_size=5')); const second=await publicCourseCatalog(db,new URLSearchParams('university=uqu&page_size=5&page=2')); assert.equal(first.items.length,5); assert.equal(new Set([...first.items,...second.items].map(c=>c.id)).size,10);
      await assert.rejects(()=>publicCourseCatalog(db,new URLSearchParams('status=draft'))); await assert.rejects(()=>publicCourseCatalog(db,new URLSearchParams('page=-1')));
    });
    await t.test('network and partial-source failures preserve every catalog record and the last successful timestamp', async () => {
      const before = await db.courseExplanation.findMany({ orderBy:{id:'asc'} }), settings=await db.courseCatalogSettings.findUniqueOrThrow({where:{id:'main'}});
      await assert.rejects(()=>syncCourseCatalog(db,{inventory:async()=>{throw new CatalogSourceError('SOURCE_INCOMPLETE');}}));
      assert.deepEqual(await db.courseExplanation.findMany({orderBy:{id:'asc'}}),before); assert.equal((await db.courseCatalogSettings.findUniqueOrThrow({where:{id:'main'}})).lastSuccessfulSyncAt!.getTime(), settings.lastSuccessfulSyncAt!.getTime());
      assert.equal((await db.courseSyncRun.findFirstOrThrow({orderBy:{startedAt:'desc'}})).errorCode,'SOURCE_INCOMPLETE');
    });
    await t.test('complete inventory reconciles safe removals and reappearance; large or empty removals are quarantined', async () => {
      const full=inventory; inventory={...inventory,courses:inventory.courses.filter(c=>c.wordpressId!==1)}; const result=await syncCourseCatalog(db,{inventory:async()=>inventory}); assert.equal(result.removed,1); assert.equal((await db.courseExplanation.findUniqueOrThrow({where:{wordpressId:1}})).sourcePublished,false); assert.equal((await publicCourseCatalog(db,new URLSearchParams('search=updated'))).total,0);
      inventory=full; await syncCourseCatalog(db,{inventory:async()=>inventory}); assert.equal((await publicCourseCatalog(db,new URLSearchParams('search=updated'))).total,1);
      for (const courses of [inventory.courses.slice(0,5), []]) await assert.rejects(()=>syncCourseCatalog(db,{inventory:async()=>({...inventory,courses})}));
      assert.equal(await db.courseExplanation.count({where:{sourcePublished:true}}),15); assert.equal((await db.courseSyncRun.findFirstOrThrow({orderBy:{startedAt:'desc'}})).status,'quarantined');
      const guarded=await db.courseSyncRun.findFirstOrThrow({where:{status:'quarantined',fetched:5},orderBy:{startedAt:'desc'}});
      await assert.rejects(()=>syncCourseCatalog(db,{actor:owner,inventory:async()=>({...inventory,courses:inventory.courses.slice(0,5)}),approval:{runId:guarded.id,confirmation:'wrong'}}));
      await syncCourseCatalog(db,{actor:owner,inventory:async()=>({...inventory,courses:inventory.courses.slice(0,5)}),approval:{runId:guarded.id,confirmation:'تأكيد تسوية 10 شرح'}}); assert.equal(await db.courseExplanation.count({where:{sourcePublished:true}}),5);
      await syncCourseCatalog(db,{inventory:async()=>inventory}); assert.equal(await db.courseExplanation.count({where:{sourcePublished:true}}),15);
    });
    await t.test('database failure rolls back complete replacement and audit; an active lease blocks concurrent triggers', async () => {
      const before=await db.courseExplanation.findUniqueOrThrow({where:{wordpressId:1}});
      await db.$executeRawUnsafe(`CREATE FUNCTION "catalog_fail_${tag}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'local fixture rollback'; END $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER "catalog_fail_${tag}" BEFORE UPDATE ON "CourseExplanation" FOR EACH ROW EXECUTE FUNCTION "catalog_fail_${tag}"()`);
      try { await assert.rejects(()=>syncCourseCatalog(db,{inventory:async()=>({...inventory,courses:[parseCourse(raw(1,[227],'must roll back')),...inventory.courses.slice(1)]})})); assert.deepEqual(await db.courseExplanation.findUniqueOrThrow({where:{wordpressId:1}}),before); }
      finally { await db.$executeRawUnsafe(`DROP TRIGGER "catalog_fail_${tag}" ON "CourseExplanation"`); await db.$executeRawUnsafe(`DROP FUNCTION "catalog_fail_${tag}"()`); }
      let release!:()=>void; const pending = new Promise<void>(r=>{release=r;}); let entered!:()=>void; const started=new Promise<void>(r=>{entered=r;}); const first=syncCourseCatalog(db,{inventory:async()=>{entered();await pending;return inventory;}}); await started;
      await assert.rejects(()=>syncCourseCatalog(db,{inventory:async()=>inventory})); release(); await first;
    });
    await t.test('mapping changes immediately re-evaluate catalog; shared bulk actions remain Owner-only and scoped', async () => {
      const mapping=await db.courseUniversityMapping.findUniqueOrThrow({where:{categoryId:227}});
      for (const actor of [editor,ambassador]) await assert.rejects(()=>manageCatalog(db,actor,{action:'mapping',categoryId:227,universityId:other.id,enabled:true}));
      await assert.rejects(()=>manageCatalog(db,owner,{action:'mapping',categoryId:99999,universityId:university.id,enabled:true}));
      const p=await bulkOperation(db,'course-mappings',{op:'preview',action:'disable',selection:{mode:'ids',ids:[mapping.id],filters:{university:'uqu'}}},owner.id,owner.sessionId) as {token:string;confirmation:string};
      await bulkOperation(db,'course-mappings',{op:'execute',token:p.token,confirmation:p.confirmation},owner.id,owner.sessionId); assert.equal((await publicCourseCatalog(db,new URLSearchParams('university=uqu'))).total,0);
      await manageCatalog(db,owner,{action:'mapping',categoryId:227,universityId:university.id,enabled:true}); assert.equal((await publicCourseCatalog(db,new URLSearchParams('university=uqu'))).total,12);
      await assert.rejects(()=>bulkOperation(db,'course-mappings',{op:'snapshot',filters:{}},ambassador.id,ambassador.sessionId));
      assert.ok(await db.auditLog.count({where:{action:'course_mapping_saved',administratorId:owner.id}}));
    });
    await t.test('revoked Owner sessions cannot commit an in-flight manual synchronization',async()=>{
      const session=await db.adminSession.create({data:{administratorId:owner.id,tokenHash:randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+60000)}});
      let release!:()=>void,entered!:()=>void;const hold=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});
      const pending=syncCourseCatalog(db,{actor:{id:owner.id,sessionId:session.id},inventory:async()=>{entered();await hold;return inventory;}});const rejected=assert.rejects(pending);await started;await db.adminSession.delete({where:{id:session.id}});release();await rejected;
      assert.equal(await db.courseExplanation.count({where:{sourcePublished:true}}),15);
    });
    const listener=createServer().listen(0,'127.0.0.1');await once(listener,'listening');const address=listener.address();assert.ok(address&&typeof address==='object');const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const origin=`http://localhost:${port}`;
    child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p',String(port)],{env:{...process.env,DATABASE_URL:url,AUTH_SECRET:secret,APP_URL:origin,NODE_ENV:'development',TRUST_PROXY:'true'},stdio:'ignore'});
    const request=(path:string,method='GET',body?:unknown,auth:Record<string,string>={})=>fetch(origin+path,{method,headers:{origin,'content-type':'application/json','x-forwarded-for':`198.51.100.${parseInt(tag.slice(0,2),16)%200+1}`,...auth},...(body!==undefined&&{body:JSON.stringify(body)}),redirect:'manual'});
    let ready=false;for(let i=0;i<120;i++){try{if((await request(ADMIN_PATH)).status===307){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
    async function login(email:string){const response=await request(`${ADMIN_PATH}/api/auth/login`,'POST',{email,password});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie')!.split(';')[0];return{cookie,'x-csrf-token':csrfToken(tokenDigest(cookie.slice(cookie.indexOf('=')+1),secret),secret)};}
    const auth=await login(actors[0].email), editorAuth=await login(actors[1].email),ambAuth=await login(actors[2].email);
    await t.test('HTTP enforces authentication, CSRF, strict commands and denies Editors/Ambassadors global operations',async()=>{
      const path=`${ADMIN_PATH}/api/course-catalog`;
      assert.equal((await request(path,'POST',{action:'sync'})).status,401);
      assert.equal((await request(path,'POST',{action:'sync'},{cookie:auth.cookie})).status,403);
      for(const a of [editorAuth,ambAuth]) { assert.equal((await request(path,'POST',{action:'settings',enabled:false},a)).status,403); assert.equal((await request(`${ADMIN_PATH}/course-catalog`,'GET',undefined,a)).status,404); }
      assert.equal((await request(path,'POST',{action:'sync',universityId:other.id},auth)).status,422);
      assert.equal((await request(path,'POST',{action:'settings',enabled:false},auth)).status,200);assert.equal((await request(path,'POST',{action:'sync'},auth)).status,409);
      const result=await request('/api/courses?university=uqu&search=updated');assert.equal(result.status,200);assert.equal((await result.json()).total,1);
    });
    const executable='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    await t.test('desktop/mobile catalog, university tab, homepage promotion, local search, images and Telegram configuration', {skip:!existsSync(executable),timeout:240000},async()=>{
      const browser=await chromium.launch({executablePath:executable,headless:true});
      try{for(const mobile of [false,true]){
        await db.siteSettings.upsert({where:{id:'main'},create:{id:'main',telegramSupportUrl:null},update:{telegramSupportUrl:null}});
        const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});const page=await context.newPage();page.setDefaultTimeout(60000);const browserApiRequests:string[]=[];page.on('request',r=>{if(r.url().includes('estudy24.com/wp-json/'))browserApiRequests.push(r.url());});await page.route('https://estudy24.com/**',route=>route.abort());
        await page.goto(origin+'/');const promotion=page.getByRole('link',{name:'استعرض الشروحات',exact:true});assert.equal(await promotion.getAttribute('href'),'/courses');try{await Promise.all([page.waitForURL(origin+'/courses'),promotion.click()]);await page.getByRole('heading',{name:'ابحث عن شرح مادتك الجامعية'}).waitFor();}catch(error){await page.screenshot({path:`.npm-logs/course-navigation-${mobile?'mobile':'desktop'}.png`,fullPage:true});console.log(JSON.stringify({event:'local_catalog_navigation_failed',url:page.url(),headings:await page.locator('h1,h2').allTextContents()}));throw error;}
        assert.equal(await page.getByRole('link',{name:/لم تجد شرح مادتك/}).count(),0);await page.goto(origin+'/courses?search=updated');await page.getByRole('heading',{name:'شرح محدث Updated',exact:true}).waitFor();await page.locator('svg[aria-label="شرح من eStudy24"]').waitFor();assert.equal(await page.locator('img[src*="local-fixture"]').count(),0);await page.getByLabel('الجامعة',{exact:true}).selectOption('uqu');await page.getByLabel('اسم المادة أو الشرح').fill('CALCULUS');await page.getByRole('button',{name:'بحث',exact:true}).click();await page.getByRole('heading',{name:'أسس الإحصاء Calculus',exact:true}).waitFor();
        assert.equal(await page.getByRole('link',{name:'عرض الشرح',exact:true}).count(),1);assert.equal(await page.getByRole('link',{name:'عرض الشرح',exact:true}).getAttribute('target'),'_blank');assert.match(await page.getByRole('link',{name:'عرض الشرح',exact:true}).getAttribute('rel')||'',/noopener noreferrer/);
        await db.siteSettings.update({where:{id:'main'},data:{telegramSupportUrl:'https://t.me/campus_test_support'}});
        await page.goto(`${origin}/universities/uqu?section=courses`);await page.getByRole('heading',{name:'شروحات المواد الدراسية',exact:true}).waitFor();assert.equal(await page.getByRole('navigation',{name:'أقسام الجامعة',exact:true}).getByRole('link').count(),10);
        const support=page.getByRole('link',{name:/لم تجد شرح مادتك/});assert.equal(await support.getAttribute('href'),'https://t.me/campus_test_support');assert.equal(await support.getAttribute('target'),'_blank');assert.equal(await page.getByLabel('الجامعة',{exact:true}).count(),0);
        await page.getByLabel('اسم المادة أو الشرح').fill('لا يوجد هذا الشرح');await page.getByRole('button',{name:'بحث',exact:true}).click();await page.getByRole('heading',{name:'لا توجد شروحات مطابقة حاليًا'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
        const [name,value]=auth.cookie.split('=');await context.addCookies([{name,value,url:origin+ADMIN_PATH}]);await page.goto(origin+ADMIN_PATH+'/course-catalog');await page.getByRole('heading',{name:'دليل شروحات eStudy24 والربط',exact:true}).waitFor();await page.getByRole('checkbox',{name:'تحديد جميع سجلات الصفحة الحالية'}).check();await page.getByText('تم تحديد 7 سجلًا',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:/تحديد جميع النتائج المطابقة/}).count());assert.equal(browserApiRequests.length,0);await context.close();
      }}finally{await browser.close();}
    });
    await t.test('disabled universities never expose explanations and sitemap contains catalog without private routes',async()=>{
      await db.university.update({where:{id:university.id},data:{enabled:false}});assert.equal((await publicCourseCatalog(db,new URLSearchParams('university=uqu'))).total,0);await db.university.update({where:{id:university.id},data:{enabled:true}});
      const sitemap=await(await request('/sitemap.xml')).text();assert.ok(sitemap.includes('/courses'));assert.ok(!sitemap.includes(ADMIN_PATH));
      assert.ok(originalCourses.length===15);
    });
  }finally{
    if(child){child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,10000))]);if(child.exitCode===null)child.kill('SIGKILL');}
    await db.adminBulkConfirmation.deleteMany({where:{selection:{administratorId:{in:actors.map(a=>a.id)}}}});await db.adminBulkSelection.deleteMany({where:{administratorId:{in:actors.map(a=>a.id)}}});
    await db.courseExplanation.deleteMany();await db.courseUniversityMapping.deleteMany();await db.courseSourceCategory.deleteMany();await db.courseSyncRun.deleteMany();await db.courseCatalogSettings.deleteMany();
    await db.auditLog.deleteMany({where:{OR:[{administratorId:{in:actors.map(a=>a.id)}},{entity:'course_catalog'},{entity:'course-mappings'}]}});await db.administrator.deleteMany({where:{id:{in:actors.map(a=>a.id)}}});await db.university.deleteMany({where:{id:{in:madeUniversities}}});
    if(previousSettings)await db.siteSettings.update({where:{id:'main'},data:{telegramSupportUrl:previousSettings.telegramSupportUrl}});else await db.siteSettings.deleteMany({where:{id:'main'}});
  }
});
