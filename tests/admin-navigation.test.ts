import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationForRole, activeNavigationKey } from '../src/lib/admin-navigation.ts';
test('compact navigation uses five groups and preserves role boundaries without duplicates', () => {
  const owner = navigationForRole('owner');
  assert.equal(owner.length, 5);
  const keys = owner.flatMap(g => g.items.map(i => i.key));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(!keys.includes('institution-reconciliation'));
  const editor = navigationForRole('editor').flatMap(g => g.items.map(i => i.key));
  for (const key of ['administrators', 'platform-settings', 'course-catalog']) assert.ok(!editor.includes(key));
  assert.deepEqual(navigationForRole('ambassador').flatMap(g => g.items.map(i => i.key)).sort(), ['academic-programs', 'articles', 'events', 'links', 'programs']);
  assert.deepEqual(navigationForRole('unknown'), []);
});
test('active sections distinguish the catalog and sync views and nested integrations', () => {
  assert.equal(activeNavigationKey('/portal-control-x7k92/course-catalog', true), 'course-catalog?view=catalog');
  assert.equal(activeNavigationKey('/portal-control-x7k92/universities/id/integration', false), 'universities');
  assert.equal(activeNavigationKey('/portal-control-x7k92', false), '');
  assert.equal(activeNavigationKey('/portal-control-x7k92/course-catalog', false, true), 'advanced');
  assert.equal(activeNavigationKey('/portal-control-x7k92/categories', false), 'advanced');
});
