import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';
import { parseCourse, type CatalogInventory } from '../../src/server/course-source.ts';
import { coursePlainText } from '../../src/server/course-text.ts';
import { publicCourseCatalog, syncCourseCatalog, seedCourseMappings } from '../../src/server/course-catalog-service.ts';
import { hashPassword, ADMIN_PATH } from '../../src/server/security.ts';
import { COURSE_SUMMARY_FALLBACK } from '../../src/lib/course-catalog.ts';
const source=JSON.parse(readFileSync(new URL('../fixtures/course-catalog/verified-description-html.json',import.meta.url),'utf8'));
const baseline=JSON.parse(readFileSync(new URL('../fixtures/course-catalog/baseline-transform.json',import.meta.url),'utf8'));
const url=process.env.TEST_DATABASE_URL;

test('Course fidelity: existing source rows repair in place, real-source API results and compact responsive cards', {skip:!url,timeout:600000},async t=>{
  assert.equal(new URL(url!).hostname,'127.0.0.1');assert.match(new URL(url!).pathname,/_test$/);
  const {createDatabase}=await import('../../src/server/database-client.ts');
  const migrate=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:url},encoding:'utf8'});assert.equal(migrate.status,0,migrate.stderr);
  const db=createDatabase(url);t.after(()=>db.$disconnect());
  const tag=randomBytes(5).toString('hex'),secret=randomBytes(48).toString('hex'),madeUniversities:string[]=[];
  for(const slug of ['uqu','jazanu'])if(!await db.university.findUnique({where:{slug}})){const u=await db.university.create({data:{slug,name:slug==='uqu'?'جامعة أم القرى':'جامعة جازان'}});madeUniversities.push(u.id);}
  const uqu=await db.university.findUniqueOrThrow({where:{slug:'uqu'}}),jazanu=await db.university.findUniqueOrThrow({where:{slug:'jazanu'}});
  const owner=await db.administrator.create({data:{email:`fidelity-${tag}@test.invalid`,name:'مدير اختبار البيانات',role:'owner',passwordHash:await hashPassword(randomBytes(18).toString('base64url'))}});
  const session=await db.adminSession.create({data:{administratorId:owner.id,tokenHash:randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+3600000)}});
  const inventory:CatalogInventory={courses:source.records.map(parseCourse),categories:[...new Set<number>(source.records.flatMap((r:{'course-category':number[]})=>r['course-category']))].map(id=>({id,name:`تصنيف اختبار ${id}`,slug:`fixture-${id}`,parent:0,count:6}))};
  const ids=new Map<number,string>();let child:ReturnType<typeof spawn>|undefined;
  const previousSettings=await db.siteSettings.findUnique({where:{id:'main'},select:{telegramSupportUrl:true}});
  const academic=await db.academicProgram.create({data:{universityId:uqu.id,title:`سجل أكاديمي مستقل ${tag}`,status:'published'}});
  try{
    await seedCourseMappings(db);await db.courseCatalogSettings.upsert({where:{id:'main'},create:{enabled:true},update:{enabled:true}});
    for(const c of inventory.courses){const before=baseline.records.find((r:{id:number})=>r.id===c.wordpressId);const row=await db.courseExplanation.create({data:{...c,title:before.title,description:before.description,universityId:c.categoryIds.includes(173)?jazanu.id:c.categoryIds.includes(227)?uqu.id:null,mappingState:c.categoryIds.includes(173)||c.categoryIds.includes(227)?'mapped':'unknown',lastSyncedAt:new Date('2026-10-26T00:00:00Z')}});ids.set(c.wordpressId,row.id);}
    await t.test('one normal Owner synchronization restores all legacy fixture rows without source modification or duplicate IDs',async()=>{
      const mappings=await db.courseUniversityMapping.findMany({orderBy:{categoryId:'asc'}});
      const result=await syncCourseCatalog(db,{actor:{id:owner.id,sessionId:session.id},inventory:async()=>inventory});assert.equal(result.fetched,6);assert.equal(await db.courseExplanation.count(),6);
      for(const c of inventory.courses){const row=await db.courseExplanation.findUniqueOrThrow({where:{wordpressId:c.wordpressId}});assert.equal(row.id,ids.get(c.wordpressId));assert.equal(row.title,c.title);assert.equal(row.description,c.description);assert.equal(row.sourceModifiedAt.getTime(),c.sourceModifiedAt.getTime());assert.equal(row.universityId,c.categoryIds.includes(173)?jazanu.id:c.categoryIds.includes(227)?uqu.id:null);assert.equal(row.sourcePublished,true);}
      await syncCourseCatalog(db,{actor:{id:owner.id,sessionId:session.id},inventory:async()=>inventory});assert.equal(await db.courseExplanation.count(),6);assert.deepEqual(await db.courseUniversityMapping.findMany({orderBy:{categoryId:'asc'}}),mappings);assert.equal((await db.academicProgram.findUniqueOrThrow({where:{id:academic.id}})).title,academic.title);
    });
    const longTitle=('مفاهيم الجبر (MTH1441) والتحليل — القسم الثاني '.repeat(14)).trim();
    const longCourse=parseCourse({...source.records.find((r:{id:number})=>r.id===31006),id:2147000001,title:{rendered:longTitle},content:{rendered:'<p>تشرح هذه المادة مبادئ الجبر الخطي وتطبيقاته.</p>'},excerpt:{rendered:''}});
    const incomplete=parseCourse({...source.records.find((r:{id:number})=>r.id===31006),id:2147000002,title:{rendered:'شرح اختبار دون صورة ووصف مناسب'},content:{rendered:'<p>اشتراك 175 ريال</p><p>الدعم الفنيhttps://t.me/test</p>'},excerpt:{rendered:''},_embedded:{},featured_media:0});
    for(const c of [longCourse,incomplete]){const row=await db.courseExplanation.create({data:{...c,universityId:uqu.id,mappingState:'mapped',lastSyncedAt:new Date()}});ids.set(c.wordpressId,row.id);}
    await t.test('full-title and embedded-code searches use preserved data and incomplete descriptions receive the exact fallback',async()=>{
      for(const id of [29168,30920,31006,22239]){const c=inventory.courses.find(c=>c.wordpressId===id)!;const result=await publicCourseCatalog(db,new URLSearchParams({university:'uqu',search:c.title}));assert.ok(result.items.some(r=>r.id===ids.get(id)));assert.equal(result.items.find(r=>r.id===ids.get(id))!.title,c.title);}
      assert.ok((await publicCourseCatalog(db,new URLSearchParams({search:'EE2102T'}))).items.some(c=>c.id===ids.get(29168)));assert.ok((await publicCourseCatalog(db,new URLSearchParams({search:longTitle}))).items.some(c=>c.id===ids.get(longCourse.wordpressId)));assert.equal(incomplete.description,COURSE_SUMMARY_FALLBACK);
    });
    const listener=createServer().listen(0,'127.0.0.1');await once(listener,'listening');const address=listener.address();assert.ok(address&&typeof address==='object');const port=address.port;await new Promise<void>(r=>listener.close(()=>r()));const origin=`http://localhost:${port}`;
    child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-p',String(port)],{env:{...process.env,DATABASE_URL:url,AUTH_SECRET:secret,APP_URL:origin,NODE_ENV:'development'},stdio:'ignore'});
    let ready=false;for(let i=0;i<120;i++){try{if((await fetch(origin+ADMIN_PATH,{redirect:'manual',signal:AbortSignal.timeout(1000)})).status===307){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
    await t.test('public HTTP API returns complete real titles, clean introductions, correct scope and unchanged destinations',async()=>{
      for(const c of inventory.courses){const slug=c.categoryIds.includes(173)?'jazanu':'uqu';if(!c.categoryIds.includes(173)&&!c.categoryIds.includes(227)){const r=await fetch(origin+'/api/courses?'+new URLSearchParams({search:c.title}));assert.equal((await r.json()).total,0);continue;}const r=await fetch(origin+'/api/courses?'+new URLSearchParams({university:slug,search:c.title}));assert.equal(r.status,200);const body=await r.json();const item=body.items.find((r:{id:string})=>r.id===ids.get(c.wordpressId));assert.ok(item);assert.equal(item.title,coursePlainText(source.records.find((r:{id:number})=>r.id===c.wordpressId).title.rendered));assert.equal(item.description,c.description);assert.equal(item.destinationUrl,c.destinationUrl);assert.equal(item.university.slug,slug);assert.doesNotMatch(item.description,/youtu|https?|t\s*\.\s*me|be\/|\?si=|الدعم|اشتراك|ريال|[<>]/);}
      const chemistry=inventory.courses.find(c=>c.wordpressId===9182)!;assert.equal(chemistry.description,'تتضمن هذه الدروس شرح مقرر الكيمياء الحيوية');
    });
    const executable='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    await t.test('320–1440px browser: compact cards, full mixed titles, two wide columns, safe links, images and both public views', {skip:!existsSync(executable),timeout:300000},async()=>{
      const browser=await chromium.launch({executablePath:executable,headless:true});
      try{for(const width of [320,360,390,768,1440]){
        const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<768,hasTouch:width<768});const page=await context.newPage();page.setDefaultTimeout(60000);const sourceRequests:string[]=[];page.on('request',r=>{if(r.url().includes('estudy24.com/wp-json/'))sourceRequests.push(r.url());});
        await page.route('https://estudy24.com/**',r=>r.request().resourceType()==='image'?r.fulfill({status:200,contentType:'image/png',body:readFileSync('public/university-logos/uqu.png')}):r.abort());
        for(const base of ['/courses?university=uqu','/universities/uqu?section=courses']){
          await page.goto(origin+base);await page.getByRole('heading',{name:'شروحات المواد الدراسية',exact:true}).waitFor();
          for(const id of [29168,30920,31006,22239]){const c=inventory.courses.find(c=>c.wordpressId===id)!;const article=page.getByRole('article',{name:c.title,exact:true});await article.waitFor();assert.equal(await article.locator('h3').textContent(),c.title);assert.ok(await article.locator('h3').evaluate(n=>n.scrollHeight<=n.clientHeight+1));const link=article.getByRole('link',{name:'عرض الشرح',exact:true});assert.equal(await link.getAttribute('href'),c.destinationUrl);assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel')||'',/noopener noreferrer/);await link.click({trial:true});const bounds=await article.boundingBox();assert.ok(bounds&&bounds.height<(width>=1024?220:330),JSON.stringify({width,height:bounds?.height,title:c.title}));const image=article.locator('img');await image.waitFor();assert.equal(await image.evaluate(n=>getComputedStyle(n).objectFit),'contain');const imageBounds=await image.boundingBox();assert.ok(imageBounds&&imageBounds.width<=100&&imageBounds.height<=76);const headingBounds=await article.locator('h3').boundingBox();assert.ok(headingBounds&&imageBounds&&imageBounds.x>headingBounds.x,'thumbnail should be at RTL inline start');assert.equal(await article.locator('p.line-clamp-2').evaluate(n=>getComputedStyle(n).webkitLineClamp),'2');}
          const normal=page.getByRole('article',{name:inventory.courses.find(c=>c.wordpressId===29168)!.title,exact:true});if(width===1440&&base.startsWith('/courses')){const cards=await page.getByRole('article').all();const first=await cards[0].boundingBox(),second=await cards[1].boundingBox();assert.ok(first&&second&&Math.abs(first.y-second.y)<2);assert.ok(first&&first.width<650);}
          assert.equal(await normal.locator('h3').evaluate(n=>getComputedStyle(n).webkitLineClamp),'none');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
          const long=page.getByRole('article',{name:longTitle,exact:true});assert.equal(await long.locator('h3').textContent(),longTitle);assert.ok(await long.locator('h3').evaluate(n=>n.scrollHeight<=n.clientHeight+1));await long.getByRole('link',{name:'عرض الشرح',exact:true}).click({trial:true});const empty=page.getByRole('article',{name:incomplete.title,exact:true});await empty.getByText(COURSE_SUMMARY_FALLBACK,{exact:true}).waitFor();assert.equal(await empty.locator('img').count(),0);assert.equal(await empty.locator('svg[aria-label="شرح من eStudy24"]').count(),1);
          if([320,1440].includes(width)&&base.startsWith('/courses')){await page.screenshot({path:`.npm-logs/course-fidelity-${width}.png`,fullPage:true});}
        }
        const exact=inventory.courses.find(c=>c.wordpressId===31006)!;await page.goto(origin+'/courses');await page.getByLabel('اسم المادة أو الشرح').fill(exact.title);await page.getByRole('button',{name:'بحث',exact:true}).click();await page.getByRole('heading',{name:exact.title,exact:true}).waitFor();assert.equal(await page.getByRole('article').count(),1);assert.equal(sourceRequests.length,0);await context.close();
      }}finally{await browser.close();}
    });
  }finally{
    if(child){child.kill('SIGTERM');if(child.exitCode===null)await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,10000))]);if(child.exitCode===null)child.kill('SIGKILL');}
    await db.courseExplanation.deleteMany();await db.courseUniversityMapping.deleteMany();await db.courseSourceCategory.deleteMany();await db.courseSyncRun.deleteMany();await db.courseCatalogSettings.deleteMany();await db.academicProgram.deleteMany({where:{id:academic.id}});await db.auditLog.deleteMany({where:{OR:[{administratorId:owner.id},{entity:'course_catalog'}]}});await db.administrator.delete({where:{id:owner.id}});await db.university.deleteMany({where:{id:{in:madeUniversities}}});
    if(previousSettings)await db.siteSettings.update({where:{id:'main'},data:{telegramSupportUrl:previousSettings.telegramSupportUrl}});else await db.siteSettings.deleteMany({where:{id:'main'}});
  }
});
