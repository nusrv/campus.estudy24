/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const c = require('./collector.cjs');
const fixture = n => fs.readFileSync(path.join(__dirname, 'fixtures', 'page-' + n + '.html'), 'utf8');
const okSource = body => ({ statusCode: 200, body, headers: { 'content-type': 'text/html; charset=UTF-8' } });
function collected(config = {}) { let s = c.initial(config); for (let i = 1; i <= 4; i++) s = c.sourceResponse(c.sourceRequest(s), okSource(fixture(i))); return s; }
function live() { const dry = c.finalizeCollection(collected()); return c.finalizeCollection(collected({ mode: 'live', liveConfirmation: c.LIVE_CONFIRMATION, approvedDatasetFingerprint: dry.datasetFingerprint })); }
function api(records, outcomes = records.map(() => 'created'), overrides = {}) {
  const results = records.map((r, index) => ({ index, outcome: outcomes[index], resource_id: 'test-resource-' + r.source_id, error: outcomes[index] === 'failed' ? { code: 'INGESTION_FAILED' } : outcomes[index] === 'rejected' ? { code: 'VALIDATION_ERROR' } : undefined }));
  const counts = { created: 0, updated: 0, unchanged: 0, rejected: 0, failed: 0 }; for (const r of results) counts[r.outcome]++;
  return { statusCode: outcomes.some(o => ['failed', 'rejected'].includes(o)) ? 207 : 200, body: { resource_type: 'academic-programs', request_id: 'test-request', results, counts, ...overrides } };
}
test('verified official fixtures: four pages, 337 rows, 333 unique upstream IDs and no invented optional facts', () => {
  const s = c.finalizeCollection(collected());
  assert.equal(s.phase, 'dry_run'); assert.equal(s.fetchedRows, 337); assert.equal(s.records.length, 333); assert.equal(s.duplicateRows, 4); assert.deepEqual(s.errors, []);
  assert.deepEqual(s.batches.map(b => b.length), [50, 50, 50, 50, 50, 50, 33]);
  for (const r of s.records) { c.validateRecord(r); assert.equal(r.study_plan_url, null); assert.equal(r.tuition_verified, false); assert.equal(r.campus, null); assert.equal(r.study_mode, null); }
  const degrees = new Set(s.records.map(r => r.degree_name)); assert.ok(degrees.has('الزمالة الطبية')); assert.ok(degrees.has('دبلوم متوسط'));
});
test('fixtures are attributed, reproducible excerpts with verified hashes and no login/session artifacts', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/manifest.json'), 'utf8'));
  assert.equal(manifest.unique_programs, 333); assert.equal(manifest.campus_requests, 0);
  assert.equal(c.finalizeCollection(collected()).datasetFingerprint, manifest.dataset_sha256);
  for (const f of manifest.files) {
    const body = fs.readFileSync(path.join(__dirname, 'fixtures', f.file));
    assert.equal(createHash('sha256').update(body).digest('hex'), f.sha256);
    assert.equal(/wire:snapshot|csrf|set-cookie|Bearer|<form\b/i.test(body.toString()), false);
    assert.equal(new URL(f.source_url).hostname, 'uqu.edu.sa');
  }
});
test('unaltered source row with SVGs, comments and responsive duplicate labels parses identically to reduced fixture', () => {
  const html = fixture(1), row = fs.readFileSync(path.join(__dirname, 'fixtures/original-row-2285.html'), 'utf8');
  const match = [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].find(m => m[0].includes('/2285'));
  assert.ok(match); assert.deepEqual(c.parsePage(html.replace(match[0], row), 1).records, c.parsePage(html, 1).records);
});
test('official canonical numeric IDs preserve same names with different degrees and other variants', () => {
  const r = c.finalizeCollection(collected()).records;
  const pair = r.filter(r => r.name === 'أصول التربية (الأصول الإسلامية للتربية)');
  assert.ok(pair.length >= 2); assert.ok(new Set(pair.map(r => r.degree_name)).size >= 2); assert.equal(new Set(pair.map(r => r.source_id)).size, pair.length);
  assert.deepEqual(c.finalizeCollection(collected()).records.map(r => r.source_id), r.map(r => r.source_id));
});
test('Arabic NFC and whitespace are normalized without collapsing distinct Arabic letters', () => {
  assert.equal(c.text('ا\u0654صول&nbsp;  التربية'), 'أصول التربية');
  assert.equal(c.text('<span>على</span>'), 'على'); assert.notEqual(c.text('على'), c.text('علي'));
  assert.equal(c.decode('&#x623;&#1589;&#1608;&#1604;'), 'أصول');
});
test('credit hours handle Western and Arabic digits, nullable missing values and reject ambiguous/invalid hours', () => {
  for (const value of ['42', '٤٢', '۴۲']) assert.equal(c.hours(value), 42);
  assert.equal(c.hours('٣٫٥'), 3.5); assert.equal(c.hours('—'), null); assert.equal(c.hours(''), null);
  for (const v of ['-1', '5001', 'Infinity', 'NaN', '12 ساعة', '1,000', '4/2']) assert.throws(() => c.hours(v), /INVALID_CREDIT_HOURS/);
});
test('missing optional fields stay null, malformed required data blocks the entire live submission', () => {
  const html = fixture(1).replace(/<span>الدبلومات<\/span>/g, '<span></span>');
  const parsed = c.parsePage(html, 1); assert.equal(parsed.records[0].college, null);
  const bad = fixture(1).replace(/>\s*60\s*<\/div>/, '>unknown</div>');
  assert.ok(c.parsePage(bad, 1).errors.length > 0);
  const s = collected(); s.errors.push({ code: 'TEST_INVALID_RECORD' }); assert.equal(c.finalizeCollection(s).phase, 'blocked');
});
test('strict pagination rejects empty HTML, incorrect pages, missing rows, changed totals and page caps', () => {
  assert.throws(() => c.parsePage('', 1), /SOURCE_LAYOUT_CHANGED/);
  assert.throws(() => c.parsePage(fixture(1).replace(/<tbody\b[\s\S]*?<\/tbody>/, '<tbody></tbody>'), 1), /INCOMPLETE_SOURCE_PAGE/);
  assert.throws(() => c.parsePage(fixture(2), 1), /UNEXPECTED_PAGINATION/);
  assert.throws(() => c.parsePage(fixture(4).replace('من أصل 337', 'من أصل 338'), 4), /INCOMPLETE_SOURCE_PAGE/);
  assert.equal(c.sourceResponse(c.initial({ maxPages: 1 }), okSource(fixture(1))).phase, 'blocked');
  let s = c.sourceResponse(c.initial(), okSource(fixture(1)));
  s = c.sourceResponse(s, okSource(fixture(2).replace('من أصل 337', 'من أصل 338'))); assert.equal(s.phase, 'blocked');
});
test('source timeouts, 429 and transient failures retry with bounded exponential delays and Retry-After', () => {
  let s = c.initial(); s = c.sourceResponse(s, { error: { message: 'timeout' } }); assert.equal(s.phase, 'collect'); assert.equal(s.attempt, 2); assert.equal(s.delaySeconds, 2);
  s = c.sourceResponse(s, { statusCode: 503 }); assert.equal(s.delaySeconds, 4);
  s = c.sourceResponse(s, { statusCode: 429, headers: { 'retry-after': '20' } }); assert.equal(s.delaySeconds, 20);
  s = c.sourceResponse(s, { statusCode: 503 }); assert.equal(s.phase, 'blocked'); assert.equal(s.errors[0].code, 'SOURCE_HTTP_503');
  assert.equal(c.sourceResponse(c.initial(), { statusCode: 403 }).phase, 'blocked');
  assert.equal(c.sourceResponse(c.initial(), { statusCode: 429, headers: { 'retry-after': '9999' } }).phase, 'blocked');
});
test('HTML response/redirect/challenge failures never produce a submission-ready state', () => {
  assert.equal(c.sourceResponse(c.initial(), { statusCode: 302 }).phase, 'blocked');
  assert.equal(c.sourceResponse(c.initial(), { statusCode: 200, headers: { 'content-type': 'application/json' }, body: '{}' }).phase, 'blocked');
  assert.equal(c.sourceResponse(c.initial(), okSource('<html>CAPTCHA</html>')).phase, 'blocked');
});
test('source host, protocol, canonical path and numeric ID must match; no invented or foreign source links', () => {
  for (const value of ['https://evil.example/App/Degrees/1', 'https://uqu.edu.sa.evil.example/App/Degrees/1', 'http://uqu.edu.sa/App/Degrees/1', 'https://user:password@uqu.edu.sa/App/Degrees/1', 'https://uqu.edu.sa/App/Degrees/1?x=2', 'https://uqu.edu.sa/App/Degrees/1#plan', 'https://uqu.edu.sa/App/News/1']) assert.throws(() => c.officialUrl(value));
  const r = c.parsePage(fixture(1), 1).records[0]; assert.throws(() => c.validateRecord({ ...r, source_id: '9999' }), /SOURCE_ID_URL_MISMATCH/);
});
test('in-dataset conflicting upstream IDs block synchronization rather than silently overwriting variants', () => {
  const s = collected(); s.records.push({ ...s.records[0], degree_name: 'TEST DIFFERENT DEGREE' });
  assert.equal(c.finalizeCollection(s).phase, 'blocked'); assert.ok(s.errors.some(e => e.code === 'CONFLICTING_OFFICIAL_ID'));
});
test('all batches contain at most 50 records and stay below the actual UTF-8 byte limit', () => {
  const s = c.finalizeCollection(collected());
  for (const b of s.batches) { assert.ok(b.length <= 50); assert.ok(Buffer.byteLength(JSON.stringify({ items: b }), 'utf8') < 1024 * 1024); }
  const r = s.records[0]; assert.equal(c.batches(Array.from({ length: 101 }, () => r)).length, 3); assert.deepEqual(c.batches([]), []);
});
test('manual/default dry run cannot submit; live requires both deliberate phrase and exact reviewed fingerprint', () => {
  const dry = c.finalizeCollection(collected()); assert.equal(dry.phase, 'dry_run'); assert.throws(() => c.campusRequest(dry), /LIVE_APPROVAL_REQUIRED/);
  for (const config of [{ mode: 'live' }, { mode: 'live', liveConfirmation: c.LIVE_CONFIRMATION, approvedDatasetFingerprint: 'wrong' }, { mode: 'live', approvedDatasetFingerprint: dry.datasetFingerprint }]) assert.equal(c.finalizeCollection(collected(config)).phase, 'blocked');
  const s = live(); assert.equal(s.phase, 'submit'); assert.equal(c.campusRequest(s).requestUrl, c.CAMPUS);
  s.config.mode = 'dry_run'; assert.throws(() => c.campusRequest(s), /LIVE_APPROVAL_REQUIRED/);
});
test('200/201 and 207 preserve per-record reports and retry only transient failed records', () => {
  let s = live(); const batch = s.pending;
  const kinds = batch.map((_, i) => i === 0 ? 'failed' : i === 1 ? 'rejected' : 'created');
  s = c.campusResponse(s, api(batch, kinds)); assert.equal(s.pending.length, 1); assert.equal(s.pending[0].source_id, batch[0].source_id); assert.equal(s.attempt, 2);
  s = c.campusResponse(s, { ...api(s.pending, ['updated']), statusCode: 201 }); assert.equal(s.batchIndex, 1);
  while (s.phase === 'submit') s = c.campusResponse(s, api(s.pending));
  const report = c.summary(s); assert.equal(report.status, 'completed_with_errors'); assert.equal(report.outcomes.length, 333); assert.equal(report.counts.rejected, 1); assert.equal(report.counts.updated, 1); assert.equal(report.counts.unconfirmed, 0); assert.equal(report.attempts.length, 8);
});
test('401/403/413/422 fail once with no permanent-error retry; later batches stay unconfirmed', () => {
  for (const statusCode of [401, 403, 413, 415, 422]) { const s = c.campusResponse(live(), { statusCode, body: {} }); assert.equal(s.phase, 'blocked'); assert.equal(s.campusAttempts.length, 1); assert.equal(c.summary(s).counts.unconfirmed, 333); }
});
test('429/503/network failures use exponential retry and stop after the configured attempt limit', () => {
  let s = live(); s = c.campusResponse(s, { statusCode: 429, headers: { 'retry-after': '12' } }); assert.equal(s.delaySeconds, 12);
  s = c.campusResponse(s, { statusCode: 503 }); assert.equal(s.delaySeconds, 4);
  s = c.campusResponse(s, { statusCode: 0 }); assert.equal(s.delaySeconds, 8);
  s = c.campusResponse(s, { statusCode: 503 }); assert.equal(s.phase, 'blocked'); assert.equal(c.summary(s).counts.unconfirmed, 333);
});
test('malformed API success, duplicate/missing indices, unknown outcomes and misleading counts fail closed', () => {
  for (const mutate of [r => { r.body.results.pop(); }, r => { r.body.results[0].index = 1; }, r => { r.body.results[0].outcome = 'invented'; }, r => { r.body.counts.created = 999; }, r => { r.body.resource_type = 'articles'; }]) {
    const s = live(), response = api(s.pending); mutate(response); assert.equal(c.campusResponse(s, response).phase, 'blocked'); assert.equal(Object.keys(s.outcomes).length, 0);
  }
});
test('export is reproducible, inactive, credential-free, manual-only and uses fixed non-redirecting endpoints', () => {
  execFileSync(process.execPath, [path.join(__dirname, 'build-workflow.cjs'), '--check']);
  const w = JSON.parse(fs.readFileSync(path.join(__dirname, 'uqu-academic-programs.workflow.json'), 'utf8'));
  assert.match(w.versionId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); assert.equal(w.active, false); assert.deepEqual(w.pinData, {}); assert.equal(w.nodes.filter(n => n.type.includes('Trigger')).length, 1);
  for (const n of w.nodes) { assert.equal(n.credentials, undefined); if (n.type.endsWith('.httpRequest')) { assert.equal(n.parameters.options.redirect.redirect.followRedirects, false); assert.equal(n.parameters.options.response.response.outputPropertyName, 'body'); assert.equal(n.retryOnFail, undefined); } }
  const campus = w.nodes.find(n => n.name === 'Campus Scoped Ingestion'); assert.equal(campus.disabled, true); assert.equal(campus.parameters.url, c.CAMPUS); assert.equal(campus.parameters.genericAuthType, 'httpHeaderAuth');
  assert.ok(w.nodes.find(n => n.name === 'Operator Configuration').parameters.jsCode.includes("mode: 'dry_run'"));
});
test('execute the actual exported Code nodes through complete dry and mocked-live graph paths', async () => {
  const w = JSON.parse(fs.readFileSync(path.join(__dirname, 'uqu-academic-programs.workflow.json'), 'utf8'));
  const byName = Object.fromEntries(w.nodes.map(n => [n.name, n])); const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  async function run(liveMode) {
    let name = 'Operator Configuration', input = {}, sourceRequests = 0, campusRequests = 0; const history = {};
    for (let step = 0; step < 200; step++) {
      const n = byName[name]; let branch = 0;
      if (n.type.endsWith('.code')) {
        const output = await new AsyncFunction('$input', '$', 'require', n.parameters.jsCode)({ first: () => ({ json: input }) }, key => ({ item: { json: history[key] } }), require);
        input = output[0].json;
        if (name === 'Operator Configuration' && liveMode) { input.config.mode = 'live'; input.config.liveConfirmation = c.LIVE_CONFIRMATION; input.config.approvedDatasetFingerprint = c.finalizeCollection(collected()).datasetFingerprint; }
      } else if (n.type.endsWith('.httpRequest')) {
        if (name === 'Official UQU HTML Request') { sourceRequests++; input = okSource(fixture(input.page)); }
        // Mocked live path models the documented, deliberate operator enabling of this disabled node.
        else { assert.ok(liveMode); assert.equal(n.disabled, true); campusRequests++; input = api(input.pending); }
      } else if (n.type.endsWith('.if')) branch = input.phase === n.parameters.conditions.conditions[0].rightValue ? 0 : 1;
      else assert.ok(n.type.endsWith('.wait'));
      history[name] = structuredClone(input);
      if (name === 'Final Report') return { report: input, sourceRequests, campusRequests };
      name = w.connections[name].main[branch][0].node;
    }
    throw new Error('Unbounded workflow loop');
  }
  const dry = await run(false); assert.equal(dry.sourceRequests, 4); assert.equal(dry.campusRequests, 0); assert.equal(dry.report.status, 'dry_run');
  const mocked = await run(true); assert.equal(mocked.campusRequests, 7); assert.equal(mocked.report.counts.created, 333); assert.equal(mocked.report.errors.length, 0);
});
