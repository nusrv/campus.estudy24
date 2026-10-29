import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryVisibility, possibleInstitution, reconciliationInstitutions, institutionLabel } from '../src/lib/institutions.ts';
import { universitySchema } from '../src/server/validation.ts';
import { bulkActions } from '../src/lib/bulk.ts';
import { reconciliationRequest } from '../src/server/institution-reconciliation.ts';
test('discovery policy and college vocabulary never imply operational disable', () => {
  assert.deepEqual(directoryVisibility, { enabled: true, showInDirectory: true });
  assert.equal(institutionLabel('COLLEGE'), 'كلية'); assert.equal(institutionLabel('UNIVERSITY'), 'جامعة');
  assert.equal(reconciliationInstitutions.find(i => i.categoryId === 310)?.institutionType, 'COLLEGE');
});
test('legacy edits do not silently reset new visibility/type fields', () => {
  const value = universitySchema.parse({ name: 'مؤسسة اختبار', slug: 'institution-test' });
  assert.equal(value.showInDirectory, undefined); assert.equal(value.institutionType, undefined);
  assert.equal(universitySchema.parse({ name: 'كلية اختبار', slug: 'college-test', institutionType: 'COLLEGE', showInDirectory: false, enabled: true }).enabled, true);
  assert.equal(universitySchema.safeParse({ name: 'x', slug: 'x', institutionType: 'unknown' }).success, false);
});
test('identity candidates include inactive aliases without inferring an automatic mapping', () => {
  const baha = reconciliationInstitutions[0];
  assert.ok(possibleInstitution({ name: 'جامعة الباحة', slug: 'custom' }, baha));
  assert.ok(possibleInstitution({ name: 'اسم محرر', slug: 'bu' }, baha));
  assert.equal(possibleInstitution({ name: 'Tabuk University', slug: 'tabuk' }, baha), false);
});
test('directory bulk actions are distinct Owner-only actions; approvals reject tampered shapes', () => {
  assert.ok(bulkActions('universities', 'owner').includes('directory_hide'));
  assert.deepEqual(bulkActions('universities', 'editor'), []); assert.deepEqual(bulkActions('universities', 'ambassador'), []);
  assert.equal(bulkActions('articles', 'owner').includes('directory_hide'), false);
  const payload = { action: 'reconcile', snapshot: 'a'.repeat(64), confirmation: 'تأكيد تسوية دليل المؤسسات', choices: reconciliationInstitutions.map(i => ({ action: 'create', categoryId: i.categoryId, slug: `institution-${i.categoryId}`, verifiedIdentity: true, approveMapping: true })) };
  assert.ok(reconciliationRequest.safeParse(payload).success);
  assert.equal(reconciliationRequest.safeParse({ ...payload, enabled: false }).success, false);
  assert.equal(reconciliationRequest.safeParse({ ...payload, choices: payload.choices.map(c => ({ ...c, verifiedIdentity: false })) }).success, false);
});
