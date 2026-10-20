import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import { HttpError } from "./security";

export function clientKey(headers: Headers) {
  // With TRUST_PROXY=false the shared bucket intentionally fails closed for all clients.
  const ip = process.env.TRUST_PROXY === "true" ? headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "shared";
  return createHash("sha256").update(ip).digest("hex");
}
export async function rateLimit(scope: string, identity: string, limit: number, seconds: number) {
  const window = Math.floor(Date.now() / (seconds * 1000));
  const key = createHash("sha256").update(`${scope}:${identity}:${window}`).digest("hex");
  const bucket = await db.rateLimitBucket.upsert({ where: { key }, create: { key, count: 1, expiresAt: new Date((window + 1) * seconds * 1000) }, update: { count: { increment: 1 } } });
  if (bucket.count > limit) throw new HttpError(429, "RATE_LIMITED", "Too many requests. Try again later.");
}
