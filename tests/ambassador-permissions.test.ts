import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { bindUniversity, contentPermission, universityScope, type AdministratorAccess } from '../src/server/administrator-access.ts';
import { administratorCreateSchema } from '../src/server/administrator-validation.ts';
import { scopedMedia, validateScopedMedia } from '../src/server/administrator-media.ts';
import type { Prisma } from '@prisma/client';

const ambassador: AdministratorAccess = { id: 'a', role: 'ambassador', universityId: 'u1', university: { id: 'u1', name: 'جامعة', slug: 'u1', enabled: true } };
test('ambassador permissions deny every unscopable resource by default', () => {
  for (const resource of ['articles', 'events', 'programs', 'links']) for (const operation of ['read', 'write', 'delete'] as const) assert.doesNotThrow(() => contentPermission(ambassador, resource, operation));
  for (const resource of ['universities', 'ads', 'platform_posts', 'administrators', 'sources', 'categories', 'logs', 'audit', 'settings', 'integrations', 'unknown']) for (const operation of ['read', 'write', 'delete'] as const) assert.throws(() => contentPermission(ambassador, resource, operation));
  assert.deepEqual(universityScope(ambassador), { universityId: 'u1' });
});
test('scope is assigned from the account and forged/global associations are rejected', () => {
  assert.deepEqual(bindUniversity(ambassador, { title: 'خبر' }), { title: 'خبر', universityId: 'u1' });
  for (const input of [{ universityId: 'u2' }, { universityId: null }, { university_slug: 'u2' }, { university: { connect: { id: 'u2' } } }, { universityIds: ['u2'] }, { global: true }, { universitySlug: 'u2' }]) assert.throws(() => bindUniversity(ambassador, input));
});
test('existing editor content access and owner-only deletion/university edits remain unchanged', () => {
  const editor = { ...ambassador, role: 'editor', universityId: null, university: null };
  for (const resource of ['articles', 'events', 'programs', 'links', 'ads', 'platform_posts', 'categories']) assert.doesNotThrow(() => contentPermission(editor, resource, 'write'));
  assert.throws(() => contentPermission(editor, 'articles', 'delete'));
  assert.throws(() => contentPermission(editor, 'universities', 'write'));
  assert.deepEqual(universityScope(editor), {});
});
test('account creation requires exactly one university only for ambassadors', () => {
  const password = randomBytes(6).toString('base64url');
  const base = { email: 'a@test.invalid', name: 'سفير', password, confirmation: password };
  assert.ok(administratorCreateSchema.safeParse({ ...base, role: 'ambassador', universityId: 'u1' }).success);
  for (const input of [{ role: 'ambassador' }, { role: 'ambassador', universityId: null }, { role: 'editor', universityId: 'u1' }, { role: 'owner', universityId: 'u1' }, { role: 'ambassador', universityId: ['u1', 'u2'] }]) assert.equal(administratorCreateSchema.safeParse({ ...base, ...input }).success, false);
});
test('media scoping preserves external references and rejects foreign private upload references', async () => {
  const db = { uploadedMedia: { findUnique: async () => ({ id: 'private', universityId: 'u2' }) } } as unknown as Prisma.TransactionClient;
  await assert.rejects(validateScopedMedia(db, ambassador, { imageUrls: ['/media/private'] }));
  await assert.rejects(validateScopedMedia(db, ambassador, { imageUrls: [`${process.env.APP_URL || 'http://localhost:3000'}/media/private`] }));
  await assert.doesNotReject(validateScopedMedia(db, ambassador, { imageUrls: ['https://official.example.edu/media/logo.png'] }));
  await assert.doesNotReject(validateScopedMedia(db, ambassador, { imageUrls: ['http://'] }));
});
test('legacy private media require an existing article or service reference in the assigned university', async () => {
  let linked = 0;
  const db = { uploadedMedia: { findUnique: async () => ({ id: 'legacy', universityId: null }) }, articleMedia: { count: async () => 0 }, managedLink: { count: async () => linked } } as unknown as Prisma.TransactionClient;
  await assert.rejects(scopedMedia(db, ambassador, 'legacy'));
  linked = 1; assert.equal((await scopedMedia(db, ambassador, 'legacy')).id, 'legacy');
});
