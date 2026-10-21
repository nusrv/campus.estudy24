import type { PrismaClient } from '@prisma/client';
import { newToken, HttpError } from './security.ts';
import { apiKeyHash, keyMatches } from './integration-policy.ts';
export const apiKeySelect = { id: true, universityId: true, createdAt: true, revokedAt: true } as const;
export async function manageUniversityKey(db: PrismaClient, actorId: string, universityId: string, action: 'create' | 'rotate' | 'revoke') {
  return db.$transaction(async tx => {
    // Stable row lock serializes creates/rotations across all application instances.
    await tx.$queryRaw`SELECT "id" FROM "University" WHERE "id" = ${universityId} FOR UPDATE`;
    const owner = await tx.administrator.findUnique({ where: { id: actorId } });
    if (!owner?.active || owner.role !== 'owner') throw new HttpError(403, 'FORBIDDEN', 'إدارة مفاتيح API متاحة للمالك فقط.');
    const university = await tx.university.findUnique({ where: { id: universityId } });
    if (!university) throw new HttpError(404, 'NOT_FOUND', 'الجامعة غير موجودة.');
    const current = await tx.universityApiKey.findFirst({ where: { universityId, revokedAt: null } });
    if (action === 'create' && current) throw new HttpError(409, 'KEY_EXISTS', 'يوجد مفتاح نشط. استخدم استبدال المفتاح.');
    if (action !== 'create') await tx.universityApiKey.updateMany({ where: { universityId, revokedAt: null }, data: { revokedAt: new Date() } });
    let secret: string | undefined;
    let record;
    if (action !== 'revoke') {
      if (!university.enabled) throw new HttpError(409, 'UNIVERSITY_DISABLED', 'فعّل الجامعة قبل إنشاء المفتاح.');
      const entropy = newToken();
      // The public row ID is not an authentication secret; all 256 random bits are hashed.
      const created = await tx.universityApiKey.create({ data: { universityId, keyHash: apiKeyHash(entropy) }, select: apiKeySelect });
      secret = `campus_uak_${created.id}.${entropy}`;
      record = created;
    }
    await tx.auditLog.create({ data: { administratorId: actorId, action: `university_key_${action}`, entity: 'university_api_keys', entityId: universityId, details: { keyId: record?.id || current?.id || null } } });
    return { record: record || null, ...(secret ? { secret } : {}) };
  });
}
export async function authenticateUniversityKey(db: PrismaClient, bearer: string) {
  const parsed = /^campus_uak_([a-zA-Z0-9_-]{1,100})\.([A-Za-z0-9_-]{43})$/.exec(bearer);
  if (!parsed) throw new HttpError(401, 'UNAUTHORIZED', 'مفتاح API غير صالح.');
  const key = await db.universityApiKey.findUnique({ where: { id: parsed[1] }, include: { university: true } });
  if (!key || key.revokedAt || !key.university.enabled || !keyMatches(parsed[2], key.keyHash)) throw new HttpError(401, 'UNAUTHORIZED', 'مفتاح API غير صالح أو ملغى.');
  return { keyId: key.id, universityId: key.universityId, universitySlug: key.university.slug };
}
