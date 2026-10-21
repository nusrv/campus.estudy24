import { z } from 'zod/v4';
import { requireAdmin } from '@/server/auth';
import { db } from '@/server/db';
import { failure, json } from '@/server/http';
import { readJson } from '@/server/security';
import { id as idSchema } from '@/server/validation';
import { manageUniversityKey, apiKeySelect } from '@/server/university-keys';
import { rateLimit } from '@/server/rate-limit';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  try { await requireAdmin(request, ['owner']); const universityId = idSchema.parse((await params).id); return json(await db.universityApiKey.findMany({ where: { universityId }, select: apiKeySelect, orderBy: { createdAt: 'desc' }, take: 20 })); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await requireAdmin(request, ['owner']);
    await rateLimit('manage-university-keys', actor.administratorId, 20, 900);
    const { action } = z.object({ action: z.enum(['create', 'rotate', 'revoke']) }).strict().parse(await readJson(request, 1024));
    return json(await manageUniversityKey(db, actor.administratorId, idSchema.parse((await params).id), action), action === 'create' ? 201 : 200);
  } catch (error) { return failure(error); }
}
