import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod/v4';
import { administratorAccess } from './administrator-access.ts';
import { HttpError } from './security.ts';
import { remapCourses } from './course-catalog-service.ts';
import { VERIFIED_COURSE_MAPPINGS } from '../lib/course-catalog.ts';
import { reconciliationInstitutions, directoryHideSlugs, possibleInstitution, institutionalIdentity } from '../lib/institutions.ts';
import { id, slug } from './validation.ts';

type Actor = { id: string; sessionId: string };
type Tx = Prisma.TransactionClient;
const approval = 'تأكيد تسوية دليل المؤسسات';
const choice = z.discriminatedUnion('action', [
  z.object({ categoryId: z.number().int(), action: z.literal('reuse'), universityId: id, verifiedIdentity: z.literal(true), approveMapping: z.literal(true) }).strict(),
  z.object({ categoryId: z.number().int(), action: z.literal('create'), slug, verifiedIdentity: z.literal(true), approveMapping: z.literal(true) }).strict(),
]);
export const reconciliationRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reconcile'), snapshot: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal(approval), choices: z.array(choice).length(3) }).strict(),
  z.object({ action: z.literal('restore_directory'), snapshot: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal('إظهار الجامعات الثلاث في الدليل') }).strict(),
]);
async function owner(tx: Tx, actor: Actor, writing = false) {
  if ((await administratorAccess(tx, actor.id, writing, actor.sessionId)).role !== 'owner') throw new HttpError(403, 'FORBIDDEN', 'هذه العملية متاحة لمدير المنصة فقط.');
}
async function inspect(tx: Tx) {
  const [institutions, mappings, categories, sources, activeKeys, accounts, runs, iauCourse, catalogSettings] = await Promise.all([
    tx.university.findMany({ take: 5001, orderBy: { id: 'asc' }, select: {
      id: true, name: true, slug: true, institutionType: true, enabled: true, showInDirectory: true, updatedAt: true,
      _count: { select: { articles: true, events: true, programs: true, academicPrograms: true, links: true, ads: true, administrators: true, uploads: true, apiKeys: true, sources: true, courseMappings: true, courseExplanations: true } },
    } }),
    tx.courseUniversityMapping.findMany({ orderBy: { categoryId: 'asc' }, select: { id: true, categoryId: true, universityId: true, enabled: true, updatedAt: true } }),
    tx.courseSourceCategory.findMany({ where: { id: { in: reconciliationInstitutions.map(i => i.categoryId) } }, select: { id: true, name: true, courseCount: true, lastSyncedAt: true } }),
    tx.ingestionSource.findMany({ select: { id: true, key: true, universityId: true, enabled: true, _count: { select: { articles: true, logs: true, contentSyncs: true, academicPrograms: true } } }, orderBy: { id: 'asc' } }),
    tx.universityApiKey.groupBy({ by: ['universityId'], where: { revokedAt: null }, _count: { _all: true }, orderBy: { universityId: 'asc' } }),
    tx.administrator.groupBy({ by: ['universityId', 'role', 'active'], _count: { _all: true }, orderBy: [{ universityId: 'asc' }, { role: 'asc' }, { active: 'asc' }] }),
    tx.courseSyncRun.findMany({ take: 5, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], select: { id: true, status: true, startedAt: true, finishedAt: true, fetched: true, mapped: true, unknown: true, ambiguous: true, errorCode: true } }),
    tx.courseExplanation.findUnique({ where: { wordpressId: 33899 }, select: { wordpressId: true, universityId: true, categoryIds: true, sourcePublished: true, mappingState: true, sourceModifiedAt: true, lastSyncedAt: true } }),
    tx.courseCatalogSettings.findUnique({ where: { id: 'main' }, select: { enabled: true, lastSuccessfulSyncAt: true } }),
  ]);
  if (institutions.length > 5000) throw new HttpError(422, 'PREFLIGHT_LIMIT', 'عدد المؤسسات يتجاوز حد الفحص؛ يلزم تدقيق مخصص قبل المتابعة.');
  const conflicts: string[] = [];
  const planned = reconciliationInstitutions.map(identity => {
    const candidates = institutions.filter(row => possibleInstitution(row, identity));
    if (candidates.length > 1) conflicts.push(`أكثر من سجل محتمل لـ${identity.name}؛ راجع التكرار قبل التسوية.`);
    const category = categories.find(c => c.id === identity.categoryId);
    if (!category || institutionalIdentity(category.name) !== institutionalIdentity(identity.name)) conflicts.push(`تصنيف المصدر ${identity.categoryId} غير متاح أو هويته مختلفة. راجع المزامنة والتصنيفات أولًا.`);
    const mapping = mappings.find(m => m.categoryId === identity.categoryId);
    const target = mapping && institutions.find(u => u.id === mapping.universityId);
    if (target && (VERIFIED_COURSE_MAPPINGS.some(m => m.slug === target.slug) || (directoryHideSlugs as readonly string[]).includes(target.slug) || candidates.some(u => u.id !== target.id))) conflicts.push(`تصنيف ${identity.categoryId} مرتبط بسجل متعارض؛ راجع الربط يدويًا دون إعادة تعيين تلقائية.`);
    return { ...identity, candidates: candidates.map(row => row.id), category: category || null };
  });
  for (const expected of VERIFIED_COURSE_MAPPINGS) {
    const university = institutions.find(u => u.slug === expected.slug), mapping = mappings.find(m => m.categoryId === expected.categoryId);
    if (!university || !mapping || mapping.universityId !== university.id || !mapping.enabled) conflicts.push(`الربط المعتمد ${expected.categoryId} → ${expected.slug} ناقص أو مختلف أو معطّل؛ لن تعدّله التسوية.`);
  }
  for (const slug of directoryHideSlugs) if (!institutions.some(u => u.slug === slug)) conflicts.push(`السجل ${slug} غير موجود؛ لن تُنشئ التسوية بديلًا عنه.`);
  const data = { institutions, mappings, sources, activeKeys, accounts, planned, conflicts, runs, iauCourse, catalogSettings };
  return { ...data, snapshot: createHash('sha256').update(JSON.stringify(data)).digest('hex') };
}
export type InstitutionPreflight = Awaited<ReturnType<typeof inspect>>;
export async function institutionPreflight(db: PrismaClient, actor: Actor) {
  return db.$transaction(async tx => { await owner(tx, actor); return inspect(tx); }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
}
export async function reconcileInstitutions(db: PrismaClient, actor: Actor, raw: unknown) {
  const input = reconciliationRequest.parse(raw);
  return db.$transaction(async tx => {
    await owner(tx, actor, true);
    // Serialize Owner reconciliation with catalog mapping/synchronization transactions.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(270001)`;
    const before = await inspect(tx);
    if (before.snapshot !== input.snapshot) throw new HttpError(409, 'STALE_PREFLIGHT', 'تغيّرت البيانات منذ الفحص. لم تُنفّذ تغييرات؛ أعد الفحص والمراجعة.');
    const hidden = before.institutions.filter(u => (directoryHideSlugs as readonly string[]).includes(u.slug));
    if (hidden.length !== 3) throw new HttpError(409, 'IDENTITY_CONFLICT', 'لم تُعثر على السجلات الثلاثة الأصلية؛ أوقفت العملية دون تغييرات.');
    if (input.action === 'restore_directory') {
      await tx.university.updateMany({ where: { id: { in: hidden.map(u => u.id) }, showInDirectory: false }, data: { showInDirectory: true } });
    } else {
      if (before.conflicts.length) throw new HttpError(409, 'IDENTITY_CONFLICT', before.conflicts.join(' '));
      if (new Set(input.choices.map(c => c.categoryId)).size !== 3 || input.choices.some(c => !reconciliationInstitutions.some(i => i.categoryId === c.categoryId))) throw new HttpError(422, 'INVALID_PLAN', 'اختر قرارًا واحدًا لكل مؤسسة معتمدة.');
      const used = new Set<string>();
      for (const identity of before.planned) {
        const c = input.choices.find(c => c.categoryId === identity.categoryId)!;
        const mapping = before.mappings.find(m => m.categoryId === identity.categoryId);
        let universityId: string;
        if (c.action === 'reuse') {
          const existing = before.institutions.find(u => u.id === c.universityId);
          if (!existing || used.has(existing.id) || before.mappings.some(m => m.universityId === existing.id && m.categoryId !== identity.categoryId && reconciliationInstitutions.some(i => i.categoryId === m.categoryId)) || VERIFIED_COURSE_MAPPINGS.some(m => m.slug === existing.slug) || (directoryHideSlugs as readonly string[]).includes(existing.slug) || identity.candidates.some(candidate => candidate !== existing.id)) throw new HttpError(409, 'IDENTITY_CONFLICT', 'السجل المختار غير متاح لإعادة الاستخدام أو توجد هوية أخرى محتملة. راجع السجلات والروابط.');
          universityId = existing.id;
          // Explicit Owner verification permits reuse of a manually named record; preserve its name, slug and enabled state.
          if (existing.institutionType !== identity.institutionType || !existing.showInDirectory) await tx.university.update({ where: { id: universityId }, data: { institutionType: identity.institutionType, showInDirectory: true } });
        } else {
          if (identity.candidates.length || before.institutions.some(u => u.slug === c.slug) || mapping) throw new HttpError(409, 'IDENTITY_CONFLICT', 'يوجد سجل أو slug أو ربط سابق محتمل؛ لا يمكن إنشاء نسخة جديدة. أعد الفحص واختر السجل الصحيح.');
          const created = await tx.university.create({ data: { name: identity.name, slug: c.slug, institutionType: identity.institutionType, enabled: true, showInDirectory: true } });
          universityId = created.id;
        }
        used.add(universityId);
        if (mapping && mapping.universityId !== universityId) throw new HttpError(409, 'MAPPING_CONFLICT', 'التصنيف مرتبط بمؤسسة أخرى؛ لم تُعدّل الروابط.');
        if (!mapping) await tx.courseUniversityMapping.create({ data: { categoryId: identity.categoryId, universityId } });
        else if (!mapping.enabled) await tx.courseUniversityMapping.update({ where: { id: mapping.id }, data: { enabled: true } });
      }
      await tx.university.updateMany({ where: { id: { in: hidden.map(u => u.id) }, showInDirectory: true }, data: { showInDirectory: false } });
      // Reuse the existing catalog mapping projection. No source fetch, publication changes or removals.
      await remapCourses(tx);
    }
    const after = await tx.university.findMany({ orderBy: { id: 'asc' }, select: { id: true, slug: true, enabled: true, showInDirectory: true, institutionType: true } });
    await tx.auditLog.create({ data: { administratorId: actor.id, entity: 'institution_directory', action: input.action, details: { before: before.institutions.map(({ id, slug, enabled, showInDirectory, institutionType }) => ({ id, slug, enabled, showInDirectory, institutionType })), after, ...(input.action === 'reconcile' && { decisions: input.choices }) } } });
    return { saved: true, action: input.action, institutions: after, inactiveInstitutions: after.filter(u => !u.enabled).map(u => u.slug) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}
