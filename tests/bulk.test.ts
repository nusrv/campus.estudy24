import test from 'node:test';
import assert from 'node:assert/strict';
import { bulkActions, bulkResources, emptySelection, selectedCount, selectionCriteria, toggleSelection, isSelected } from '../src/lib/bulk.ts';
import { managementQuery } from '../src/server/management-query.ts';
import { bulkRequestSchema } from '../src/server/bulk-validation.ts';
import { academicPublicationDecision } from '../src/server/academic-publication-policy.ts';
const owner = { id: 'owner', role: 'owner', universityId: null, university: null };
const amb = { id: 'amb', role: 'ambassador', universityId: 'u1', university: { id: 'u1', slug: 'uqu', name: 'جامعة أم القرى', enabled: true } };
test('every manageable collection has Owner bulk actions; read-only reports and settings do not', () => {
  for (const resource of bulkResources) assert.ok(bulkActions(resource, 'owner').length, resource);
  for (const resource of ['logs', 'audit', 'settings', 'platform-settings']) assert.deepEqual(bulkActions(resource, 'owner'), []);
});
test('role matrix preserves Editor deletion/security restrictions and Ambassador content-only actions', () => {
  for (const resource of bulkResources) assert.ok(!bulkActions(resource, 'editor').includes('delete'));
  for (const resource of ['universities', 'sources', 'administrators', 'api-keys']) assert.deepEqual(bulkActions(resource, 'editor'), []);
  for (const resource of bulkResources) assert.equal(bulkActions(resource, 'ambassador').length > 0, ['articles', 'academic-programs', 'events', 'programs', 'links'].includes(resource));
  assert.ok(!bulkActions('administrators', 'owner').includes('delete'));
});
test('individual and current-page selection retains other pages and supports deselection', () => {
  let s = toggleSelection(emptySelection, ['a'], true); s = toggleSelection(s, ['b', 'c'], true);
  assert.equal(selectedCount(s), 3); s = toggleSelection(s, ['b', 'c'], false);
  assert.equal(isSelected(s, 'a'), true); assert.equal(selectedCount(s), 1);
});
test('all-results exclusions are explicit, unique and reversible without changing snapshot count', () => {
  let s = toggleSelection({ mode: 'all', token: 'snapshot', count: 333, excluded: [] }, ['a', 'b'], false);
  s = toggleSelection(s, ['a'], false); assert.equal(selectedCount(s), 331); assert.equal(isSelected(s, 'a'), false);
  s = toggleSelection(s, ['a'], true); assert.equal(selectedCount(s), 332);
});
test('page navigation keeps selection criteria; changed search/university/status creates a new scope', () => {
  assert.equal(selectionCriteria({ search: 'بحث', page: '1' }), selectionCriteria({ page: '8', page_size: '50', search: 'بحث' }));
  assert.notEqual(selectionCriteria({ university: 'uqu' }), selectionCriteria({ university: 'ksu' }));
  assert.notEqual(selectionCriteria({ status: 'published' }), selectionCriteria({ status: 'pending_review' }));
});
test('shared management filters are strict and scope is always enforced server-side', () => {
  assert.deepEqual(managementQuery('articles', new URLSearchParams({ university: 'uqu', status: 'published' }), amb).where, { universityId: 'u1', university: { slug: 'uqu' }, status: 'published', deletedAt: null });
  for (const filters of [{ university: 'ksu' }, { universityId: 'foreign' }, { OR: 'forged' }, { source_key: 'forged' }] as Record<string, string>[]) assert.throws(() => managementQuery('articles', new URLSearchParams(filters), amb));
  assert.throws(() => managementQuery('ads', new URLSearchParams({ status: 'published' }), owner));
  assert.throws(() => managementQuery('api-keys', new URLSearchParams(), owner));
});
test('bounded request schemas reject duplicates, forged commands, excessive IDs and nested filter injection', () => {
  for (const value of [{ op: 'preview', action: 'delete', selection: { mode: 'ids', ids: ['a', 'a'], filters: {} } }, { op: 'execute', token: 'id', confirmation: 'ok', ids: ['foreign'] }, { op: 'snapshot', filters: { university: { id: 'foreign' } } }, { op: 'preview', action: 'publish', selection: { mode: 'ids', ids: Array.from({ length: 5001 }, (_, i) => String(i)), filters: {} } }]) assert.equal(bulkRequestSchema.safeParse(value).success, false);
});
const program = { source_key: 'uqu-degrees', source_id: '1894', name: 'برنامج أكاديمي رسمي', degree_name: 'دبلوم عالٍ', college: 'كلية التربية', source_url: 'https://uqu.edu.sa/App/Degrees/1894', official_program_url: 'https://uqu.edu.sa/App/Degrees/1894' };
test('academic auto-publication is source opt-in, new-only, and retains review for incomplete/suspicious data', () => {
  assert.equal(academicPublicationDecision(false, program).publish, false);
  assert.equal(academicPublicationDecision(true, program).publish, true);
  assert.equal(academicPublicationDecision(true, program, true).publish, false);
  for (const value of [{ ...program, college: null }, { ...program, official_program_url: null }, { ...program, name: '<script>bad</script>' }, { ...program, official_program_url: 'https://foreign.example/1894' }]) assert.equal(academicPublicationDecision(true, value).publish, false);
});
