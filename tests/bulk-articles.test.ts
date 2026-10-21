import test from 'node:test';
import assert from 'node:assert/strict';
import { bulkArticleDeleteSchema, MAX_BULK_ARTICLES } from '../src/server/bulk-article-validation.ts';
test('bulk article deletion accepts only an explicit bounded unique selection of valid article IDs', () => {
  assert.deepEqual(bulkArticleDeleteSchema.parse({ ids: ['article-1', 'article_2'] }), { ids: ['article-1', 'article_2'] });
  assert.equal(bulkArticleDeleteSchema.parse({ ids: Array.from({ length: MAX_BULK_ARTICLES }, (_, i) => `article-${i}`) }).ids.length, 100);
  for (const invalid of [{}, { ids: [] }, { ids: ['same', 'same'] }, { ids: ['../all'] }, { ids: ['*'] }, { ids: [''] }, { ids: [1] }, { ids: ['valid'], all: true }, { ids: ['valid'], universityId: 'university' }, { ids: Array.from({ length: 101 }, (_, i) => `id-${i}`) }]) assert.equal(bulkArticleDeleteSchema.safeParse(invalid).success, false);
});
