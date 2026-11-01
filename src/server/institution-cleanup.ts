import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod/v4';
import { administratorAccess } from './administrator-access.ts';
import { HttpError } from './security.ts';
import { VERIFIED_COURSE_MAPPINGS } from '../lib/course-catalog.ts';
import { institutionalIdentity, reconciliationInstitutions, possibleInstitution } from '../lib/institutions.ts';
import { remapCourses } from './course-catalog-service.ts';

type Tx = Prisma.TransactionClient;
type Actor = { id: string; sessionId: string };
const marker = 'approved_institution_cleanup_v1';
export const cleanupTargets = [
  { slug: 'ksu', name: 'جامعة الملك سعود' },
  { slug: 'kku', name: 'جامعة الملك خالد' },
  { slug: 'taibah', name: 'جامعة طيبة' },
] as const;
const newSlugs: Record<number, string> = { 287: 'baha', 159: 'tabuk', 310: 'yic' };
const retainedNames: Record<string, string> = { pnu: 'جامعة الأميرة نورة بنت عبدالرحمن', imamu: 'جامعة الإمام محمد بن سعود الإسلامية', iau: 'جامعة الإمام عبدالرحمن بن فيصل', qu: 'جامعة القصيم', kau: 'جامعة الملك عبدالعزيز', uqu: 'جامعة أم القرى', jazanu: 'جامعة جازان' };
export const institutionCleanupRequest = z.object({ snapshot: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict();
const models = Prisma.dmmf.datamodel.models;
function table(name: string) { const model = models.find(m => m.name === name)!; return Prisma.raw('"' + (model.dbName || name).replaceAll('"', '""') + '"'); }
async function owner(tx: Tx, actor: Actor, writing = false) {
  if ((await administratorAccess(tx, actor.id, writing, actor.sessionId)).role !== 'owner') throw new HttpError(403, 'FORBIDDEN', 'هذه العملية متاحة لمدير المنصة فقط.');
}
// Check the actual database, not only Prisma's expected cascades. New/unknown foreign
// keys must be reviewed before this version can delete anything.
async function foreignKeyConflicts(tx: Tx) {
  const actual = await tx.$queryRaw<{ child: string; parent: string; columns: string[]; references: string[]; deletion: string; sameSchema: boolean }[]>`
    SELECT child.relname::text AS child, parent.relname::text AS parent, c.confdeltype::text AS deletion, (child.relnamespace=parent.relnamespace) AS "sameSchema",
      ARRAY(SELECT attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,o) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.o) AS columns,
      ARRAY(SELECT attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,o) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.o) AS references
    FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid
    JOIN pg_namespace ns ON ns.oid=parent.relnamespace WHERE c.contype='f' AND ns.nspname=current_schema()`;
  // Prisma 7's runtime DMMF deliberately omits relation scalar fields. Keep this
  // reviewed allow-list explicit, including the actual ON DELETE behavior.
  const expected = new Set([
    'Article.universityId:University:r', 'Article.sourceId:IngestionSource:r', 'Article.categoryId:ArticleCategory:n',
    'ArticleMedia.articleId:Article:c', 'ArticleRegistrationLink.articleId:Article:c',
    'Event.universityId:University:n', 'Program.universityId:University:n',
    'Advertisement.placementId:AdvertisementPlacement:r', 'AdvertisementUniversity.advertisementId:Advertisement:c', 'AdvertisementUniversity.universityId:University:c',
    'AdvertisementDailyMetric.advertisementId:Advertisement:c', 'ManagedLink.universityId:University:n',
    'AdminSession.administratorId:Administrator:c', 'IngestionSource.universityId:University:r',
    'IngestionLog.sourceId:IngestionSource:n', 'IngestionLog.articleId:Article:n',
    'ArticleEdit.articleId:Article:c', 'ArticleEdit.administratorId:Administrator:n', 'AuditLog.administratorId:Administrator:n',
    'AdvertisementPlacementAssignment.advertisementId:Advertisement:c', 'AdvertisementPlacementAssignment.placementId:AdvertisementPlacement:r',
    'PlatformPost.categoryId:ArticleCategory:n', 'AdminPasswordReset.administratorId:Administrator:c',
    'UniversityApiKey.universityId:University:r', 'ContentSync.sourceId:IngestionSource:r',
    'Administrator.universityId:University:r', 'UploadedMedia.universityId:University:r',
    'AcademicProgram.universityId:University:r', 'AcademicProgram.sourceId:IngestionSource:r',
    'AdminBulkConfirmation.selectionId:AdminBulkSelection:c', 'CourseExplanation.universityId:University:r', 'CourseUniversityMapping.universityId:University:r',
  ]);
  const unknown = actual.filter(f => !f.sameSchema || f.columns.length !== 1 || f.references.join() !== 'id' || !expected.has(`${f.child}.${f.columns[0]}:${f.parent}:${f.deletion}`));
  return [...unknown.map(f => `توجد علاقة قاعدة بيانات غير معروفة (${f.child}.${f.columns.join(',')})؛ يلزم تدقيق تقني قبل الحذف.`), ...(actual.length - unknown.length !== expected.size ? ['مخطط علاقات قاعدة البيانات غير مكتمل؛ يلزم تطبيق الترحيلات المعتمدة قبل الحذف.'] : [])];
}

async function plan(tx: Tx) {
  const completed = await tx.auditLog.findFirst({ where: { action: marker }, select: { createdAt: true, details: true } });
  if (completed) return { completed, conflicts: [] as string[], snapshot: '', targets: [], counts: {} as Record<string, number>, additions: [] };
  const institutions = await tx.university.findMany({ orderBy: { id: 'asc' } });
  const mappings = await tx.courseUniversityMapping.findMany({ orderBy: { id: 'asc' } });
  const conflicts = await foreignKeyConflicts(tx);
  const targets = cleanupTargets.map(expected => {
    const row = institutions.find(u => u.slug === expected.slug);
    if (row && institutionalIdentity(row.name) !== institutionalIdentity(expected.name)) conflicts.push(`هوية ${expected.name} لا تطابق السجل الحالي.`);
    return row;
  }).filter((row): row is NonNullable<typeof row> => !!row);
  if (targets.length !== 3) conflicts.push('السجلات الثلاثة غير مكتملة؛ أوقفت العملية للمراجعة.');
  const ids = targets.map(u => u.id), within = { in: ids };
  const additions = reconciliationInstitutions.map(identity => {
    const matches = institutions.filter(u => possibleInstitution(u, identity));
    if (matches.length > 1 || matches.some(u => institutionalIdentity(u.name) !== institutionalIdentity(identity.name))) conflicts.push(`تعارض هوية ${identity.name}؛ راجع المؤسسة قبل المتابعة.`);
    const existing = matches[0];
    if (existing && !existing.enabled) conflicts.push(`${identity.name} معطلة؛ راجع حالتها في إدارة المؤسسات قبل المتابعة.`);
    if (!existing && institutions.some(u => u.slug === newSlugs[identity.categoryId])) conflicts.push(`رابط ${identity.name} مستخدم لمؤسسة أخرى.`);
    const mapping = mappings.find(m => m.categoryId === identity.categoryId);
    if (mapping && (!existing || mapping.universityId !== existing.id || !mapping.enabled)) conflicts.push(`ربط ${identity.name} متعارض أو معطل.`);
    return { ...identity, existingId: existing?.id || null, slug: existing?.slug || newSlugs[identity.categoryId] };
  });
  const retained = VERIFIED_COURSE_MAPPINGS.map(expected => {
    const institution = institutions.find(u => u.slug === expected.slug);
    const mapping = mappings.find(m => m.categoryId === expected.categoryId);
    if (!institution || !mapping || mapping.universityId !== institution.id || !mapping.enabled) conflicts.push('أحد الروابط السبعة المعتمدة غير مطابق؛ لن يُعاد تعيينه تلقائيًا.');
    if (institution && institutionalIdentity(institution.name) !== institutionalIdentity(retainedNames[expected.slug])) conflicts.push(`هوية المؤسسة الباقية ${retainedNames[expected.slug]} غير مطابقة؛ راجع اسمها وربطها قبل المتابعة.`);
    if (institution && (!institution.enabled || !institution.showInDirectory)) conflicts.push(`${institution.name} غير ظاهرة أو معطلة؛ راجع قرارها في إدارة المؤسسات قبل المتابعة.`);
    return institution?.id;
  });
  const allowed = new Set([...ids, ...retained, ...additions.map(i => i.existingId)]);
  if (institutions.some(u => !allowed.has(u.id))) conflicts.push('توجد مؤسسة خارج القائمة المعتمدة؛ لا تشملها موافقة الحذف الحالية.');
  const [articles, academicPrograms, events, programs, links, sources, administrators, uploads, courses, ads] = await Promise.all([
    tx.article.findMany({ where: { universityId: within } }), tx.academicProgram.findMany({ where: { universityId: within } }),
    tx.event.findMany({ where: { universityId: within } }), tx.program.findMany({ where: { universityId: within } }),
    tx.managedLink.findMany({ where: { universityId: within } }), tx.ingestionSource.findMany({ where: { universityId: within } }),
    tx.administrator.findMany({ where: { universityId: within } }), tx.uploadedMedia.findMany({ where: { universityId: within } }),
    tx.courseExplanation.findMany({ where: { universityId: within } }),
    tx.advertisement.findMany({ where: { universities: { some: { universityId: within } } }, include: { universities: true } }),
  ]);
  const sourceIds = sources.map(s => s.id), articleIds = articles.map(a => a.id), adminIds = administrators.map(a => a.id);
  if (uploads.some(file => !/^[a-f0-9-]{36}\.(png|jpg|webp|pdf)$/.test(file.filename))) conflicts.push('يوجد ملف باسم تخزين غير متوقع؛ يلزم تدقيقه قبل الحذف.');
  if (administrators.some(a => a.role !== 'ambassador')) conflicts.push('يوجد حساب مشترك مرتبط بمؤسسة محذوفة؛ أوقفت العملية لحماية الحساب.');
  if (await tx.article.count({ where: { sourceId: { in: sourceIds }, universityId: { notIn: ids } } }) || await tx.academicProgram.count({ where: { sourceId: { in: sourceIds }, universityId: { notIn: ids } } })) conflicts.push('مصدر تابع لمؤسسة محذوفة مرتبط بمحتوى مؤسسة أخرى.');
  const retainedCategories: number[] = [...VERIFIED_COURSE_MAPPINGS.map(m => m.categoryId), ...additions.map(m => m.categoryId)];
  if (courses.some(c => c.categoryIds.some(id => retainedCategories.includes(id)))) conflicts.push('شرح مرتبط بمؤسسة محذوفة يحمل تصنيف مؤسسة باقية؛ راجع الربط قبل الحذف.');
  const exclusiveAds = ads.filter(a => !a.global && a.universities.every(u => ids.includes(u.universityId)));
  const adIds = exclusiveAds.map(a => a.id);
  const [media, registrations, edits, logs, syncs, keys, sessions, resets, selections, adMetrics, adPlacements] = await Promise.all([
    tx.articleMedia.findMany({ where: { articleId: { in: articleIds } } }), tx.articleRegistrationLink.findMany({ where: { articleId: { in: articleIds } } }),
    tx.articleEdit.findMany({ where: { articleId: { in: articleIds } } }),
    tx.ingestionLog.findMany({ where: { OR: [{ sourceId: { in: sourceIds } }, { articleId: { in: articleIds } }, { resourceId: { in: [...articleIds, ...events.map(x => x.id), ...programs.map(x => x.id), ...links.map(x => x.id), ...academicPrograms.map(x => x.id)] } }] } }),
    tx.contentSync.findMany({ where: { sourceId: { in: sourceIds } } }), tx.universityApiKey.findMany({ where: { universityId: within } }),
    tx.adminSession.findMany({ where: { administratorId: { in: adminIds } } }), tx.adminPasswordReset.findMany({ where: { administratorId: { in: adminIds } } }),
    tx.adminBulkSelection.findMany({ where: { administratorId: { in: adminIds } } }),
    tx.advertisementDailyMetric.findMany({ where: { advertisementId: { in: adIds } } }), tx.advertisementPlacementAssignment.findMany({ where: { advertisementId: { in: adIds } } }),
  ]);
  const ownedIds = new Set([...articleIds, ...academicPrograms.map(r => r.id), ...events.map(r => r.id), ...programs.map(r => r.id), ...links.map(r => r.id)]);
  if (logs.some(log => log.resourceId && !ownedIds.has(log.resourceId))) conflicts.push('سجل عملية يشير إلى مورد خارج خطة الحذف؛ يلزم تدقيقه.');
  if (syncs.some(s => !ownedIds.has(s.recordId) && !s.deletedAt)) conflicts.push('سجل استيراد يشير إلى محتوى غير معروف أو مشترك؛ يلزم تدقيقه أولًا.');
  const foreignSyncs = await tx.contentSync.count({ where: { recordId: { in: [...ownedIds] }, sourceId: { notIn: sourceIds } } });
  if (foreignSyncs) conflicts.push('محتوى محذوف مرتبط بمصدر مؤسسة أخرى.');
  if (logs.some(log => (log.sourceId && !sourceIds.includes(log.sourceId)) || (log.articleId && !articleIds.includes(log.articleId)))) conflicts.push('سجل استيراد مشترك بين مؤسسة محذوفة ومحتوى أو مصدر باقٍ؛ يلزم تدقيقه.');
  const allRows: Record<string, { id: string }[]> = { University: targets, Article: articles, AcademicProgram: academicPrograms, Event: events, Program: programs, ManagedLink: links, IngestionSource: sources, Administrator: administrators, CourseExplanation: courses, Advertisement: exclusiveAds, ArticleMedia: media, ArticleRegistrationLink: registrations, ArticleEdit: edits, IngestionLog: logs, ContentSync: syncs, UniversityApiKey: keys, AdminSession: sessions, AdminPasswordReset: resets, AdminBulkSelection: selections };
  // Local media can be referenced from rich text, JSON history or any URL field.
  // Search every known table; retain shared media as independent rather than
  // destroying bytes still used by retained/global content. Never return values.
  const sharedUploads: string[] = [];
  for (const upload of uploads) {
    let shared = false;
    for (const model of models.filter(m => !['UploadedMedia', 'RateLimitBucket'].includes(m.name) && m.fields.some(f => f.name === 'id'))) {
      const found = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM ${table(model.name)} t WHERE strpos(row_to_json(t)::text, ${'/media/' + upload.id}) > 0`);
      const deleted = new Set(allRows[model.name]?.map(r => r.id) || []);
      if (found.some(r => !deleted.has(r.id))) { shared = true; break; }
    }
    if (shared) sharedUploads.push(upload.id);
  }
  const counts = Object.fromEntries(Object.entries(allRows).map(([name, rows]) => [name, rows.length]));
  const countsExtra: Record<string, number> = { ...counts, exclusiveUploads: uploads.length - sharedUploads.length, preservedSharedUploads: sharedUploads.length, preservedSharedAds: ads.length - exclusiveAds.length, adMetrics: adMetrics.length };
  const digest = { institutions, mappings, allRows, uploads, sharedUploads, ads, adMetrics, adPlacements, additions, conflicts };
  const snapshot = createHash('sha256').update(JSON.stringify(digest, (_key, value) => Array.isArray(value) && value.every(row => row && typeof row === 'object' && typeof row.id === 'string') ? [...value].sort((a, b) => a.id.localeCompare(b.id)) : value)).digest('hex');
  return { completed: null, snapshot, conflicts: [...new Set(conflicts)], targets: targets.map(u => ({ name: u.name, slug: u.slug })), additions, counts: countsExtra, privatePlan: { allRows, ids, uploads, sharedUploads } };
}
export async function cleanupPreflight(db: PrismaClient, actor: Actor) {
  return db.$transaction(async tx => { await owner(tx, actor); const { privatePlan: _private, ...report } = await plan(tx); void _private; return report; }, { isolationLevel: 'RepeatableRead', timeout: 60000 });
}
export async function cleanupInstitutions(db: PrismaClient, actor: Actor, raw: unknown) {
  const input = institutionCleanupRequest.parse(raw);
  return db.$transaction(async tx => {
    await owner(tx, actor, true);
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(270001)`;
    if (await tx.auditLog.findFirst({ where: { action: marker }, select: { id: true } })) return { completed: true, alreadyCompleted: true };
    // Short maintenance transaction: prevent ingestion, uploads and other writes
    // changing the inspected graph between validation and ordered deletion.
    await tx.$executeRaw(Prisma.sql`LOCK TABLE ${Prisma.join(models.map(m => table(m.name)))} IN SHARE ROW EXCLUSIVE MODE`);
    const report = await plan(tx);
    if (report.completed) return { completed: true, alreadyCompleted: true };
    if (report.conflicts.length) throw new HttpError(409, 'CLEANUP_CONFLICT', report.conflicts.join(' '));
    if (report.snapshot !== input.snapshot) throw new HttpError(409, 'STALE_PREFLIGHT', 'تغيّرت البيانات. أعد المراجعة قبل التأكيد.');
    const p = report.privatePlan!;
    for (const identity of report.additions) {
      const institution = identity.existingId ? await tx.university.findUniqueOrThrow({ where: { id: identity.existingId } }) : await tx.university.create({ data: { slug: identity.slug, name: identity.name, institutionType: identity.institutionType } });
      if (institution.institutionType !== identity.institutionType || !institution.showInDirectory) await tx.university.update({ where: { id: institution.id }, data: { institutionType: identity.institutionType, showInDirectory: true } });
      await tx.courseUniversityMapping.upsert({ where: { categoryId: identity.categoryId }, update: {}, create: { categoryId: identity.categoryId, universityId: institution.id } });
    }
    const names = ['AdminBulkSelection', 'AdminPasswordReset', 'AdminSession', 'ArticleEdit', 'ArticleMedia', 'ArticleRegistrationLink', 'IngestionLog', 'ContentSync', 'UniversityApiKey', 'CourseExplanation', 'AcademicProgram', 'Article', 'Event', 'Program', 'ManagedLink', 'Advertisement', 'IngestionSource', 'Administrator'] as const;
    for (const name of names) {
      const ids = p.allRows[name]?.map(r => r.id) || [];
      for (let offset = 0; offset < ids.length; offset += 500) await tx.$executeRaw(Prisma.sql`DELETE FROM ${table(name)} WHERE "id" IN (${Prisma.join(ids.slice(offset, offset + 500))})`);
    }
    // Cascades here affect only association rows, never shared advertisements.
    await tx.advertisementUniversity.deleteMany({ where: { universityId: { in: p.ids } } });
    await tx.courseUniversityMapping.deleteMany({ where: { universityId: { in: p.ids } } });
    for (const file of p.uploads) {
      if (p.sharedUploads.includes(file.id)) await tx.uploadedMedia.update({ where: { id: file.id }, data: { universityId: null } });
      else {
        await tx.mediaDeletionJob.create({ data: { filename: file.filename } });
        await tx.uploadedMedia.delete({ where: { id: file.id } });
      }
    }
    await tx.university.deleteMany({ where: { id: { in: p.ids } } });
    await remapCourses(tx);
    if (await tx.university.count() !== 10) throw new HttpError(409, 'FINAL_DIRECTORY_CONFLICT', 'لم يطابق الدليل المؤسسات العشر المعتمدة؛ أُلغيت التغييرات.');
    await tx.auditLog.create({ data: { administratorId: actor.id, action: marker, entity: 'institution_directory', details: { counts: report.counts, removed: cleanupTargets.map(t => t.slug), retainedInstitutions: 10 } } });
    return { completed: true, counts: report.counts };
  }, { isolationLevel: 'Serializable', timeout: 60000 });
}
