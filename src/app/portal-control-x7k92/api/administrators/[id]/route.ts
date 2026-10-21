import { db } from '@/server/db';
import { requireAdmin } from '@/server/auth';
import { changeAdministrator } from '@/server/administrator-service';
import { administratorUpdateSchema } from '@/server/administrator-validation';
import { id as idSchema } from '@/server/validation';
import { readJson } from '@/server/security';
import { failure, json } from '@/server/http';
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try { const actor = await requireAdmin(request, ['owner']); const id = idSchema.parse((await context.params).id); const input = administratorUpdateSchema.parse(await readJson(request, 4096)); return json(await changeAdministrator(db, actor.administratorId, id, input)); }
  catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try { const actor = await requireAdmin(request, ['owner']); const id = idSchema.parse((await context.params).id); await changeAdministrator(db, actor.administratorId, id, null); return json({ ok: true }); }
  catch (error) { return failure(error); }
}
