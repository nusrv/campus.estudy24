import test from 'node:test';
import assert from 'node:assert/strict';
import { NEWS_CATEGORIES, approvedNewsCategory, orderNewsCategories, newsCategoryHref } from '../src/lib/news-categories.ts';
import { ingestArticleSchema } from '../src/server/validation.ts';
test('nine approved shared categories have stable unique slugs and Arabic names', () => {
  assert.deepEqual(NEWS_CATEGORIES.map(category => category.slug), ['general', 'admissions', 'academic', 'training', 'opportunities', 'activities', 'research', 'student-services', 'announcements']);
  assert.equal(new Set(NEWS_CATEGORIES.map(category => category.slug)).size, 9);
  for (const category of NEWS_CATEGORIES) { assert.match(category.name, /[\u0600-\u06ff]/); assert.equal(approvedNewsCategory(category.slug), category); }
  assert.equal(approvedNewsCategory('typo'), undefined);
  const custom = { name: 'اسم مخصص', slug: 'custom' };
  assert.deepEqual(orderNewsCategories([custom, ...NEWS_CATEGORIES].reverse()), [...NEWS_CATEGORIES, custom]);
});
test('all approved slugs are accepted by news normalization and general remains the default', () => {
  const record = { university_slug: 'uqu', source_id: '1', source_url: 'https://uqu.edu.sa/1', title: 'خبر اختباري' };
  assert.equal(ingestArticleSchema.parse(record).category, 'general');
  for (const category of NEWS_CATEGORIES) assert.equal(ingestArticleSchema.parse({ ...record, category: category.slug }).category, category.slug);
  for (const category of ['', '../admin', 'student services', '<script>']) assert.equal(ingestArticleSchema.safeParse({ ...record, category }).success, false);
});
test('horizontal category navigation keeps university, search and dates, resets pagination and uses all by default', () => {
  const query = { search: 'طلبة الجامعة', from: '2026-10-01', to: '2026-10-21', page: '8', section: 'programs', university: 'other', category: 'training' };
  const filtered = new URL(newsCategoryHref('uqu', 'admissions', query), 'https://example.org');
  assert.equal(filtered.pathname, '/universities/uqu'); assert.equal(filtered.searchParams.get('section'), 'news'); assert.equal(filtered.searchParams.get('category'), 'admissions');
  assert.equal(filtered.searchParams.get('search'), query.search); assert.equal(filtered.searchParams.get('from'), query.from); assert.equal(filtered.searchParams.has('page'), false); assert.equal(filtered.searchParams.has('university'), false);
  assert.equal(new URL(newsCategoryHref('uqu', null, query), 'https://example.org').searchParams.has('category'), false);
});
