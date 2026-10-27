import type { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
import { resolveCourseUniversity, VERIFIED_COURSE_MAPPINGS, catalogSearch } from '../lib/course-catalog.ts';
import { fetchCatalogInventory, CatalogSourceError, type CatalogInventory } from './course-source.ts';
import { administratorAccess } from './administrator-access.ts';
import { HttpError } from './security.ts';
import { z } from 'zod/v4';
import { managementQuery } from './management-query.ts';
export type CatalogActor = { id: string; sessionId: string };
export const catalogCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sync'), approvedRunId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(), confirmation: z.string().max(200).optional() }).strict(),
  z.object({ action: z.literal('settings'), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal('mapping'), categoryId: z.number().int().positive().max(2147483647), universityId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), enabled: z.boolean() }).strict(),
]);
export async function manageCatalog(db: PrismaClient, actor: CatalogActor, raw: unknown) {
  const input = catalogCommand.parse(raw);
  if (input.action === 'sync') return syncCourseCatalog(db, { actor, approval: input.approvedRunId ? { runId: input.approvedRunId, confirmation: input.confirmation || '' } : undefined });
  return db.$transaction(async tx => {
    await catalogOwner(tx, actor, true); await tx.$executeRaw`SELECT pg_advisory_xact_lock(270001)`;
    if (input.action === 'settings') {
      const before = await tx.courseCatalogSettings.findUnique({ where: { id: 'main' }, select: { enabled: true } });
      await tx.courseCatalogSettings.upsert({ where: { id: 'main' }, create: { enabled: input.enabled }, update: { enabled: input.enabled } });
      await tx.auditLog.create({ data: { administratorId: actor.id, entity: 'course_catalog', action: 'course_catalog_settings', details: { before, enabled: input.enabled } } }); return { saved: true };
    }
    if (!await tx.university.findUnique({ where: { id: input.universityId }, select: { id: true } })) throw new HttpError(422, 'INVALID_UNIVERSITY', 'اختر جامعة موجودة؛ لا ينشئ الربط جامعات جديدة.');
    if (!await tx.courseSourceCategory.findUnique({ where: { id: input.categoryId } }) && !VERIFIED_COURSE_MAPPINGS.some(m => m.categoryId === input.categoryId)) throw new HttpError(422, 'UNKNOWN_CATEGORY', 'زامن التصنيفات أولًا ثم اختر تصنيفًا موثّقًا من المصدر.');
    const before = await tx.courseUniversityMapping.findUnique({ where: { categoryId: input.categoryId } });
    const { action: _action, ...fields } = input;
    const mapping = await tx.courseUniversityMapping.upsert({ where: { categoryId: input.categoryId }, create: fields, update: fields });
    await remapCourses(tx);
    await tx.auditLog.create({ data: { administratorId: actor.id, entity: 'course-mappings', entityId: mapping.id, action: 'course_mapping_saved', details: { before, ...fields } } }); return { saved: true };
  }, { timeout: 60000 });
}
export async function catalogAdministration(db: PrismaClient, actor: CatalogActor, search: URLSearchParams) {
  await catalogOwner(db, actor);
  const access = await administratorAccess(db, actor.id, false, actor.sessionId);
  const where = managementQuery('course-mappings', search, access).where;
  const page = Number(search.get('page') || 1); if (!Number.isInteger(page) || page < 1 || page > 100000) throw new HttpError(422, 'INVALID_FILTER', 'رقم الصفحة غير صالح.');
  const [mappings, total, categories, universities, settings, runs, review, reviewCount] = await Promise.all([
    db.courseUniversityMapping.findMany({ where, include: { university: { select: { name: true, slug: true } } }, skip: (page-1)*20, take: 20, orderBy: { categoryId: 'asc' } }), db.courseUniversityMapping.count({ where }),
    db.courseSourceCategory.findMany({ orderBy: { name: 'asc' }, take: 10000 }), db.university.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' }, take: 10000 }),
    db.courseCatalogSettings.findUnique({ where: { id: 'main' }, select: { enabled: true, lastSuccessfulSyncAt: true } }), db.courseSyncRun.findMany({ take: 10, orderBy: { startedAt: 'desc' } }),
    db.courseExplanation.findMany({ where: { sourcePublished: true, mappingState: { not: 'mapped' } }, select: { wordpressId: true, sourceTitle: true, categoryIds: true, mappingState: true }, orderBy: { wordpressId: 'asc' }, take: 30 }), db.courseExplanation.count({ where: { sourcePublished: true, mappingState: { not: 'mapped' } } }),
  ]);
  return { mappings, total, page, pages: Math.ceil(total/20), categories, universities, settings: settings || { enabled: false, lastSuccessfulSyncAt: null }, runs, review, reviewCount };
}
export async function catalogOwner(tx: PrismaClient | Prisma.TransactionClient, actor: CatalogActor, write = false) { if ((await administratorAccess(tx, actor.id, write, actor.sessionId)).role !== 'owner') throw new HttpError(403, 'FORBIDDEN', 'إدارة مزامنة الشروحات والربط متاحة لمدير المنصة فقط.'); }
export async function remapCourses(tx: Prisma.TransactionClient) {
  const mappings = await tx.courseUniversityMapping.findMany({ select: { categoryId: true, universityId: true, enabled: true } });
  const rows = await tx.courseExplanation.findMany({ select: { id: true, categoryIds: true, universityId: true, mappingState: true } });
  for (const c of rows) { const next = resolveCourseUniversity(c.categoryIds, mappings); if (next.universityId !== c.universityId || next.mappingState !== c.mappingState) await tx.courseExplanation.update({ where: { id: c.id }, data: next }); }
}
export async function seedCourseMappings(db: PrismaClient) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(270001)`;
    const result = [];
    for (const m of VERIFIED_COURSE_MAPPINGS) { const university = await tx.university.findUnique({ where: { slug: m.slug }, select: { id: true } }); if (!university) { result.push({ ...m, outcome: 'university_missing' }); continue; }
      await tx.courseUniversityMapping.upsert({ where: { categoryId: m.categoryId }, create: { categoryId: m.categoryId, universityId: university.id }, update: {} }); result.push({ ...m, outcome: 'preserved_or_created' }); }
    await remapCourses(tx); return result;
  }, { timeout: 60000 });
}
export async function syncCourseCatalog(db: PrismaClient, options: { actor?: CatalogActor; inventory?: () => Promise<CatalogInventory>; approval?: { runId: string; confirmation: string } } = {}) {
  const token = randomUUID(), now = new Date();
  const run = await db.$transaction(async tx => {
    if (options.actor) await catalogOwner(tx, options.actor, true);
    const settings = await tx.courseCatalogSettings.upsert({ where: { id: 'main' }, create: { id: 'main' }, update: {} });
    if (!settings.enabled) throw new HttpError(409, 'CATALOG_DISABLED', 'فعّل المزامنة أولًا من إعدادات دليل الشروحات.');
    if (!(await tx.courseCatalogSettings.updateMany({ where: { id: 'main', OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + 15 * 60000) } })).count) throw new HttpError(409, 'SYNC_RUNNING', 'توجد مزامنة قيد التنفيذ. انتظر انتهاءها.');
    await tx.courseSyncRun.updateMany({ where: { status: 'running', startedAt: { lt: new Date(Date.now() - 15 * 60000) } }, data: { status: 'failed', errorCode: 'INTERRUPTED', finishedAt: now } });
    return tx.courseSyncRun.create({ data: { trigger: options.actor ? 'owner' : 'scheduled' } });
  });
  let fetchedCount = 0, removedCount = 0, inventoryDigest: string | null = null;
  try {
    const data = await (options.inventory || fetchCatalogInventory)();
    fetchedCount = data.courses.length;
    inventoryDigest = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    return await db.$transaction(async tx => {
      if (options.actor) await catalogOwner(tx, options.actor, true);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(270001)`;
      const settings = await tx.courseCatalogSettings.findUniqueOrThrow({ where: { id: 'main' } });
      if (!settings.enabled || settings.leaseToken !== token || !settings.leaseUntil || settings.leaseUntil <= new Date()) throw new CatalogSourceError('SYNC_CANCELLED');
      const sourceIds = data.courses.map(c => c.wordpressId);
      if (new Set(sourceIds).size !== sourceIds.length) throw new CatalogSourceError('SOURCE_DUPLICATES');
      const [previous, removed] = await Promise.all([tx.courseExplanation.count({ where: { sourcePublished: true } }), tx.courseExplanation.count({ where: { sourcePublished: true, wordpressId: { notIn: sourceIds } } })]);
      removedCount = removed;
      let approvedRemoval = false;
      if (options.actor && options.approval) {
        const approval = await tx.courseSyncRun.findUnique({ where: { id: options.approval.runId } });
        approvedRemoval = !!approval && approval.status === 'quarantined' && approval.inventoryDigest === inventoryDigest && approval.removed === removed && approval.startedAt > new Date(Date.now() - 3600000) && options.approval.confirmation === `تأكيد تسوية ${removed} شرح`;
        if (!approvedRemoval) throw new CatalogSourceError('REMOVAL_APPROVAL_STALE');
      }
      // Empty inventories always require investigation, even when an Owner approves removal.
      if (previous && (!sourceIds.length || removed > Math.max(5, Math.floor(previous * .2)) && !approvedRemoval)) throw new CatalogSourceError('REMOVAL_GUARD');
      const at = new Date(), mappings = await tx.courseUniversityMapping.findMany(); let mapped = 0, unknown = 0, ambiguous = 0;
      for (const c of data.categories) await tx.courseSourceCategory.upsert({ where: { id: c.id }, create: { id: c.id, name: c.name, slug: c.slug, parent: c.parent, courseCount: c.count, lastSyncedAt: at }, update: { name: c.name, slug: c.slug, parent: c.parent, courseCount: c.count, lastSyncedAt: at } });
      for (const c of data.courses) { const mapping = resolveCourseUniversity(c.categoryIds, mappings); if (mapping.mappingState === 'mapped') mapped++; else if (mapping.mappingState === 'ambiguous') ambiguous++; else unknown++;
        const fields = { ...c, ...mapping, sourcePublished: true, lastSyncedAt: at };
        await tx.courseExplanation.upsert({ where: { wordpressId: c.wordpressId }, create: fields, update: fields }); }
      await tx.courseExplanation.updateMany({ where: { sourcePublished: true, wordpressId: { notIn: sourceIds } }, data: { sourcePublished: false } });
      await tx.courseCatalogSettings.update({ where: { id: 'main' }, data: { lastSuccessfulSyncAt: at } });
      const result = await tx.courseSyncRun.update({ where: { id: run.id }, data: { status: 'succeeded', inventoryDigest, fetched: sourceIds.length, mapped, unknown, ambiguous, removed, finishedAt: at } });
      await tx.auditLog.create({ data: { administratorId: options.actor?.id, action: 'course_catalog_sync', entity: 'course_catalog', entityId: run.id, details: { fetched: sourceIds.length, mapped, unknown, ambiguous, removed, approvedRemoval, approvedRunId: options.approval?.runId || null } } });
      return result;
    }, { timeout: 60000 });
  } catch (error) {
    const code = error instanceof CatalogSourceError ? error.code : error instanceof HttpError ? error.code : 'SYNC_FAILED';
    await db.courseSyncRun.update({ where: { id: run.id }, data: { status: code === 'REMOVAL_GUARD' ? 'quarantined' : 'failed', inventoryDigest, fetched: fetchedCount, removed: removedCount, errorCode: code, finishedAt: new Date() } });
    throw new HttpError(503, code, code === 'REMOVAL_GUARD' ? 'أُوقفت المزامنة بسبب انخفاض غير متوقع في المصدر. بقي الدليل السابق كاملًا دون تغيير. راجع المصدر قبل المحاولة مجددًا.' : 'لم تكتمل المزامنة. حُفظ آخر دليل ناجح؛ راجع سجل المزامنة.');
  } finally { await db.courseCatalogSettings.updateMany({ where: { id: 'main', leaseToken: token }, data: { leaseToken: null, leaseUntil: null } }); }
}
export async function publicCourseCatalog(db: PrismaClient, search: URLSearchParams) {
  const allowed = ['university', 'search', 'page', 'page_size']; if ([...search.keys()].some(k => !allowed.includes(k))) throw new HttpError(422, 'INVALID_FILTER', 'تصفية الشروحات غير صالحة.');
  const university = search.get('university') || '', term = search.get('search') || '', page = Number(search.get('page') || 1), size = Number(search.get('page_size') || 12);
  if (term.length > 200 || university && !/^[a-z0-9-]{1,100}$/.test(university) || !Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(size) || size < 1 || size > 100) throw new HttpError(422, 'INVALID_FILTER', 'أدخل معايير بحث وأرقام صفحات صحيحة.');
  const where: Prisma.CourseExplanationWhereInput = { sourcePublished: true, mappingState: 'mapped', university: { enabled: true, ...(university && { slug: university }) }, ...(term.trim() && { searchText: { contains: catalogSearch(term), mode: 'insensitive' } }) };
  const [items, total, universities] = await Promise.all([db.courseExplanation.findMany({ where, select: { id: true, title: true, description: true, destinationUrl: true, imageUrl: true, university: { select: { name: true, slug: true } } }, orderBy: [{ title: 'asc' }, { id: 'asc' }], skip: (page-1)*size, take: size }), db.courseExplanation.count({ where }), db.university.findMany({ where: { enabled: true, courseExplanations: { some: { sourcePublished: true, mappingState: 'mapped' } } }, select: { name: true, slug: true, logoUrl: true }, orderBy: { name: 'asc' } })]);
  return { items, total, universities, page, pages: Math.ceil(total / size), page_size: size };
}
