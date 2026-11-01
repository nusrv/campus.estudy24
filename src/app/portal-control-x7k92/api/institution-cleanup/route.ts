import { requireAdmin } from '@/server/auth';
import { db } from '@/server/db';
import { failure, json } from '@/server/http';
import { readJson } from '@/server/security';
import { rateLimit } from '@/server/rate-limit';
import { cleanupPreflight, cleanupInstitutions } from '@/server/institution-cleanup';
import { removeQueuedMedia } from '@/server/media-cleanup';
export async function GET(request: Request) {
  try { const auth = await requireAdmin(request, ['owner']); return json(await cleanupPreflight(db, { id: auth.administratorId, sessionId: auth.id })); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request, ['owner']);
    await rateLimit('institution-cleanup', auth.administratorId, 5, 60);
    const result = await cleanupInstitutions(db, { id: auth.administratorId, sessionId: auth.id }, await readJson(request));
    // A filesystem failure cannot turn a committed transaction into a misleading
    // HTTP failure. The existing maintenance command retries the durable queue.
    await removeQueuedMedia(db).catch(() => undefined);
    const pendingFiles = await db.mediaDeletionJob.count().catch(() => null);
    return json({ ...result, pendingFiles });
  } catch (error) { return failure(error); }
}
