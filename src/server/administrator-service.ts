// No Next.js imports: shared by browser routes, the optional CLI, and DB tests.
import type { PrismaClient, Prisma } from '@prisma/client';
import { constantEqual, hashPassword, HttpError, newToken, tokenDigest } from './security.ts';
type Transaction = Prisma.TransactionClient;
export const administratorSelect = { id: true, email: true, name: true, role: true, active: true, createdAt: true } as const;
// All account writes share a PostgreSQL transaction lock, across processes/replicas.
export async function lockAdministrators(tx: Transaction) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(214721, 792)`;
}
export async function bootstrapAvailable(db: PrismaClient) {
  return !(await db.administrationBootstrap.findUnique({ where: { id: 'initial-owner' } })) && await db.administrator.count() === 0;
}
export function authorizeBootstrap(provided: string, configured = process.env.ADMIN_BOOTSTRAP_TOKEN || '') {
  if (configured.length < 32 || configured.length > 256 || !constantEqual(provided, configured)) throw new HttpError(403, 'BOOTSTRAP_FORBIDDEN', 'Initial setup is not authorized.');
}
export async function createInitialOwner(db: PrismaClient, input: { email: string; name: string; password: string }) {
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async tx => {
    await lockAdministrators(tx);
    if (await tx.administrationBootstrap.count() || await tx.administrator.count()) throw new HttpError(409, 'SETUP_COMPLETE', 'Initial setup is already complete.');
    await tx.administrationBootstrap.create({ data: { id: 'initial-owner' } });
    const admin = await tx.administrator.create({ data: { email: input.email, name: input.name, passwordHash, role: 'owner' }, select: administratorSelect });
    await tx.auditLog.create({ data: { administratorId: admin.id, action: 'initial_administrator_created', entity: 'administrators', entityId: admin.id } });
    return admin;
  }, { timeout: 15000 });
}
async function requireOwner(tx: Transaction, actorId: string) {
  const actor = await tx.administrator.findUnique({ where: { id: actorId } });
  if (!actor?.active || actor.role !== 'owner') throw new HttpError(403, 'FORBIDDEN', 'Owner access is required.');
}
export async function createEditor(db: PrismaClient, actorId: string, input: { email: string; name: string; password: string }) {
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async tx => {
    await lockAdministrators(tx); await requireOwner(tx, actorId);
    const admin = await tx.administrator.create({ data: { email: input.email, name: input.name, passwordHash, role: 'editor' }, select: administratorSelect });
    await tx.auditLog.create({ data: { administratorId: actorId, action: 'administrator_created', entity: 'administrators', entityId: admin.id } });
    return admin;
  });
}
export async function changeAdministrator(db: PrismaClient, actorId: string, id: string, input: { email: string; name: string; active: boolean } | null) {
  return db.$transaction(async tx => {
    await lockAdministrators(tx); await requireOwner(tx, actorId);
    const before = await tx.administrator.findUnique({ where: { id }, select: administratorSelect });
    if (!before) throw new HttpError(404, 'NOT_FOUND', 'Administrator not found.');
    if (id === actorId && (!input || !input.active)) throw new HttpError(409, 'SELF_PROTECTION', 'You cannot remove or disable your own account.');
    if (before.active && before.role === 'owner' && (!input || !input.active) && await tx.administrator.count({ where: { role: 'owner', active: true } }) <= 1) throw new HttpError(409, 'LAST_OWNER', 'The last active owner must be preserved.');
    await tx.adminSession.deleteMany({ where: { administratorId: id } });
    await tx.adminPasswordReset.deleteMany({ where: { administratorId: id } });
    const after = input ? await tx.administrator.update({ where: { id }, data: input, select: administratorSelect }) : null;
    if (!input) await tx.administrator.delete({ where: { id } });
    await tx.auditLog.create({ data: { administratorId: actorId, action: input ? 'administrator_updated' : 'administrator_removed', entity: 'administrators', entityId: id, details: { before: JSON.parse(JSON.stringify(before)), after: after ? JSON.parse(JSON.stringify(after)) : null } } });
    return after;
  });
}
export async function issuePasswordReset(db: PrismaClient, actorId: string, id: string, secret: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db.$transaction(async tx => {
    await lockAdministrators(tx); await requireOwner(tx, actorId);
    const admin = await tx.administrator.findUnique({ where: { id } });
    if (!admin?.active) throw new HttpError(409, 'INACTIVE_ACCOUNT', 'An active administrator is required.');
    await tx.adminSession.deleteMany({ where: { administratorId: id } });
    await tx.adminPasswordReset.deleteMany({ where: { administratorId: id } });
    await tx.adminPasswordReset.create({ data: { administratorId: id, tokenHash: tokenDigest(token, secret), expiresAt } });
    await tx.auditLog.create({ data: { administratorId: actorId, action: 'password_reset_issued', entity: 'administrators', entityId: id } });
  });
  return { token, expiresAt };
}
export async function redeemPasswordReset(db: PrismaClient, input: { email: string; token: string; password: string }, secret: string) {
  const passwordHash = await hashPassword(input.password);
  await db.$transaction(async tx => {
    await lockAdministrators(tx);
    const reset = await tx.adminPasswordReset.findUnique({ where: { tokenHash: tokenDigest(input.token, secret) }, include: { administrator: true } });
    if (!reset || reset.expiresAt <= new Date() || !reset.administrator.active || reset.administrator.email !== input.email) throw new HttpError(400, 'INVALID_RESET', 'The reset authorization is invalid or expired.');
    await tx.administrator.update({ where: { id: reset.administratorId }, data: { passwordHash } });
    await tx.adminSession.deleteMany({ where: { administratorId: reset.administratorId } });
    await tx.adminPasswordReset.deleteMany({ where: { administratorId: reset.administratorId } });
    await tx.auditLog.create({ data: { administratorId: reset.administratorId, action: 'password_reset_completed', entity: 'administrators', entityId: reset.administratorId } });
  });
}
