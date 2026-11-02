import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, rmdir, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { seedCampus } from '../../prisma/seed-campus.ts';
import { seedCourseMappings, publicCourseCatalog } from '../../src/server/course-catalog-service.ts';
import { finalizeInstitutions, InstitutionFinalizeError } from '../../src/server/institution-finalize.ts';
import { parseCourse } from '../../src/server/course-source.ts';

const url = process.env.TEST_DATABASE_URL;
test('Plesk finalize command: atomic cleanup, no sessions, guarded sync, partial outcomes and safe reruns', { skip: !url, timeout: 300000 }, async t => {
  assert.equal(new URL(url!).hostname, '127.0.0.1'); assert.match(new URL(url!).pathname, /_test$/);
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' }); assert.equal(migration.status, 0, migration.stderr);
  const { createDatabase } = await import('../../src/server/database-client.ts'); const db = createDatabase(url, false);
  assert.equal(await db.university.count(), 0); assert.equal(await db.administrator.count(), 0);
  const directory = await mkdtemp(path.join(tmpdir(), 'campus-finalize-cli-'));
  const priorDirectory = process.env.UPLOAD_DIR; process.env.UPLOAD_DIR = directory;
  t.after(async () => {
    try {
      await db.article.deleteMany(); await db.courseExplanation.deleteMany(); await db.courseUniversityMapping.deleteMany();
      await db.auditLog.deleteMany(); await db.ingestionLog.deleteMany(); await db.ingestionSource.deleteMany();
      await db.advertisement.deleteMany(); await db.uploadedMedia.deleteMany(); await db.mediaDeletionJob.deleteMany();
      await db.university.deleteMany(); await db.courseSyncRun.deleteMany(); await db.courseCatalogSettings.deleteMany();
    } finally { if (priorDirectory === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = priorDirectory; await db.$disconnect(); await rm(directory, { recursive: true, force: true }); }
  });
  await seedCampus(db); await seedCourseMappings(db);
  await db.courseCatalogSettings.upsert({ where: { id: 'main' }, create: { enabled: false }, update: { enabled: false } });
  const uqu = await db.university.findUniqueOrThrow({ where: { slug: 'uqu' } }), ksu = await db.university.findUniqueOrThrow({ where: { slug: 'ksu' } });
  const kept = await db.university.findMany({ where: { slug: { notIn: ['ksu', 'kku', 'taibah'] } }, orderBy: { id: 'asc' } });
  const mappings = await db.courseUniversityMapping.findMany({ orderBy: { id: 'asc' } });
  const baha = await db.university.create({ data: { name: 'جامعة الباحة', slug: 'baha-existing', description: 'تحرير محفوظ' } });
  await db.courseUniversityMapping.create({ data: { categoryId: 287, universityId: baha.id, enabled: false } });
  const privateFile = await db.uploadedMedia.create({ data: { universityId: ksu.id, filename: `${randomUUID()}.png`, originalName: 'fixture', mimeType: 'image/png', size: 4 } });
  const sharedFile = await db.uploadedMedia.create({ data: { universityId: ksu.id, filename: `${randomUUID()}.png`, originalName: 'shared', mimeType: 'image/png', size: 6 } });
  await mkdir(path.join(directory, privateFile.filename)); await writeFile(path.join(directory, sharedFile.filename), 'shared');
  const article = await db.article.create({ data: { title: 'خبر محذوف', universityId: ksu.id } });
  await db.articleMedia.create({ data: { articleId: article.id, kind: 'image', url: `/media/${privateFile.id}`, attribution: 'isolated fixture' } });
  const shared = await db.advertisement.create({ data: { title: 'مشترك', imageUrl: `/media/${sharedFile.id}`, destinationUrl: 'https://estudy24.com', buttonText: 'عرض', global: false, placementId: 'university_banner', universities: { create: [{ universityId: ksu.id }, { universityId: uqu.id }] } } });
  const ids = [227, 375, 173, 118, 377, 376, 378, 287, 159, 310, 999];
  const courses = ids.map((id, index) => ({ id: index + 1, status: 'publish', title: { rendered: `شرح اختبار (MTH${index + 1})` }, content: { rendered: '<p>شرح المفاهيم الأساسية للمادة مع أمثلة أكاديمية تطبيقية مفصلة.</p>' }, link: `https://estudy24.com/courses/fixture-${index + 1}/`, slug: `fixture-${index + 1}`, modified_gmt: '2026-11-01T00:00:00', 'course-category': [id] }));
  const categories = ids.map(id => ({ id, name: `تصنيف اختبار ${id}`, slug: `fixture-${id}`, parent: 0, count: 1 }));
  const inventory = { courses: courses.map(parseCourse), categories };
  const fixture = path.join(directory, 'source.mjs');
  async function source(fail = false) {
    await writeFile(fixture, `const courses=${JSON.stringify(courses)},categories=${JSON.stringify(categories)};globalThis.fetch=async function(url,options){const u=new URL(url);if(u.origin!=='https://estudy24.com'||options?.method&&options.method!=='GET')throw Error('UNEXPECTED_SOURCE');const values=u.pathname.endsWith('/course-category')?categories:courses;return new Response(JSON.stringify(${fail ? '{code:"unavailable"}' : 'values'}),{status:${fail ? 503 : 200},headers:{'content-type':'application/json','x-wp-total':String(values.length),'x-wp-totalpages':'1'}})};`);
  }
  function cli() { return spawnSync(process.execPath, ['--env-file-if-exists=.env', '--import', pathToFileURL(fixture).href, '--experimental-strip-types', 'scripts/finalize-institutions.ts'], { env: { ...process.env, DATABASE_URL: url, UPLOAD_DIR: directory }, encoding: 'utf8', timeout: 60000 }); }
  await t.test('missing upload environment fails safely before destructive changes', async () => {
    delete process.env.UPLOAD_DIR;
    try { await assert.rejects(() => finalizeInstitutions(db), e => e instanceof InstitutionFinalizeError && !e.reconciled && e.code === 'UPLOAD_CONFIGURATION'); }
    finally { process.env.UPLOAD_DIR = directory; }
    assert.equal(await db.university.count(), 11); assert.ok(await db.article.findUnique({ where: { id: article.id } }));
  });
  await t.test('identity conflicts and unapproved mappings fail before any deletion or source request', async () => {
    let fetched = false;
    await db.university.update({ where: { id: ksu.id }, data: { name: 'هوية غير مطابقة' } });
    await assert.rejects(() => finalizeInstitutions(db, { inventory: async () => { fetched = true; return inventory; } }), e => e instanceof InstitutionFinalizeError && !e.reconciled && e.code === 'CLEANUP_CONFLICT');
    assert.equal(fetched, false); assert.ok(await db.article.findUnique({ where: { id: article.id } }));
    await db.university.update({ where: { id: ksu.id }, data: { name: ksu.name } });
    const invalid = await db.courseUniversityMapping.create({ data: { categoryId: 999, universityId: uqu.id } });
    await assert.rejects(() => finalizeInstitutions(db, { inventory: async () => inventory })); await db.courseUniversityMapping.delete({ where: { id: invalid.id } });
  });
  await t.test('injected late database failure rolls back deletion, additions, mappings and file queue', async () => {
    await db.$executeRawUnsafe(`CREATE FUNCTION finalize_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rollback'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER finalize_fail BEFORE DELETE ON "University" FOR EACH ROW EXECUTE FUNCTION finalize_fail()`);
    try {
      await assert.rejects(() => finalizeInstitutions(db, { inventory: async () => inventory }));
      assert.equal(await db.university.count(), 11); assert.ok(await db.article.findUnique({ where: { id: article.id } }));
      assert.equal(await db.mediaDeletionJob.count(), 0); assert.equal(await db.auditLog.count({ where: { action: 'approved_institution_cleanup_v1' } }), 0);
      assert.equal((await db.courseUniversityMapping.findUniqueOrThrow({ where: { categoryId: 287 } })).enabled, false);
    } finally { await db.$executeRawUnsafe('DROP TRIGGER finalize_fail ON "University"'); await db.$executeRawUnsafe('DROP FUNCTION finalize_fail()'); }
  });
  await t.test('actual standalone command reports partial success when source fails after committed cleanup', async () => {
    await source(true); const result = cli(); assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /اكتمل تنظيم المؤسسات، لكن المزامنة لم تكتمل/);
    assert.equal(await db.university.count(), 10); assert.equal(await db.university.count({ where: { slug: { in: ['ksu', 'kku', 'taibah'] } } }), 0);
    assert.equal(await db.article.findUnique({ where: { id: article.id } }), null); assert.equal(await db.administrator.count(), 0);
    assert.equal((await db.courseUniversityMapping.findUniqueOrThrow({ where: { categoryId: 287 } })).enabled, true);
    assert.equal((await db.university.findUniqueOrThrow({ where: { slug: 'yic' } })).institutionType, 'COLLEGE');
    assert.equal((await db.university.findUniqueOrThrow({ where: { id: baha.id } })).slug, baha.slug);
    assert.equal(await db.mediaDeletionJob.count(), 1); assert.ok(await db.advertisement.findUnique({ where: { id: shared.id } }));
    assert.equal(await db.advertisementUniversity.count({ where: { advertisementId: shared.id } }), 1);
    assert.equal((await db.uploadedMedia.findUniqueOrThrow({ where: { id: sharedFile.id } })).universityId, null);
  });
  await t.test('rerun synchronizes while scheduler stays disabled; pending files never report full success', async () => {
    await source(); const result = cli(); assert.equal(result.status, 3, result.stderr + result.stdout);
    assert.match(result.stdout, /المصدر 11، المرتبطة 10، خارج الربط 1/); assert.match(result.stdout, /حذف بعض الملفات لم يكتمل/);
    assert.equal((await db.courseCatalogSettings.findUniqueOrThrow({ where: { id: 'main' } })).enabled, false);
    assert.equal((await db.courseSyncRun.findFirstOrThrow({ where: { status: 'succeeded' } })).trigger, 'maintenance');
    assert.equal((await publicCourseCatalog(db, new URLSearchParams())).total, 10); assert.equal(await db.courseUniversityMapping.count(), 10);
    for (const row of kept) assert.deepEqual(await db.university.findUnique({ where: { id: row.id } }), row);
    for (const row of mappings) assert.deepEqual(await db.courseUniversityMapping.findUnique({ where: { id: row.id } }), row);
    assert.equal(await readFile(path.join(directory, sharedFile.filename), 'utf8'), 'shared');
  });
  await t.test('safe repeat finishes media cleanup, preserves source IDs and records one deletion audit only', async () => {
    const before = await db.courseExplanation.findMany({ select: { id: true, wordpressId: true }, orderBy: { wordpressId: 'asc' } });
    await rmdir(path.join(directory, privateFile.filename)); await writeFile(path.join(directory, privateFile.filename), 'test');
    const result = cli(); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /اكتملت العملية بنجاح/); assert.match(result.stdout, /مكتمل سابقًا/);
    assert.equal(await db.mediaDeletionJob.count(), 0); await assert.rejects(() => access(path.join(directory, privateFile.filename))); await access(path.join(directory, sharedFile.filename));
    assert.deepEqual(await db.courseExplanation.findMany({ select: { id: true, wordpressId: true }, orderBy: { wordpressId: 'asc' } }), before);
    assert.equal(await db.auditLog.count({ where: { action: 'approved_institution_cleanup_v1' } }), 1);
  });
  await t.test('standalone npm entry loads the protected application-root .env when variables are not inherited', async () => {
    await writeFile(path.join(directory, '.env'), `DATABASE_URL=${url}\nUPLOAD_DIR=${directory.replaceAll('\\', '/')}\n`);
    const environment = { ...process.env }; delete environment.DATABASE_URL; delete environment.UPLOAD_DIR;
    const result = spawnSync(process.execPath, ['--env-file-if-exists=.env', '--import', pathToFileURL(fixture).href, '--experimental-strip-types', path.resolve('scripts/finalize-institutions.ts')], { cwd: directory, env: environment, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /اكتملت العملية بنجاح/);
    await writeFile(path.join(directory, '.env'), 'DATABASE_URL=https://must-not-override.invalid/database\n');
    const inherited = spawnSync(process.execPath, ['--env-file-if-exists=.env', '--import', pathToFileURL(fixture).href, '--experimental-strip-types', path.resolve('scripts/finalize-institutions.ts')], { cwd: directory, env: { ...environment, DATABASE_URL: url, UPLOAD_DIR: directory }, encoding: 'utf8', timeout: 60000 });
    assert.equal(inherited.status, 0, inherited.stderr); assert.equal(await db.university.count(), 10);
  });
  await t.test('normal removal guards and active synchronization leases remain effective for maintenance', async () => {
    for (const courses of [[], inventory.courses.slice(0, 1)]) await assert.rejects(() => finalizeInstitutions(db, { directory, inventory: async () => ({ ...inventory, courses }) }), e => e instanceof InstitutionFinalizeError && e.reconciled && e.code === 'REMOVAL_GUARD');
    assert.equal(await db.courseExplanation.count({ where: { sourcePublished: true } }), 11);
    await db.courseCatalogSettings.update({ where: { id: 'main' }, data: { leaseUntil: new Date(Date.now() + 60000), leaseToken: 'fixture' } });
    await assert.rejects(() => finalizeInstitutions(db, { inventory: async () => inventory }), e => e instanceof InstitutionFinalizeError && e.reconciled && e.code === 'SYNC_RUNNING');
    await db.courseCatalogSettings.update({ where: { id: 'main' }, data: { leaseUntil: null, leaseToken: null } });
  });
  await t.test('a stale completion marker cannot conceal a subsequently broken mapping', async () => {
    await db.courseUniversityMapping.update({ where: { categoryId: 310 }, data: { enabled: false } });
    await assert.rejects(() => finalizeInstitutions(db, { inventory: async () => inventory }), e => e instanceof InstitutionFinalizeError && e.reconciled && e.code === 'FINAL_INVENTORY_INVALID');
    assert.equal(await db.university.count(), 10);
  });
  await t.test('rerun storage failure reports the previously committed cleanup accurately', async () => {
    const filename = `${randomUUID()}.png`; await db.mediaDeletionJob.create({ data: { filename } });
    await assert.rejects(() => finalizeInstitutions(db, { directory: path.join(directory, 'missing') }), e => e instanceof InstitutionFinalizeError && e.reconciled && e.code === 'UPLOAD_CONFIGURATION');
    assert.equal(await db.university.count(), 10); await db.mediaDeletionJob.delete({ where: { filename } });
  });
});
