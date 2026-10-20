import { cookies } from "next/headers";
import { z } from "zod/v4";
import { appUrl, authSecret } from "@/server/config";
import { claimVisit, visitorSummary } from "@/server/visitors";
import { failure, json } from "@/server/http";
import { enforceOrigin, readJson, tokenDigest } from "@/server/security";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { obviousBot, readVisitorCookie, visitorCookie, VISIT_WINDOW_SECONDS, VISITOR_COOKIE } from "@/server/visitor-policy";

export const runtime = "nodejs";
export async function GET() { try { return json(await visitorSummary()); } catch (error) { return failure(error); } }
export async function POST(request: Request) {
  try {
    enforceOrigin(request.headers, appUrl());
    if (obviousBot(request.headers) || request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1") return json({ counted: false });
    const input = z.object({ nonce: z.uuid() }).strict().parse(await readJson(request, 1024));
    const summary = await visitorSummary();
    if (!summary.enabled) return json({ counted: false, ...summary });
    await rateLimit("visits", clientKey(request.headers), 120, 60);
    const jar = await cookies();
    const now = Date.now();
    const secret = authSecret();
    const previous = readVisitorCookie(jar.get(VISITOR_COOKIE)?.value || "", secret, now);
    const nonce = previous?.nonce || input.nonce;
    const counted = await claimVisit(tokenDigest(`visit:${nonce}`, secret), new Date(now));
    if (!previous) jar.set(VISITOR_COOKIE, visitorCookie(nonce, secret, now), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/visitors", maxAge: VISIT_WINDOW_SECONDS });
    return json({ counted, ...await visitorSummary() });
  } catch (error) { return failure(error); }
}
