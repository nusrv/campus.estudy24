import { requireAdmin } from "@/server/auth";
import { db } from "@/server/db";
import { failure, json } from "@/server/http";
import { readJson } from "@/server/security";
import { settingsSchema } from "@/server/validation";
const settingsSelect = { visitorStartingValue: true, visitorCounterEnabled: true, visitorCounterLabel: true } as const;

export async function GET(request: Request) {
  try { await requireAdmin(request, ["owner"]); return json(await db.siteSettings.findUnique({ where: { id: "main" }, select: settingsSelect })); } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin(request, ["owner"]);
    const input = settingsSchema.parse(await readJson(request, 8192));
    const result = await db.$transaction(async tx => {
      const before = await tx.siteSettings.findUnique({ where: { id: "main" }, select: settingsSelect });
      const settings = await tx.siteSettings.upsert({ where: { id: "main" }, create: { id: "main", ...input }, update: input, select: settingsSelect });
      await tx.auditLog.create({ data: { administratorId: auth.administratorId, entity: "settings", entityId: "main", action: "update", details: JSON.parse(JSON.stringify({ before, after: settings })) } });
      return settings;
    }, { isolationLevel: "Serializable" });
    return json(result);
  } catch (error) { return failure(error); }
}
