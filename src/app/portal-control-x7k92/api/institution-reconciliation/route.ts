import { requireAdmin } from '@/server/auth';
import { db } from '@/server/db';
import { failure, json } from '@/server/http';
import { readJson } from '@/server/security';
import { rateLimit } from '@/server/rate-limit';
import { institutionPreflight, reconcileInstitutions } from '@/server/institution-reconciliation';
export async function GET(request: Request) {
  try { const auth = await requireAdmin(request, ['owner']); return json(await institutionPreflight(db, { id: auth.administratorId, sessionId: auth.id })); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request, ['owner']);
    await rateLimit('institution-reconciliation', auth.administratorId, 10, 60);
    return json(await reconcileInstitutions(db, { id: auth.administratorId, sessionId: auth.id }, await readJson(request)));
  } catch (error) { return failure(error); }
}
