import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { lockAdministrators } from "./administrator-service";
import { appUrl, authSecret } from "./config";
import { ADMIN_PATH, SESSION_COOKIE, SESSION_TTL_SECONDS, HttpError, authorizeRole, csrfToken, enforceCsrf, enforceOrigin, newToken, tokenDigest } from "./security";

export async function session() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const record = await db.adminSession.findUnique({ where: { tokenHash: tokenDigest(token, authSecret()) }, include: { administrator: true } });
  if (!record || record.expiresAt.getTime() <= Date.now() || !record.administrator.active) return null;
  return record;
}
export async function requireAdminPage() {
  const record = await session();
  if (!record) redirect(`${ADMIN_PATH}/login`);
  authorizeRole(record.administrator.role, ["owner", "editor"]);
  return record;
}
export async function requireAdmin(request: Request, roles: readonly string[] = ["owner", "editor"]) {
  const record = await session();
  if (!record) throw new HttpError(401, "UNAUTHORIZED", "Administrator authentication is required.");
  authorizeRole(record.administrator.role, roles);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    enforceOrigin(request.headers, appUrl());
    enforceCsrf(request.headers, record.tokenHash, authSecret());
  }
  return record;
}
export function clientCsrf(tokenHash: string) { return csrfToken(tokenHash, authSecret()); }
export async function createSession(administratorId: string, expectedPasswordHash: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const record = await db.$transaction(async tx => {
    await lockAdministrators(tx);
    const admin = await tx.administrator.findUnique({ where: { id: administratorId } });
    if (!admin?.active || admin.passwordHash !== expectedPasswordHash || await tx.adminPasswordReset.count({ where: { administratorId, expiresAt: { gt: new Date() } } })) throw new HttpError(401, "INVALID_CREDENTIALS", "The account requires a password reset or login retry.");
    return tx.adminSession.create({ data: { administratorId, tokenHash: tokenDigest(token, authSecret()), expiresAt } });
  });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: ADMIN_PATH, maxAge: SESSION_TTL_SECONDS, expires: expiresAt });
  return record;
}
export async function destroySession(id: string) {
  await db.adminSession.deleteMany({ where: { id } });
  (await cookies()).set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: ADMIN_PATH, maxAge: 0 });
}
