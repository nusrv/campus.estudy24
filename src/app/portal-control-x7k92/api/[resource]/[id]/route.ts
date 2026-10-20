import { requireAdmin } from "@/server/auth";
import { articleDetails, deleteResource, resourceName, saveResource } from "@/server/admin-data";
import { failure, json } from "@/server/http";
import { HttpError, readJson } from "@/server/security";
import { id as idSchema } from "@/server/validation";

type Context = { params: Promise<{ resource: string; id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  try { await requireAdmin(request); const { resource, id } = await context.params; idSchema.parse(id); if (resource !== "articles") throw new HttpError(404, "NOT_FOUND", "Detail resource not found."); return json(await articleDetails(id)); } catch (error) { return failure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { const auth = await requireAdmin(request); const params = await context.params; const resource = resourceName(params.resource); idSchema.parse(params.id); if (["sources", "universities"].includes(resource)) await requireAdmin(request, ["owner"]); return json(await saveResource(resource, await readJson(request), auth.administratorId, params.id)); } catch (error) { return failure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try { const auth = await requireAdmin(request, ["owner"]); const { resource, id } = await context.params; idSchema.parse(id); return json(await deleteResource(resourceName(resource), id, auth.administratorId)); } catch (error) { return failure(error); }
}
