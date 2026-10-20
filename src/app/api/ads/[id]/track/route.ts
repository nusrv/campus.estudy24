import { z } from "zod/v4";
import { db } from "@/server/db";
import { appUrl, authSecret } from "@/server/config";
import { activeAdsWhere } from "@/server/public-data";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { failure, json } from "@/server/http";
import { constantEqual, enforceOrigin, HttpError, readJson, tokenDigest } from "@/server/security";
import { id as idSchema } from "@/server/validation";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    enforceOrigin(request.headers, appUrl());
    if (request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1") return json({ counted: false });
    const id = idSchema.parse((await context.params).id);
    const input = z.object({ type: z.enum(["impression", "click"]), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), token: z.string().length(64) }).strict().parse(await readJson(request, 2048));
    const today = new Date().toISOString().slice(0, 10);
    if (input.day !== today || !constantEqual(input.token, tokenDigest(`ad:${id}:${today}`, authSecret()))) throw new HttpError(403, "INVALID_TRACKING_TOKEN", "Tracking token has expired or is invalid.");
    await rateLimit(`ad:${id}:${input.type}`, clientKey(request.headers), input.type === "click" ? 10 : 60, 60);
    const ad = await db.advertisement.findFirst({ where: { ...activeAdsWhere(), id, OR: [{ global: true }, { universities: { some: { university: { enabled: true } } } }] }, select: { id: true } });
    if (!ad) throw new HttpError(404, "NOT_FOUND", "Advertisement not available.");
    const day = new Date(`${today}T00:00:00Z`);
    await db.advertisementDailyMetric.upsert({ where: { advertisementId_day: { advertisementId: id, day } }, create: { advertisementId: id, day, impressions: input.type === "impression" ? 1 : 0, clicks: input.type === "click" ? 1 : 0 }, update: input.type === "impression" ? { impressions: { increment: 1 } } : { clicks: { increment: 1 } } });
    return json({ counted: true });
  } catch (error) { return failure(error); }
}
