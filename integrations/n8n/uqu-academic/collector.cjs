/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';
// Pure functions shared verbatim with the exported n8n Code nodes. No network or secrets here.
const { createHash } = require('crypto');
const SOURCE = 'https://uqu.edu.sa/App/Degrees';
const CAMPUS = 'https://campus.estudy24.com/api/ingest/academic-programs';
const LIVE_CONFIRMATION = 'SEND_REVIEWED_UQU_ACADEMIC_PROGRAMS';
const MAX_BYTES = 1024 * 1024;
function invariant(ok, code) { if (!ok) throw new Error(code); }
function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (all, part) => {
    if (part[0] === '#') { const n = part[1].toLowerCase() === 'x' ? parseInt(part.slice(2), 16) : Number(part.slice(1)); return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all; }
    return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[part.toLowerCase()];
  });
}
function text(html) { return decode(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')).normalize('NFC').replace(/\s+/gu, ' ').trim(); }
function digits(value) { return value.replace(/[٠-٩۰-۹]/g, ch => String(ch.charCodeAt(0) - (ch <= '٩' ? 0x660 : 0x6f0))).replace(/٫/g, '.'); }
function leafSpans(html) { return [...html.matchAll(/<span\b[^>]*>([^<]*)<\/span>/gi)].map(m => text(m[1])).filter(Boolean); }
function officialUrl(value) {
  // Exact verified canonical format; no URL global/module is required in the n8n Code sandbox.
  const url = decode(value);
  invariant(/^https:\/\/uqu\.edu\.sa\/App\/Degrees\/\d{1,20}$/.test(url), 'INVALID_OFFICIAL_PROGRAM_URL');
  return url;
}
function hours(value) {
  const v = digits(value);
  if (!v || ['-', '—', 'غير متاح'].includes(v)) return null;
  invariant(/^\d+(?:\.\d+)?$/.test(v), 'INVALID_CREDIT_HOURS');
  const n = Number(v); invariant(Number.isFinite(n) && n >= 0 && n <= 5000, 'INVALID_CREDIT_HOURS'); return n;
}
function parsePage(html, expectedPage, perPage = 100) {
  invariant(typeof html === 'string' && Buffer.byteLength(html, 'utf8') <= 8 * MAX_BYTES, 'INVALID_SOURCE_BODY');
  // Restrict extraction to the known server-rendered academic table; never parse page navigation/login as data.
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(m => m[0]).filter(t => /البرنامج/.test(t) && /الكلية\s*\/\s*القسم/.test(text(t)) && /الساعات/.test(t));
  invariant(tables.length === 1, 'SOURCE_LAYOUT_CHANGED');
  const originalTable = tables[0], footer = digits(text(html.slice(html.indexOf(originalTable) + originalTable.length)));
  const table = originalTable.replace(/<svg\b[\s\S]*?<\/svg>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const pagination = footer.match(/صفحة\s+(\d+)\s+من\s+(\d+)/), total = footer.match(/عرض\s+(\d+)\s+إلى\s+(\d+)\s+من\s+أصل\s+(\d+)\s+نتيجة/);
  invariant(pagination && total, 'MISSING_PAGINATION');
  const page = Number(pagination[1]), pages = Number(pagination[2]), count = Number(total[3]);
  invariant(page === expectedPage && pages === Math.ceil(count / perPage) && pages > 0 && count > 0 && count <= 5000, 'UNEXPECTED_PAGINATION');
  const rows = [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map(m => m[0]).filter(r => !/<th\b/i.test(r) && !/data-skeleton/.test(r));
  invariant(rows.length === Math.min(perPage, count - (page - 1) * perPage) && Number(total[1]) === (page - 1) * perPage + 1 && Number(total[2]) === (page - 1) * perPage + rows.length, 'INCOMPLETE_SOURCE_PAGE');
  const records = [], evidence = [], errors = [];
  for (const [index, row] of rows.entries()) {
    try {
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
      invariant(cells.length === 6, 'SOURCE_COLUMN_LAYOUT_CHANGED');
      const links = [...row.matchAll(/\bhref="([^"]+)"/gi)].map(m => officialUrl(m[1]));
      invariant(links.length > 0 && new Set(links).size === 1, 'AMBIGUOUS_PROGRAM_ID');
      const url = links[0], sourceId = url.split('/').pop();
      const degree = text(cells[1]) || null;
      const withoutBadge = cells[0].replace(/<span\b[^>]*data-slot="badge"[^>]*>[\s\S]*?<\/span>\s*<\/span>/gi, '');
      const spans = leafSpans(withoutBadge), name = spans[0];
      invariant(name && name !== degree, 'MISSING_PROGRAM_NAME');
      const organization = leafSpans(cells[2]);
      invariant(organization.length <= 2 && (organization.length < 2 || organization[0].endsWith('/')), 'AMBIGUOUS_COLLEGE_DEPARTMENT');
      invariant(spans.length === organization.length + 1 && organization.every((part, i) => spans[i + 1] === part), 'AMBIGUOUS_PROGRAM_NAME_LAYOUT');
      const college = organization[0]?.replace(/\s*\/$/, '').trim() || null;
      const department = organization[1] || null;
      const record = { university_slug: 'uqu', source_key: 'uqu-degrees', source_id: sourceId, name, degree_name: degree, college, department, campus: null, credit_hours: hours(text(cells[3])), study_mode: null, tuition_info: null, tuition_verified: false, tuition_source_url: null, description: null, source_url: url, official_program_url: url, study_plan_url: null };
      validateRecord(record);
      records.push(record);
      // Fee labels are retained as observations only: directory labels are not a verified fee assessment.
      evidence.push({ source_id: sourceId, directory_fee_label: text(cells[4]) || null, source_url: url });
    } catch (error) { errors.push({ page, row: index + 1, code: error.message }); }
  }
  return { page, pages, total: count, rows: rows.length, records, evidence, errors };
}
function validateRecord(r) {
  invariant(r && r.university_slug === 'uqu' && r.source_key === 'uqu-degrees' && /^\d{1,20}$/.test(r.source_id), 'INVALID_SOURCE_IDENTITY');
  for (const [field, max] of Object.entries({ name: 500, degree_name: 200, college: 300, department: 300 })) {
    const v = r[field]; invariant(field !== 'name' || !!v, 'MISSING_PROGRAM_NAME');
    invariant(v === null || typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v) && !/&(?:#\w+|\w+);/.test(v), 'INVALID_' + field.toUpperCase());
  }
  invariant(officialUrl(r.source_url) === r.official_program_url && r.source_url.endsWith('/' + r.source_id), 'SOURCE_ID_URL_MISMATCH');
  invariant(r.credit_hours === null || typeof r.credit_hours === 'number' && Number.isFinite(r.credit_hours) && r.credit_hours >= 0 && r.credit_hours <= 5000, 'INVALID_CREDIT_HOURS');
  invariant(r.campus === null && r.study_mode === null && r.study_plan_url === null && r.description === null && r.tuition_info === null && r.tuition_source_url === null && r.tuition_verified === false, 'UNVERIFIED_OPTIONAL_FIELD');
}
function batches(records) {
  const result = []; let chunk = [];
  for (const r of records) {
    validateRecord(r);
    invariant(Buffer.byteLength(JSON.stringify({ items: [r] }), 'utf8') < MAX_BYTES, 'RECORD_TOO_LARGE');
    if (chunk.length === 50 || Buffer.byteLength(JSON.stringify({ items: [...chunk, r] }), 'utf8') >= MAX_BYTES) { result.push(chunk); chunk = []; }
    chunk.push(r);
  }
  if (chunk.length) result.push(chunk); return result;
}
function initial(config = {}) {
  const defaults = { mode: 'dry_run', liveConfirmation: '', approvedDatasetFingerprint: '', maxPages: 10, perPage: 100, requestIntervalSeconds: 2, maxAttempts: 4 };
  const c = { ...defaults, ...config };
  invariant(['dry_run', 'live'].includes(c.mode) && c.perPage === 100 && Number.isInteger(c.maxPages) && c.maxPages >= 1 && c.maxPages <= 50 && Number.isInteger(c.maxAttempts) && c.maxAttempts >= 1 && c.maxAttempts <= 5 && Number.isFinite(c.requestIntervalSeconds) && c.requestIntervalSeconds >= 2 && c.requestIntervalSeconds <= 60, 'INVALID_CONFIGURATION');
  return { config: c, phase: 'collect', page: 1, attempt: 1, delaySeconds: 0, records: [], evidence: [], sourcePages: [], errors: [], sourceAttempts: [], outcomes: {}, campusAttempts: [], batches: [], batchIndex: 0, pending: [], fetchedRows: 0, expectedTotal: null, expectedPages: null };
}
function retryDelay(response, attempt, base = 2) {
  const value = response?.headers?.['retry-after'] ?? response?.headers?.['Retry-After'];
  let seconds = Number(value);
  if (value && !Number.isFinite(seconds)) seconds = Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 1000));
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  invariant(seconds <= 300, 'RETRY_AFTER_REQUIRES_OPERATOR');
  return Math.max(base, Math.min(60, 2 ** attempt), seconds);
}
function sourceRequest(s) {
  invariant(s.phase === 'collect', 'SOURCE_NOT_READY');
  invariant(s.page <= s.config.maxPages, 'PAGE_LIMIT_REACHED');
  s.requestUrl = SOURCE + '?perPage=100&page=' + s.page;
  return s;
}
function sourceResponse(s, response) {
  const status = Number(response?.statusCode) || 0;
  s.sourceAttempts.push({ page: s.page, attempt: s.attempt, status });
  try {
    if (status !== 200) {
      if ([0, 408, 429, 500, 502, 503, 504].includes(status) && s.attempt < s.config.maxAttempts) { s.delaySeconds = retryDelay(response, s.attempt++, s.config.requestIntervalSeconds); return s; }
      throw new Error('SOURCE_HTTP_' + status);
    }
    const contentType = String(response.headers?.['content-type'] || response.headers?.['Content-Type'] || '');
    invariant(/text\/html/i.test(contentType), 'SOURCE_NOT_HTML');
    const parsed = parsePage(response.body, s.page, s.config.perPage);
    invariant(s.expectedTotal === null || parsed.total === s.expectedTotal && parsed.pages === s.expectedPages, 'SOURCE_CHANGED_DURING_COLLECTION');
    invariant(parsed.pages <= s.config.maxPages, 'PAGE_LIMIT_REACHED');
    const ids = parsed.records.map(r => r.source_id).join(',');
    invariant(!s.sourcePages.some(p => p.ids === ids), 'REPEATED_SOURCE_PAGE');
    s.expectedTotal = parsed.total; s.expectedPages = parsed.pages;
    s.sourcePages.push({ page: parsed.page, rows: parsed.rows, ids });
    s.records.push(...parsed.records); s.evidence.push(...parsed.evidence); s.errors.push(...parsed.errors); s.fetchedRows += parsed.rows;
    s.attempt = 1; s.delaySeconds = s.config.requestIntervalSeconds;
    if (s.page < parsed.pages) s.page++; else s.phase = 'collected';
  } catch (error) { s.errors.push({ stage: 'source', page: s.page, code: error.message }); s.phase = 'blocked'; }
  return s;
}
function finalizeCollection(s) {
  if (s.phase !== 'collected') { s.phase = 'blocked'; return s; }
  try {
    invariant(s.records.length > 0 && s.fetchedRows === s.expectedTotal && s.sourcePages.length === s.expectedPages, 'INCOMPLETE_DATASET');
    const unique = new Map(); s.duplicateRows = 0;
    for (const r of s.records) {
      validateRecord(r); const existing = unique.get(r.source_id);
      if (existing) { invariant(JSON.stringify(existing) === JSON.stringify(r), 'CONFLICTING_OFFICIAL_ID'); s.duplicateRows++; }
      else unique.set(r.source_id, r);
    }
    s.records = [...unique.values()].sort((a, b) => a.source_id.localeCompare(b.source_id, 'en'));
    s.datasetFingerprint = createHash('sha256').update(JSON.stringify(s.records)).digest('hex');
    s.batches = batches(s.records);
    invariant(s.errors.length === 0, 'RECORD_ERRORS_BLOCK_INGESTION');
    if (s.config.mode === 'dry_run') s.phase = 'dry_run';
    else {
      invariant(s.config.liveConfirmation === LIVE_CONFIRMATION && s.config.approvedDatasetFingerprint === s.datasetFingerprint, 'LIVE_APPROVAL_REQUIRED');
      s.phase = 'submit'; s.pending = s.batches[0]; s.attempt = 1;
    }
  } catch (error) { s.errors.push({ stage: 'validation', code: error.message }); s.phase = 'blocked'; }
  return s;
}
function campusRequest(s) {
  invariant(s.phase === 'submit' && s.config.mode === 'live' && s.config.liveConfirmation === LIVE_CONFIRMATION && s.config.approvedDatasetFingerprint === s.datasetFingerprint && s.pending.length > 0, 'LIVE_APPROVAL_REQUIRED');
  invariant(s.pending.length <= 50 && Buffer.byteLength(JSON.stringify({ items: s.pending }), 'utf8') < MAX_BYTES, 'INVALID_BATCH_SIZE');
  s.requestUrl = CAMPUS; return s;
}
function campusResponse(s, response) {
  const status = Number(response?.statusCode) || 0, sent = s.pending;
  const attempt = { batch: s.batchIndex + 1, attempt: s.attempt, status, source_ids: sent.map(r => r.source_id), results: [] };
  s.campusAttempts.push(attempt);
  try {
    if ([0, 408, 429, 500, 502, 503, 504].includes(status)) {
      invariant(s.attempt < s.config.maxAttempts, 'CAMPUS_RETRY_EXHAUSTED');
      s.delaySeconds = retryDelay(response, s.attempt++, 2); return s;
    }
    invariant([200, 201, 207].includes(status), 'CAMPUS_PERMANENT_HTTP_' + status);
    const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    invariant(body && body.resource_type === 'academic-programs' && Array.isArray(body.results) && body.results.length === sent.length, 'INVALID_CAMPUS_REPORT');
    const indices = new Set(), retry = [], staged = [], actual = { created: 0, updated: 0, unchanged: 0, rejected: 0, failed: 0 };
    for (const r of body.results) {
      invariant(Number.isInteger(r.index) && r.index >= 0 && r.index < sent.length && !indices.has(r.index) && Object.hasOwn(actual, r.outcome), 'INVALID_CAMPUS_REPORT');
      indices.add(r.index); actual[r.outcome]++;
      const id = sent[r.index].source_id;
      const outcome = { source_id: id, outcome: r.outcome, resource_id: r.resource_id || null, error_code: r.error?.code || null, error_fields: Array.isArray(r.error?.fields) ? r.error.fields.slice(0, 30).map(f => ({ path: String(f.path || '').slice(0, 100), message: String(f.message || '').slice(0, 500) })) : [], request_id: body.request_id || null, publication: r.publication || null };
      staged.push(outcome);
      if (r.outcome === 'failed' && r.error?.code === 'INGESTION_FAILED') retry.push(sent[r.index]);
    }
    invariant(body.counts && Object.keys(actual).every(k => body.counts[k] === actual[k]), 'INVALID_CAMPUS_COUNTS');
    for (const outcome of staged) { attempt.results.push(outcome); s.outcomes[outcome.source_id] = outcome; }
    if (retry.length && s.attempt < s.config.maxAttempts) { s.pending = retry; s.delaySeconds = retryDelay(response, s.attempt++); return s; }
    s.batchIndex++; s.attempt = 1; s.delaySeconds = 2;
    if (s.batchIndex < s.batches.length) s.pending = s.batches[s.batchIndex]; else { s.pending = []; s.phase = Object.values(s.outcomes).some(r => ['failed', 'rejected'].includes(r.outcome)) ? 'completed_with_errors' : 'completed'; }
  } catch (error) { s.errors.push({ stage: 'campus', batch: s.batchIndex + 1, code: error.message === 'Unexpected end of JSON input' ? 'INVALID_CAMPUS_REPORT' : /^CAMPUS_|^INVALID_|^RETRY_/.test(error.message) ? error.message : 'INVALID_CAMPUS_REPORT' }); s.phase = 'blocked'; }
  return s;
}
function summary(s) {
  const outcomes = Object.values(s.outcomes), counts = { created: 0, updated: 0, unchanged: 0, rejected: 0, failed: 0, unconfirmed: 0 };
  for (const r of outcomes) counts[r.outcome]++;
  if (s.config.mode === 'live') counts.unconfirmed = s.records.length - outcomes.length;
  return { mode: s.config.mode, status: s.phase, source: SOURCE, dataset_fingerprint: s.datasetFingerprint || null, official_total_rows: s.expectedTotal, fetched_rows: s.fetchedRows, parsed_programs: s.records.length, duplicate_rows: s.duplicateRows || 0, pages: s.sourcePages.map(({ page, rows }) => ({ page, rows })), batch_sizes: s.batches.map(b => b.length), campus_requests: s.campusAttempts.length, counts, errors: s.errors, outcomes, attempts: s.campusAttempts, source_attempts: s.sourceAttempts, sample: s.records.slice(0, 5), records: s.records, fee_observations_not_ingested: s.evidence, note: 'No deletion or automatic publication. New imported programs require review. Fee labels are observations, not verified tuition.' };
}
module.exports = { SOURCE, CAMPUS, LIVE_CONFIRMATION, decode, text, digits, hours, officialUrl, parsePage, validateRecord, batches, initial, retryDelay, sourceRequest, sourceResponse, finalizeCollection, campusRequest, campusResponse, summary };
