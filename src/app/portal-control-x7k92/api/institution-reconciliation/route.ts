// Retired wizard: authenticated read-only diagnostics remain available to Owner.
import { requireAdmin } from '@/server/auth';
import { db } from '@/server/db';
import { failure, json } from '@/server/http';
import { cleanupPreflight } from '@/server/institution-cleanup';
export async function GET(request: Request) {
  try { const auth = await requireAdmin(request, ['owner']); return json(await cleanupPreflight(db, { id: auth.administratorId, sessionId: auth.id })); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { await requireAdmin(request, ['owner']); return json({ error: { code: 'RETIRED', message: 'انتقلت العملية إلى إدارة المؤسسات.' } }, 410); }
  catch (error) { return failure(error); }
}
