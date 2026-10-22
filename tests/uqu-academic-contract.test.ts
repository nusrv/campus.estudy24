import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { academicIngestSchema } from '../src/server/academic-validation.ts';

const collector = createRequire(import.meta.url)('../integrations/n8n/uqu-academic/collector.cjs');
test('all verified UQU directory fixtures normalize to the actual Campus ingestion schema', () => {
  let state = collector.initial();
  for (let page = 1; page <= 4; page++) {
    const html = readFileSync(new URL(`../integrations/n8n/uqu-academic/fixtures/page-${page}.html`, import.meta.url), 'utf8');
    state = collector.sourceResponse(state, { statusCode: 200, headers: { 'content-type': 'text/html' }, body: html });
  }
  state = collector.finalizeCollection(state);
  assert.equal(state.phase, 'dry_run');
  assert.equal(state.records.length, 333);
  for (const record of state.records) assert.equal(academicIngestSchema.safeParse(record).success, true, `Contract mismatch for official ID ${record.source_id}`);
});
