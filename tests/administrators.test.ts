import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from '../src/server/security.ts';
import { authorizeBootstrap } from '../src/server/administrator-service.ts';
import { editorSchema, setupSchema, resetSchema, administratorUpdateSchema } from '../src/server/administrator-validation.ts';
test('8-character password policy is shared by hashing, setup, editor creation, and resets', async () => {
  const password = randomBytes(8).toString('hex').slice(0, 8);
  const base = { email: 'owner@example.test', name: 'Owner', password, confirmation: password };
  assert.ok(editorSchema.safeParse(base).success);
  assert.ok(setupSchema.safeParse({ ...base, bootstrapToken: randomBytes(32).toString('hex') }).success);
  assert.ok(resetSchema.safeParse({ email: base.email, password, confirmation: password, token: randomBytes(32).toString('base64url') }).success);
  assert.ok(await verifyPassword(password, await hashPassword(password)));
  await assert.rejects(hashPassword(password.slice(1)));
  assert.equal(editorSchema.safeParse({ ...base, password: password.slice(1) }).success, false);
  assert.equal(editorSchema.safeParse({ ...base, confirmation: password + 'x' }).success, false);
  assert.equal(editorSchema.safeParse({ ...base, role: 'owner' }).success, false);
  assert.equal(administratorUpdateSchema.safeParse({ email: base.email, name: base.name, active: true, role: 'owner' }).success, true);
  assert.equal(administratorUpdateSchema.safeParse({ email: base.email, name: base.name, active: true, role: 'ambassador' }).success, false);
});
test('browser bootstrap is closed without a strong matching server-side authorization', () => {
  const token = randomBytes(32).toString('base64url');
  assert.throws(() => authorizeBootstrap(token, ''));
  assert.throws(() => authorizeBootstrap(token, 'short'));
  assert.throws(() => authorizeBootstrap('wrong', token));
  assert.doesNotThrow(() => authorizeBootstrap(token, token));
});
