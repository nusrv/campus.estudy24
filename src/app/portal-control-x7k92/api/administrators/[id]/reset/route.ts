import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { authSecret } from '@/server/config';
import { issuePasswordReset } from '@/server/administrator-service';
import { clientKey, rateLimit } from '@/server/rate-limit';
import { id as idSchema } from '@/server/validation';
import { failure, json } from '@/server/http';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireAdmin(request, ['owner']); await rateLimit('issue-reset', clientKey(request.headers), 10, 900); return json(await issuePasswordReset(db, actor.administratorId, idSchema.parse((await params).id), authSecret())); }
  catch (error) { return failure(error); }
}
