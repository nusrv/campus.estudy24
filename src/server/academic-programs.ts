import type { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AdministratorAccess } from './administrator-access.ts';
import { academicCreateSchema, academicPatchSchema, academicQuerySchema, verifiedTuition } from './academic-validation.ts';
import { HttpError } from './security.ts';
import { managementQuery } from './management-query.ts';

export const academicPublicSelect = { id: true, universityId: true, title: true, degreeName: true, college: true, department: true, campus: true, creditHours: true, studyMode: true, tuitionInfo: true, tuitionVerified: true, tuitionSourceUrl: true, description: true, sourceUrl: true, officialProgramUrl: true, studyPlanUrl: true, sourceSystem: true, lastSyncedAt: true } as const;
export function academicSourceKey(universityId: string, source: string, externalId: string) { return createHash('sha256').update(JSON.stringify([universityId, source, externalId])).digest('hex'); }
export async function academicList(db: PrismaClient, search: URLSearchParams, actor?: AdministratorAccess) {
  const p = academicQuerySchema.parse(Object.fromEntries(search));
  if (!actor && !p.university) throw new HttpError(422, 'UNIVERSITY_REQUIRED', 'حدد الجامعة لعرض برامجها الأكاديمية.');
  const base: Prisma.AcademicProgramWhereInput = actor ? { ...(actor.role === 'ambassador' && { universityId: actor.universityId! }), ...(p.university && { university: { slug: p.university } }), deletedAt: p.deleted === 'true' ? { not: null } : null, ...(p.status && { status: p.status }) } : { university: { slug: p.university!, enabled: true }, status: 'published', visible: true, deletedAt: null };
  const where: Prisma.AcademicProgramWhereInput = actor ? managementQuery('academic-programs', search, actor).where : { ...base, ...(p.search && { title: { contains: p.search, mode: 'insensitive' as const } }), ...(p.degree && { degreeName: p.degree }), ...(p.college && { college: p.college }), ...(p.department && { department: p.department }) };
  const args = { where, skip: (p.page - 1) * p.page_size, take: p.page_size, orderBy: [{ title: 'asc' as const }, { id: 'asc' as const }] };
  const [items, total, facets] = await Promise.all([
    actor ? db.academicProgram.findMany({ ...args, include: { university: { select: { id: true, name: true, slug: true } } } }) : publicAcademicPage(db, where, args.skip, args.take),
    db.academicProgram.count({ where }),
    db.academicProgram.findMany({ where: base, distinct: ['degreeName', 'college', 'department'], select: { degreeName: true, college: true, department: true } }),
  ]);
  const options = (key: 'degreeName' | 'college' | 'department') => [...new Set(facets.map(row => row[key]).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'ar'));
  return { items, total, page: p.page, page_size: p.page_size, pages: Math.ceil(total / p.page_size), filters: { degrees: options('degreeName'), colleges: options('college'), departments: options('department') } };
}
// Rank before pagination using database predicates, without rewriting official degree names.
export const preferredDegrees: Prisma.AcademicProgramWhereInput = { OR: ['دبلوم', 'بكالور', 'بكالري', 'diploma', 'bachelor'].map(word => ({ degreeName: { contains: word, mode: 'insensitive' } })) };
export async function publicAcademicPage(db: PrismaClient, where: Prisma.AcademicProgramWhereInput, skip: number, take: number) {
  const firstWhere = { AND: [where, preferredDegrees] }, otherWhere = { AND: [where, { OR: [{ degreeName: null }, { NOT: preferredDegrees }] }] };
  const firstCount = await db.academicProgram.count({ where: firstWhere });
  const first = skip < firstCount ? await db.academicProgram.findMany({ where: firstWhere, skip, take, orderBy: [{ title: 'asc' }, { id: 'asc' }], select: academicPublicSelect }) : [];
  const other = first.length < take ? await db.academicProgram.findMany({ where: otherWhere, skip: Math.max(0, skip - firstCount), take: take - first.length, orderBy: [{ title: 'asc' }, { id: 'asc' }], select: academicPublicSelect }) : [];
  return [...first, ...other];
}
export async function saveAcademic(tx: Prisma.TransactionClient, raw: unknown, actor: AdministratorAccess, id?: string) {
  const data = id ? academicPatchSchema.parse(raw) : academicCreateSchema.parse(raw);
  const old = id ? await tx.academicProgram.findFirst({ where: { id, ...(actor.role === 'ambassador' && { universityId: actor.universityId! }) } }) : null;
  if (id && !old) throw new HttpError(404, 'NOT_FOUND', 'البرنامج غير موجود أو غير متاح لهذا الحساب.');
  if (old && data.universityId && data.universityId !== old.universityId) throw new HttpError(422, 'IMMUTABLE_UNIVERSITY', 'لا يمكن نقل البرنامج الأكاديمي إلى جامعة أخرى.');
  const { action, ...fields } = data as typeof data & { action?: 'restore' };
  if (action && !old) throw new HttpError(422, 'RECORD_REQUIRED', 'الاستعادة تتطلب سجلًا موجودًا.');
  const merged = { ...old, ...fields };
  if (!verifiedTuition(merged)) throw new HttpError(422, 'UNVERIFIED_TUITION', 'الرسوم تتطلب تحققًا صريحًا ورابط مصدر. احذف معلومات الرسوم عند عدم توفرها.');
  const edited = old ? Object.keys(fields).filter(key => !['universityId', 'status', 'visible'].includes(key) && JSON.stringify(old[key as keyof typeof old]) !== JSON.stringify(fields[key as keyof typeof fields])) : [];
  if (edited.some(key => ['tuitionInfo', 'tuitionVerified', 'tuitionSourceUrl'].includes(key))) edited.push('tuitionInfo', 'tuitionVerified', 'tuitionSourceUrl');
  const protectedFields = [...new Set([...(old?.editedFields || []), ...edited])];
  const item = old ? await tx.academicProgram.update({ where: { id }, data: { ...fields, editedFields: protectedFields, ...(action === 'restore' && { deletedAt: null }) } }) : await tx.academicProgram.create({ data: { ...academicCreateSchema.parse(raw), origin: 'manual' } });
  await tx.auditLog.create({ data: { administratorId: actor.id, action: old ? 'academic_program_updated' : 'academic_program_created', entity: 'academic-programs', entityId: item.id, details: JSON.parse(JSON.stringify({ actorId: actor.id, universityId: item.universityId, before: old, after: item })) } });
  return item;
}
export async function deleteAcademic(tx: Prisma.TransactionClient, actor: AdministratorAccess, id: string) {
  const old = await tx.academicProgram.findFirst({ where: { id, ...(actor.role === 'ambassador' && { universityId: actor.universityId! }) } });
  if (!old) throw new HttpError(404, 'NOT_FOUND', 'البرنامج غير موجود أو غير متاح لهذا الحساب.');
  const item = await tx.academicProgram.update({ where: { id }, data: { deletedAt: old.deletedAt || new Date() } });
  await tx.auditLog.create({ data: { administratorId: actor.id, action: 'academic_program_deleted', entity: 'academic-programs', entityId: id, details: { actorId: actor.id, universityId: old.universityId } } });
  return { id: item.id };
}
