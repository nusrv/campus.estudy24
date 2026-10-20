import { requireAdmin } from "@/server/auth";
import { db } from "@/server/db";
import { failure, json } from "@/server/http";
import { HttpError, readJson } from "@/server/security";
import { settingsSchema } from "@/server/validation";

export async function GET(request: Request) {
  try { await requireAdmin(request, ["owner"]); return json(await db.siteSettings.findUnique({ where: { id: "main" } })); } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin(request, ["owner"]);
    const input = settingsSchema.parse(await readJson(request, 8192));
    const result = await db.$transaction(async tx => {
      const before = await tx.siteSettings.findUnique({ where: { id: "main" } });
      const asOf = input.visitorBaselineAsOf ? new Date(input.visitorBaselineAsOf) : null;
      if (input.visitorBaseline > 0 && asOf && asOf > (before?.trackingStartedAt || new Date())) throw new HttpError(422, "BASELINE_OVERLAP", "Historical visits must precede tracking start to avoid double counting.");
      const data = { ...input, visitorBaselineAsOf: asOf };
      const settings = await tx.siteSettings.upsert({ where: { id: "main" }, create: { id: "main", ...data }, update: data });
      await tx.auditLog.create({ data: { administratorId: auth.administratorId, entity: "settings", entityId: "main", action: "update", details: JSON.parse(JSON.stringify({ before, after: settings })) } });
      return settings;
    }, { isolationLevel: "Serializable" });
    return json(result);
  } catch (error) { return failure(error); }
}
