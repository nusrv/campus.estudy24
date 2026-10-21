// Shared policy used by routes, pages and transactional content operations.
import type { Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from './security.ts';
import { lockAdministrators } from './administrator-service.ts';

export const ambassadorResources = ['articles', 'links', 'events', 'programs'] as const;
export type AdministratorAccess = { id: string; role: string; universityId: string | null; university: { id: string; name: string; slug: string; enabled: boolean } | null };
export async function administratorAccess(db: PrismaClient | Prisma.TransactionClient, id: string, writing = false, sessionId?: string): Promise<AdministratorAccess> {
  // Account reassignment, disabling and content writes share the same transaction lock.
  if (writing) {
    await lockAdministrators(db as Prisma.TransactionClient);
    await db.$queryRaw`SELECT "id" FROM "Administrator" WHERE "id" = ${id} FOR UPDATE`;
    if (sessionId) await db.$queryRaw`SELECT "id" FROM "AdminSession" WHERE "id" = ${sessionId} AND "administratorId" = ${id} FOR UPDATE`;
  }
  if (sessionId && !await db.adminSession.findFirst({ where: { id: sessionId, administratorId: id, expiresAt: { gt: new Date() } }, select: { id: true } })) throw new HttpError(401, 'UNAUTHORIZED', 'انتهت الجلسة. سجّل الدخول مجددًا.');
  const actor = await db.administrator.findUnique({ where: { id }, select: { id: true, role: true, active: true, universityId: true, university: { select: { id: true, name: true, slug: true, enabled: true } } } });
  if (!actor?.active || !['owner', 'editor', 'ambassador'].includes(actor.role) || (actor.role === 'ambassador' && (!actor.universityId || !actor.university?.enabled))) throw new HttpError(403, 'FORBIDDEN', 'الحساب غير مخوّل أو الجامعة غير مفعّلة.');
  return actor;
}
export function contentPermission(actor: AdministratorAccess, resource: string, operation: 'read' | 'write' | 'delete' = 'read') {
  if (actor.role === 'ambassador') {
    if (!(ambassadorResources as readonly string[]).includes(resource)) throw new HttpError(403, 'FORBIDDEN', 'هذا القسم غير متاح لسفير الجامعة.');
  } else if (actor.role !== 'owner' && (operation === 'delete' || (operation === 'write' && ['universities', 'sources'].includes(resource)))) {
    throw new HttpError(403, 'FORBIDDEN', 'هذه العملية متاحة لمدير المنصة فقط.');
  }
}
export function universityScope(actor: AdministratorAccess) { return actor.role === 'ambassador' ? { universityId: actor.universityId! } : {}; }
export function bindUniversity(actor: AdministratorAccess, raw: unknown) {
  if (actor.role !== 'ambassador' || !raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const data = raw as Record<string, unknown>;
  if (('universityId' in data && data.universityId !== actor.universityId) || 'universityIds' in data || 'university' in data || 'university_slug' in data || 'universitySlug' in data || 'university_id' in data || 'global' in data) throw new HttpError(403, 'UNIVERSITY_SCOPE', 'لا يمكن تغيير الجامعة المعيّنة أو إنشاء محتوى عام.');
  return { ...data, universityId: actor.universityId };
}
export async function scopedRecord(tx: Prisma.TransactionClient, actor: AdministratorAccess, resource: string, id: string) {
  if (actor.role !== 'ambassador') return;
  const where = { id, universityId: actor.universityId! };
  const item = resource === 'articles' ? await tx.article.findFirst({ where, select: { id: true } }) : resource === 'links' ? await tx.managedLink.findFirst({ where, select: { id: true } }) : resource === 'events' ? await tx.event.findFirst({ where, select: { id: true } }) : resource === 'programs' ? await tx.program.findFirst({ where, select: { id: true } }) : null;
  if (!item) throw new HttpError(404, 'NOT_FOUND', 'المحتوى غير موجود أو غير متاح لهذا الحساب.');
}
export async function revokeUniversitySessions(tx: Prisma.TransactionClient, universityId: string) {
  const where = { administrator: { role: 'ambassador' as const, universityId } };
  await tx.adminSession.deleteMany({ where });
  await tx.adminPasswordReset.deleteMany({ where });
}
