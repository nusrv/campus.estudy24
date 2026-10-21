import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { administratorSelect, createAdministrator } from '@/server/administrator-service';
import { administratorCreateSchema } from '@/server/administrator-validation';
import { readJson } from '@/server/security';
import { failure, json } from '@/server/http';
export async function GET(request: Request) {
  try { await requireAdmin(request, ['owner']); return json(await db.administrator.findMany({ select: administratorSelect, orderBy: { createdAt: 'asc' } })); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { const actor = await requireAdmin(request, ['owner']); const input = administratorCreateSchema.parse(await readJson(request, 4096)); return json(await createAdministrator(db, actor.administratorId, input), 201); }
  catch (error) { return failure(error); }
}
