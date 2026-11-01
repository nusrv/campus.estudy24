import type { PrismaClient } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
export async function removeQueuedMedia(db: PrismaClient, directory = process.env.UPLOAD_DIR || 'storage/uploads') {
  let removed = 0;
  for (const job of await db.mediaDeletionJob.findMany({ take: 1000, orderBy: { createdAt: 'asc' } })) {
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp|pdf)$/.test(job.filename)) continue;
    if (await db.uploadedMedia.findUnique({ where: { filename: job.filename }, select: { id: true } })) continue;
    try { await unlink(path.join(path.resolve(directory), job.filename)); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') continue; }
    await db.mediaDeletionJob.deleteMany({ where: { filename: job.filename } }); removed++;
  }
  return removed;
}
