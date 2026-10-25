import { requireAdmin } from '@/server/auth';
import { db } from '@/server/db';
import { readJson } from '@/server/security';
import { bulkOperation } from '@/server/bulk-service';
import { failure, json } from '@/server/http';
import { rateLimit } from '@/server/rate-limit';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  try { const actor = await requireAdmin(request); await rateLimit('admin-bulk', actor.id, 180, 60); return json(await bulkOperation(db, (await context.params).resource, await readJson(request), actor.administratorId, actor.id)); }
  catch (error) { return failure(error); }
}
