import type { Prisma } from '@prisma/client';
import type { AdministratorAccess } from './administrator-access';
import { HttpError } from './security.ts';

export async function scopedMedia(tx: Prisma.TransactionClient, actor: AdministratorAccess, id: string) {
  const file = await tx.uploadedMedia.findUnique({ where: { id } });
  if (!file) throw new HttpError(404, 'NOT_FOUND', 'الملف غير موجود.');
  if (actor.role === 'ambassador' && file.universityId !== actor.universityId) {
    // Legacy uploads have no assignment. Require an existing reference in this university's content.
    const attached = !file.universityId && (await tx.articleMedia.count({ where: { url: `/media/${id}`, article: { universityId: actor.universityId! } } }) || await tx.managedLink.count({ where: { imageUrl: `/media/${id}`, universityId: actor.universityId! } }));
    if (!attached) throw new HttpError(404, 'NOT_FOUND', 'الملف غير متاح لهذا الحساب.');
  }
  return file;
}
export async function validateScopedMedia(tx: Prisma.TransactionClient, actor: AdministratorAccess, input: unknown) {
  if (actor.role !== 'ambassador' || !input || typeof input !== 'object') return;
  const value = input as Record<string, unknown>;
  const urls = [value.imageUrl, ...Array.isArray(value.imageUrls) ? value.imageUrls : [], ...Array.isArray(value.pdfUrls) ? value.pdfUrls : []];
  for (const url of urls) {
    if (typeof url !== 'string') continue;
    let parsed: URL;
    const origin = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
    try { parsed = new URL(url, origin); } catch { continue; } // Let the resource schema report malformed URLs as 422.
    if (parsed.origin !== origin) continue; // External university media are references, not private uploads.
    const match = parsed.pathname.match(/^\/(?:portal-control-x7k92\/api\/)?media\/([^/]+)$/);
    if (match) await scopedMedia(tx, actor, match[1]);
  }
}
