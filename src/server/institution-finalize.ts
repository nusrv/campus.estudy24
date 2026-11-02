import type { PrismaClient, Prisma } from '@prisma/client';
import { stat } from 'node:fs/promises';
import { cleanupInstitutionsForMaintenance, cleanupTargets, retainedNames } from './institution-cleanup.ts';
import { syncCourseCatalogForMaintenance } from './course-catalog-service.ts';
import { fetchCatalogInventory, type CatalogInventory } from './course-source.ts';
import { removeQueuedMedia } from './media-cleanup.ts';
import { HttpError } from './security.ts';
import { VERIFIED_COURSE_MAPPINGS, resolveCourseUniversity } from '../lib/course-catalog.ts';
import { institutionalIdentity, reconciliationInstitutions } from '../lib/institutions.ts';

export function finalizeDatabaseUrl(value: string | undefined) {
  if (!value) throw new HttpError(500, 'DATABASE_CONFIGURATION', 'لم يصل DATABASE_URL إلى أمر Plesk. لم تُغيّر أي بيانات.');
  try {
    const u = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(u.protocol) || !u.hostname || u.pathname.length < 2 || u.hash || value.trim() !== value) throw new Error();
  } catch { throw new HttpError(500, 'DATABASE_CONFIGURATION', 'إعداد اتصال PostgreSQL غير صالح. لم تُغيّر أي بيانات.'); }
  return value;
}
export type FinalizeResult = {
  alreadyCompleted: boolean; institutions: number; mappings: number;
  fetched: number; mapped: number; unknown: number; ambiguous: number; pendingFiles: number;
};
export class InstitutionFinalizeError extends Error {
  code: string; reconciled: boolean; synchronized: boolean; pendingFiles: number | null; diagnostic: string;
  constructor(error: unknown, reconciled: boolean, synchronized: boolean, pendingFiles: number | null) {
    super('Institution finalization did not complete');
    this.code = error instanceof HttpError ? error.code : 'FINALIZE_FAILED';
    this.diagnostic = error instanceof HttpError ? error.message : 'تعذر إتمام المرحلة؛ راجع اتصال قاعدة البيانات وسجل التطبيق.';
    this.reconciled = reconciled; this.synchronized = synchronized; this.pendingFiles = pendingFiles;
  }
}
type Tx = Prisma.TransactionClient;
async function verifyInstitutions(tx: Tx) {
  const universities = await tx.university.findMany(), mappings = await tx.courseUniversityMapping.findMany();
  const require = (ok: unknown) => { if (!ok) throw new HttpError(409, 'FINAL_INVENTORY_INVALID', 'لم يطابق فحص المؤسسات والروابط القائمة العشر المعتمدة.'); };
  require(universities.length === 10 && mappings.length === 10 && !universities.some(u => cleanupTargets.some(t => t.slug === u.slug)));
  for (const m of VERIFIED_COURSE_MAPPINGS) {
    const u = universities.find(u => u.slug === m.slug);
    require(u && institutionalIdentity(u.name) === institutionalIdentity(retainedNames[m.slug]) && u.institutionType === 'UNIVERSITY' && u.enabled && u.showInDirectory && mappings.some(row => row.categoryId === m.categoryId && row.enabled && row.universityId === u.id));
  }
  for (const identity of reconciliationInstitutions) {
    const rows = universities.filter(u => institutionalIdentity(u.name) === institutionalIdentity(identity.name)), u = rows[0];
    require(rows.length === 1 && u.institutionType === identity.institutionType && u.enabled && u.showInDirectory && mappings.some(row => row.categoryId === identity.categoryId && row.enabled && row.universityId === u.id));
  }
  return { universities, mappings };
}
export async function finalizeInstitutions(db: PrismaClient, options: { inventory?: () => Promise<CatalogInventory>; directory?: string } = {}): Promise<FinalizeResult> {
  let reconciled = false, synchronized = false, pendingFiles: number | null = null;
  try {
    // A rerun may fail storage/configuration checks after an earlier committed
    // cleanup. Keep that durable outcome visible in its partial-success status.
    reconciled = !!await db.auditLog.findFirst({ where: { action: 'approved_institution_cleanup_v1' }, select: { id: true } });
    const directory = options.directory || process.env.UPLOAD_DIR;
    const fileWork = await db.uploadedMedia.count({ where: { university: { slug: { in: cleanupTargets.map(t => t.slug) } } } }) + await db.mediaDeletionJob.count();
    if (fileWork && (!directory || !await stat(directory).then(s => s.isDirectory()).catch(() => false))) throw new HttpError(500, 'UPLOAD_CONFIGURATION', 'لم يصل مسار UPLOAD_DIR الصحيح أو تعذر الوصول إليه. لم يبدأ الحذف.');
    // Capture retained identities before the transaction, including safe reruns.
    const retained = await db.university.findMany({ where: { slug: { in: VERIFIED_COURSE_MAPPINGS.map(m => m.slug) } }, select: { id: true, name: true, slug: true } });
    const cleanup = await cleanupInstitutionsForMaintenance(db); reconciled = true;
    await db.$transaction(tx => verifyInstitutions(tx), { isolationLevel: 'RepeatableRead' });
    // Drain in bounded chunks; an inaccessible file remains queued for a rerun
    // and the existing daily maintenance, never a false success.
    try {
      for (let chunk = 0; chunk < 100 && await removeQueuedMedia(db, directory) > 0; chunk++) { /* next bounded chunk */ }
      pendingFiles = await db.mediaDeletionJob.count();
    } catch { pendingFiles = await db.mediaDeletionJob.count().catch(() => null); }
    let inventory: CatalogInventory | undefined;
    const run = await syncCourseCatalogForMaintenance(db, { inventory: async () => {
      inventory = await (options.inventory || fetchCatalogInventory)(); return inventory;
    } });
    synchronized = true;
    const verified = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(270001)`;
      const state = await verifyInstitutions(tx);
      if (retained.length !== 7 || retained.some(u => !state.universities.some(row => row.id === u.id && row.name === u.name && row.slug === u.slug))) throw new HttpError(409, 'RETAINED_IDENTITY_CHANGED', 'تعذر التحقق من حفظ هويات المؤسسات السبع.');
      const rows = await tx.courseExplanation.findMany({ where: { sourcePublished: true } });
      const source = inventory!;
      const expectedCategories = [...VERIFIED_COURSE_MAPPINGS, ...reconciliationInstitutions].map(m => m.categoryId);
      const byId = new Map(rows.map(row => [row.wordpressId, row]));
      if (run.status !== 'succeeded' || rows.length !== source.courses.length || run.fetched !== rows.length || expectedCategories.some(id => !source.categories.some(c => c.id === id))) throw new HttpError(409, 'CATALOG_VERIFICATION_FAILED', 'لم يطابق فحص الدليل جرد المصدر الكامل.');
      for (const course of source.courses) {
        const actual = byId.get(course.wordpressId), mapping = resolveCourseUniversity(course.categoryIds, state.mappings);
        if (!actual || actual.title !== course.title || actual.description !== course.description || actual.destinationUrl !== course.destinationUrl || actual.imageUrl !== course.imageUrl || actual.universityId !== mapping.universityId || actual.mappingState !== mapping.mappingState) throw new HttpError(409, 'CATALOG_VERIFICATION_FAILED', 'لم يطابق فحص الشروحات بيانات المصدر وروابط المؤسسات.');
      }
      const mapped = rows.filter(r => r.mappingState === 'mapped').length, unknown = rows.filter(r => r.mappingState === 'unknown').length, ambiguous = rows.filter(r => r.mappingState === 'ambiguous').length;
      if (ambiguous || mapped !== run.mapped || unknown !== run.unknown || ambiguous !== run.ambiguous) throw new HttpError(409, 'CATALOG_MAPPING_CONFLICT', 'يوجد تعارض أو اختلاف في أعداد الشروحات المرتبطة.');
      const result = { institutions: state.universities.length, mappings: state.mappings.length, fetched: rows.length, mapped, unknown, ambiguous };
      await tx.auditLog.create({ data: { action: 'institution_finalize_verified', entity: 'institution_directory', details: { ...result, runId: run.id, execution: 'plesk_cli' } } });
      return result;
    }, { isolationLevel: 'RepeatableRead', timeout: 60000 });
    pendingFiles = await db.mediaDeletionJob.count();
    return { ...verified, alreadyCompleted: 'alreadyCompleted' in cleanup && cleanup.alreadyCompleted === true, pendingFiles };
  } catch (error) { throw new InstitutionFinalizeError(error, reconciled, synchronized, pendingFiles); }
}
export function finalizeSummary(result: FinalizeResult) {
  return [
    result.alreadyCompleted ? 'تنظيم المؤسسات مكتمل سابقًا؛ تم التحقق منه مجددًا.' : 'تم حذف المؤسسات الثلاث وبياناتها الخاصة وتنظيم المؤسسات المعتمدة.',
    `تم التحقق من ${result.institutions} مؤسسات و${result.mappings} روابط.`,
    `الشروحات: المصدر ${result.fetched}، المرتبطة ${result.mapped}، خارج الربط ${result.unknown}، المتعارضة ${result.ambiguous}.`,
    `الملفات المتبقية في طابور الحذف: ${result.pendingFiles}.`,
    result.pendingFiles ? 'اكتمل تنظيم المؤسسات والمزامنة؛ حذف بعض الملفات لم يكتمل. أعد الأمر بعد معالجة صلاحيات التخزين.' : 'اكتملت العملية بنجاح.',
  ].join('\n');
}
export function finalizeFailure(error: unknown) {
  const e = error instanceof InstitutionFinalizeError ? error : new InstitutionFinalizeError(error, false, false, null);
  const phase = !e.reconciled ? 'تعذر إتمام مرحلة تنظيم المؤسسات. أعد الأمر بعد معالجة السبب؛ الحذف داخل معاملة واحدة.' : !e.synchronized ? 'اكتمل تنظيم المؤسسات، لكن المزامنة لم تكتمل. أعد الأمر؛ لن يتكرر الحذف.' : 'اكتمل تنظيم المؤسسات والمزامنة، لكن التحقق النهائي لم ينجح. أعد الأمر بعد معالجة السبب.';
  return { exitCode: e.reconciled ? 2 : 1, message: `${phase}\n${e.diagnostic} (${e.code})\nالملفات المتبقية: ${e.pendingFiles === null ? 'غير متحقق' : e.pendingFiles}.` };
}
