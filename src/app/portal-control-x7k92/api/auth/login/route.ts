import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { appUrl, authSecret } from "@/server/config";
import { createSession, session, destroySession } from "@/server/auth";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { enforceOrigin, HttpError, readJson, verifyPassword } from "@/server/security";
import { loginSchema } from "@/server/validation";
import { failure, json } from "@/server/http";

export const runtime = "nodejs";
// Well-formed dummy hash equalizes the expensive verification path for unknown accounts.
const DUMMY_HASH = `scrypt:32768:8:1:${"0".repeat(32)}:${"0".repeat(128)}`;
export async function POST(request: Request) {
  try {
    enforceOrigin(request.headers, appUrl());
    authSecret();
    await rateLimit("login-ip", clientKey(request.headers), 10, 900);
    const input = loginSchema.parse(await readJson(request, 4096));
    const identity = createHash("sha256").update(input.email).digest("hex");
    await rateLimit("login-account", identity, 5, 900);
    const administrator = await db.administrator.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(input.password, administrator?.passwordHash || DUMMY_HASH);
    if (!administrator || !administrator.active || !valid) {
      await db.auditLog.create({ data: { action: "login_failed", entity: "authentication" } });
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }
    const old = await session();
    if (old) await destroySession(old.id);
    await createSession(administrator.id);
    await db.auditLog.create({ data: { administratorId: administrator.id, action: "login", entity: "authentication" } });
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
