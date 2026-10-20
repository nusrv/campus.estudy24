import { destroySession, requireAdmin } from "@/server/auth";
import { db } from "@/server/db";
import { failure, json } from "@/server/http";
export async function POST(request: Request) {
  try { const auth = await requireAdmin(request); await destroySession(auth.id); await db.auditLog.create({ data: { administratorId: auth.administratorId, action: "logout", entity: "authentication" } }); return json({ ok: true }); } catch (error) { return failure(error); }
}
