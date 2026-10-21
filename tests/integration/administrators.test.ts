import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { ADMIN_PATH, csrfToken, tokenDigest, verifyPassword } from '../../src/server/security.ts';
import { createInitialOwner, createEditor, changeAdministrator, issuePasswordReset, redeemPasswordReset } from '../../src/server/administrator-service.ts';
const databaseUrl = process.env.TEST_DATABASE_URL;
test('PostgreSQL + HTTP: protected bootstrap, concurrent setup, administrator permissions, resets and last owner', { skip: !databaseUrl, timeout: 240000 }, async t => {
  assert.match(new URL(databaseUrl!).pathname, /_test$/);
  const secret = randomBytes(48).toString('hex');
  const bootstrapToken = randomBytes(32).toString('hex');
  const password = randomBytes(8).toString('hex').slice(0, 8);
  const listener = createServer().listen(0, '127.0.0.1'); await once(listener, 'listening');
  const address = listener.address(); assert.ok(address && typeof address === 'object'); const port = address.port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const origin = `http://localhost:${port}`;
  const environment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, AUTH_SECRET: secret, ADMIN_BOOTSTRAP_TOKEN: bootstrapToken, APP_URL: origin, NODE_ENV: 'development', TRUST_PROXY: 'false' };
  const migrate = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: environment, encoding: 'utf8' });
  assert.equal(migrate.status, 0, 'Test migration failed.');
  const { createDatabase } = await import('../../src/server/database-client.ts');
  const db = createDatabase(databaseUrl);
  // This suite needs an empty disposable test database. It never clears pre-existing accounts.
  assert.equal(await db.administrator.count(), 0, 'Use an empty, disposable _test database.');
  assert.equal(await db.administrationBootstrap.count(), 0, 'Test bootstrap must be unused.');
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-p', String(port)], { env: environment, stdio: 'ignore' });
  const ids: string[] = [];
  const email = `owner-${randomBytes(6).toString('hex')}@test.invalid`;
  const ownerInput = { email, name: 'Test owner', password, confirmation: password, bootstrapToken };
  async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(origin + path, { method: 'POST', headers: { origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), redirect: 'manual' });
  }
  async function login(accountEmail: string, accountPassword: string) {
    const response = await post(`${ADMIN_PATH}/api/auth/login`, { email: accountEmail, password: accountPassword });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    const digest = tokenDigest(cookie.slice(cookie.indexOf('=') + 1), secret);
    return { cookie, 'x-csrf-token': csrfToken(digest, secret) };
  }
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(origin + `${ADMIN_PATH}/login`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready);
    await t.test('first visit shows setup and requires server authorization and exact origin', async () => {
      assert.match(await (await fetch(origin + ADMIN_PATH)).text(), /bootstrapToken/);
      const denied = await post(`${ADMIN_PATH}/api/auth/setup`, { ...ownerInput, bootstrapToken: randomBytes(32).toString('hex') });
      assert.equal(denied.status, 403);
      const crossOrigin = await post(`${ADMIN_PATH}/api/auth/setup`, ownerInput, { origin: 'https://attacker.invalid' });
      assert.equal(crossOrigin.status, 403);
      assert.equal(await db.administrator.count(), 0);
    });
    await t.test('two concurrent browser setup requests create exactly one owner and seal setup', async () => {
      const results = await Promise.all([post(`${ADMIN_PATH}/api/auth/setup`, ownerInput), post(`${ADMIN_PATH}/api/auth/setup`, ownerInput)]);
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
      assert.equal(await db.administrator.count(), 1);
      const owner = await db.administrator.findUniqueOrThrow({ where: { email } }); ids.push(owner.id);
      assert.ok(await verifyPassword(password, owner.passwordHash));
      assert.equal(await db.administrationBootstrap.count(), 1);
      assert.equal((await post(`${ADMIN_PATH}/api/auth/setup`, ownerInput)).status, 409);
      await assert.rejects(createInitialOwner(db, { email: 'another@test.invalid', name: 'Another', password }));
      assert.doesNotMatch(await (await fetch(origin + `${ADMIN_PATH}/login`)).text(), /name="bootstrapToken"/);
    });
    const owner = await db.administrator.findUniqueOrThrow({ where: { email } });
    const auth = await login(email, password);
    let editorId = ''; let editorEmail = '';
    await t.test('unauthenticated and missing-CSRF account writes fail; owners create editors only', async () => {
      editorEmail = `editor-${randomBytes(6).toString('hex')}@test.invalid`;
      const input = { email: editorEmail, name: 'Editor', password, confirmation: password };
      assert.equal((await post(`${ADMIN_PATH}/api/administrators`, input)).status, 401);
      assert.equal((await post(`${ADMIN_PATH}/api/administrators`, input, { cookie: auth.cookie })).status, 403);
      assert.equal((await post(`${ADMIN_PATH}/api/administrators`, { ...input, role: 'owner' }, auth)).status, 422);
      const response = await post(`${ADMIN_PATH}/api/administrators`, input, auth);
      assert.equal(response.status, 201);
      const editor = await response.json(); editorId = editor.id; ids.push(editorId);
      assert.equal(editor.role, 'editor'); assert.equal(editor.passwordHash, undefined);
      const list = await fetch(origin + `${ADMIN_PATH}/api/administrators`, { headers: auth });
      assert.doesNotMatch(await list.text(), /passwordHash|tokenHash/);
    });
    await t.test('editor cannot manage administrators, settings, or owner privileges', async () => {
      const editorAuth = await login(editorEmail, password);
      assert.equal((await fetch(origin + `${ADMIN_PATH}/api/administrators`, { headers: editorAuth })).status, 403);
      assert.equal((await post(`${ADMIN_PATH}/api/administrators`, {}, editorAuth)).status, 403);
      assert.equal((await fetch(origin + `${ADMIN_PATH}/api/settings`, { headers: editorAuth })).status, 403);
      await assert.rejects(createEditor(db, editorId, { email: 'forbidden@test.invalid', name: 'Forbidden', password }));
      await assert.rejects(changeAdministrator(db, editorId, owner.id, null));
    });
    await t.test('disable revokes sessions; reset is single-use, expiring and preserves audit privacy', async () => {
      await changeAdministrator(db, owner.id, editorId, { email: editorEmail, name: 'Editor', active: false });
      assert.equal(await db.adminSession.count({ where: { administratorId: editorId } }), 0);
      await changeAdministrator(db, owner.id, editorId, { email: editorEmail, name: 'Editor', active: true });
      await login(editorEmail, password);
      const reset = await issuePasswordReset(db, owner.id, editorId, secret);
      assert.equal(await db.adminSession.count({ where: { administratorId: editorId } }), 0);
      const nextPassword = randomBytes(8).toString('hex').slice(0, 8);
      const body = { email: editorEmail, token: reset.token, password: nextPassword };
      const redeemed = await Promise.allSettled([redeemPasswordReset(db, body, secret), redeemPasswordReset(db, body, secret)]);
      assert.equal(redeemed.filter(r => r.status === 'fulfilled').length, 1);
      await login(editorEmail, nextPassword);
      const expired = await issuePasswordReset(db, owner.id, editorId, secret);
      await db.adminPasswordReset.updateMany({ where: { administratorId: editorId }, data: { expiresAt: new Date(0) } });
      await assert.rejects(redeemPasswordReset(db, { ...body, token: expired.token }, secret));
      const browserReset = await issuePasswordReset(db, owner.id, editorId, secret);
      const resetBody = { email: editorEmail, token: browserReset.token, password: nextPassword, confirmation: nextPassword };
      assert.equal((await post(`${ADMIN_PATH}/api/auth/reset`, resetBody, { origin: 'https://attacker.invalid' })).status, 403);
      assert.equal((await post(`${ADMIN_PATH}/api/auth/reset`, resetBody)).status, 200);
      assert.equal((await post(`${ADMIN_PATH}/api/auth/reset`, resetBody)).status, 400);
      const logs = JSON.stringify(await db.auditLog.findMany({ where: { entity: 'administrators' } }));
      assert.ok(!logs.includes(reset.token) && !logs.includes('passwordHash'));
    });
    await t.test('last owner and self-deletion are protected; removing editor retains audits', async () => {
      await assert.rejects(changeAdministrator(db, owner.id, owner.id, null));
      await assert.rejects(changeAdministrator(db, owner.id, owner.id, { email, name: 'Owner', active: false }));
      await changeAdministrator(db, owner.id, editorId, null);
      assert.equal(await db.administrator.count({ where: { id: editorId } }), 0);
      assert.ok(await db.auditLog.count({ where: { entityId: editorId } }));
    });
    await t.test('concurrent owner operations cannot disable the last owner', async () => {
      const other = await db.administrator.create({ data: { email: `second-${randomBytes(6).toString('hex')}@test.invalid`, name: 'Second fixture owner', passwordHash: owner.passwordHash, role: 'owner' } });
      ids.push(other.id);
      const results = await Promise.allSettled([
        changeAdministrator(db, owner.id, other.id, { email: other.email, name: other.name, active: false }),
        changeAdministrator(db, other.id, owner.id, { email: owner.email, name: owner.name, active: false }),
      ]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(await db.administrator.count({ where: { role: 'owner', active: true } }), 1);
    });
  } finally {
    server.kill('SIGTERM');
    if (server.exitCode === null) await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 10000))]);
    if (server.exitCode === null) server.kill('SIGKILL');
    await db.administrator.deleteMany({ where: { id: { in: ids } } });
    await db.auditLog.deleteMany({ where: { entity: 'administrators', entityId: { in: ids } } });
    if (ids.length) await db.administrationBootstrap.deleteMany({ where: { id: 'initial-owner' } });
    await db.$disconnect();
  }
});
