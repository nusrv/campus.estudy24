import { requireAdmin } from "@/server/auth";
import { adminList, resourceName, saveResource } from "@/server/admin-data";
import { failure, json } from "@/server/http";
import { readJson } from "@/server/security";

type Context = { params: Promise<{ resource: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  try { const auth = await requireAdmin(request); return json(await adminList(resourceName((await context.params).resource), new URL(request.url).searchParams, auth.administratorId, auth.id)); } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try { const auth = await requireAdmin(request); const resource = resourceName((await context.params).resource); if (["sources", "universities"].includes(resource)) await requireAdmin(request, ["owner"]); return json(await saveResource(resource, await readJson(request), auth.administratorId, undefined, undefined, auth.id), 201); } catch (error) { return failure(error); }
}
