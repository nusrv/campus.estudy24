import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { displayedVisits, formatVisits } from '../src/lib/visitor-counter.ts';
import { apiKeyHash, keyMatches, requireUniversityScope } from '../src/server/integration-policy.ts';
import { SAUDI_UNIVERSITIES, demoAdId } from '../prisma/campus-seed-data.ts';
test('counter starting value is additive and Western digits use separators', () => {
  assert.equal(displayedVisits(200000, 350), 200350);
  assert.equal(displayedVisits(0, 350), 350);
  assert.equal(displayedVisits(100, 350), 450);
  assert.equal(formatVisits(200350), '200,350');
});
test('university keys are one-way hashed and university scope cannot be forged', () => {
  const secret = randomBytes(32).toString('base64url');
  const digest = apiKeyHash(secret);
  assert.equal(digest.length, 64); assert.notEqual(digest, secret);
  assert.ok(keyMatches(secret, digest)); assert.equal(keyMatches('wrong', digest), false);
  assert.doesNotThrow(() => requireUniversityScope('uqu', 'uqu'));
  for (const slug of ['ksu', undefined, null, { university_slug: 'uqu' }]) assert.throws(() => requireUniversityScope(slug, 'uqu'));
});
test('ten stable university seed identities and advertisement identities are unique', () => {
  assert.deepEqual(SAUDI_UNIVERSITIES.map(u => u.slug), ['uqu', 'ksu', 'kau', 'imamu', 'pnu', 'kku', 'taibah', 'qu', 'iau', 'jazanu']);
  assert.equal(new Set(SAUDI_UNIVERSITIES.map(u => demoAdId(u.slug))).size, 10);
  for (const university of SAUDI_UNIVERSITIES) assert.match(new URL(university.websiteUrl).hostname, /\.edu\.sa$/);
});
test('OpenAPI references resolve and exported n8n workflow normalizes original RSS IDs without secrets', () => {
  const spec = JSON.parse(readFileSync(new URL('../docs/api/ingestion.openapi.json', import.meta.url), 'utf8'));
  function walk(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if ('$ref' in value) { const ref = String(value.$ref); assert.ok(ref.startsWith('#/')); let found = spec; for (const part of ref.slice(2).split('/')) found = found?.[part]; assert.ok(found, ref); }
    for (const nested of Object.values(value)) walk(nested);
  }
  walk(spec);
  assert.ok(spec.paths['/api/ingest/batch'].post.responses['207']);
  const workflow = JSON.parse(readFileSync(new URL('../docs/examples/n8n-uqu-workflow.json', import.meta.url), 'utf8'));
  assert.equal(workflow.active, false);
  const code = workflow.nodes.find((node: { type: string }) => node.type === 'n8n-nodes-base.code').parameters.jsCode;
  const normalize = new Function('$input', code);
  const input = { all: () => [{ json: { link: 'https://uqu.edu.sa/App/News/179777', title: 'اختبار', contentSnippet: 'نص الاختبار', isoDate: '2026-10-18T14:06:32Z' } }] };
  const result = normalize(input)[0].json;
  assert.equal(result.source_id, '179777'); assert.equal(result.university_slug, 'uqu'); assert.equal(result.status, undefined);
  assert.equal(workflow.nodes.find((node: { type: string }) => node.type === 'n8n-nodes-base.httpRequest').parameters.authentication, 'genericCredentialType');
});
