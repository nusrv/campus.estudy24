import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCourse, fetchCatalogInventory, CatalogSourceError } from '../src/server/course-source.ts';
import { catalogSearch, coursePlainText, courseDisplayTitle, courseSummary, resolveCourseUniversity, trustedCourseUrl, VERIFIED_COURSE_MAPPINGS } from '../src/lib/course-catalog.ts';
export const sampleCourse = (id = 1) => ({ id, status: 'publish', title: { rendered: 'أسس الرياضيات MAT 1153' }, content: { rendered: '<p>شرح تعليمي</p>' }, excerpt: { rendered: '<p>شرح للمفاهيم الأساسية.</p>' }, slug: `sample-${id}`, link: `https://estudy24.com/courses/sample-${id}/`, modified_gmt: '2026-10-20T10:00:00', 'course-category': [227], featured_media: 10, _embedded: { 'wp:featuredmedia': [{ id: 10, source_url: 'https://estudy24.com/wp-content/uploads/sample.png', media_details: { sizes: { medium: { source_url: 'https://estudy24.com/wp-content/uploads/sample-300.png' } } } }] } });
const category = { id: 227, name: 'جامعة أم القرى', slug: 'uqu', parent: 0, count: 101 };
const response = (rows: unknown[], total: number, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'x-wp-totalpages': String(Math.ceil(total/100)), 'x-wp-total': String(total) } });
test('published source parsing keeps identity, plain description and appropriate embedded featured image', () => {
  const c = parseCourse(sampleCourse()); assert.equal(c.wordpressId, 1); assert.equal(c.title, 'أسس الرياضيات'); assert.equal(c.sourceTitle, 'أسس الرياضيات MAT 1153'); assert.match(c.description, /مفاهيم/); assert.equal(c.imageUrl, 'https://estudy24.com/wp-content/uploads/sample-300.png'); assert.equal(c.sourceModifiedAt.toISOString(), '2026-10-20T10:00:00.000Z');
  assert.equal(parseCourse({ ...sampleCourse(), _embedded: {} }).imageUrl, null);
  assert.equal(parseCourse({ ...sampleCourse(), _embedded: { 'wp:featuredmedia': [{ id: 10, source_url: 'https://evil.invalid/x.png' }] } }).imageUrl, null);
  assert.throws(() => parseCourse({ ...sampleCourse(), status: 'draft' })); assert.throws(() => parseCourse({ ...sampleCourse(), title: { rendered: 'secret', protected: true } })); assert.throws(() => parseCourse({ ...sampleCourse(), link: 'https://estudy24.com.evil.invalid/' }));
});
test('HTML is inert text; price and course-code fragments are absent from public display', () => {
  assert.equal(coursePlainText('<script>alert(1)</script><p>شرح &amp; &#1571; <img src=x onerror=alert(1)></p>'), 'شرح & أ');
  assert.equal(courseDisplayTitle('رياضيات -MATH 101-'), 'رياضيات'); assert.equal(courseSummary('اشتراك 175 ريال. شرح المفاهيم الأساسية.'), 'شرح المفاهيم الأساسية.');
  for (const url of ['javascript:alert(1)', 'https://evil.invalid/x', 'https://user:pass@estudy24.com/x', 'http://estudy24.com/x', 'https://estudy24.com:8443/x', 'https://estudy24.com/x?secret=x']) assert.equal(trustedCourseUrl(url), null);
  assert.equal(trustedCourseUrl('https://estudy24.com/wp-content/uploads/x.svg', true), null);
});
test('Arabic and English normalization preserves useful search without changing source text', () => { assert.equal(catalogSearch(' أُسُس  الإحصاء '), catalogSearch('اسس الاحصاء')); assert.equal(catalogSearch('Calculus II'), 'calculus ii'); });
test('reverse course-code variants and Arabic numerals are formatted for public display', () => { assert.equal(courseDisplayTitle('كيمياء الكم 447CHEM'), 'كيمياء الكم'); assert.equal(courseDisplayTitle('القسم ٢ - CHEM ١٠١'), 'القسم 2'); assert.equal(courseDisplayTitle('شرح أساسي 175 ريال'), 'شرح أساسي'); });
test('only explicit verified category mappings assign universities; subjects never infer assignments', () => {
  assert.equal(VERIFIED_COURSE_MAPPINGS.length, 7); const mappings = [{ categoryId: 227, universityId: 'u1', enabled: true }, { categoryId: 375, universityId: 'u2', enabled: true }, { categoryId: 99, universityId: 'u1', enabled: false }];
  assert.deepEqual(resolveCourseUniversity([227, 310], mappings), { universityId: 'u1', mappingState: 'mapped' }); assert.equal(resolveCourseUniversity([310], mappings).mappingState, 'unknown'); assert.equal(resolveCourseUniversity([227,375], mappings).mappingState, 'ambiguous'); assert.equal(resolveCourseUniversity([99], mappings).universityId, null);
});
test('complete multi-page collection respects source headers, fields and bounded sequential requests', async () => {
  let requests = 0; const pages: number[] = [];
  const fetcher: typeof fetch = async input => { requests++; const u = new URL(String(input)), n = Number(u.searchParams.get('page')); assert.equal(u.searchParams.get('per_page'), '100'); assert.equal(u.hostname, 'estudy24.com');
    if (u.pathname.endsWith('course-category')) return response([category], 1);
    assert.equal(u.searchParams.get('status'), 'publish'); assert.ok(!u.searchParams.get('_fields')!.includes('author')); pages.push(n); return response(n === 1 ? Array.from({ length: 100 }, (_, i) => sampleCourse(i+1)) : [sampleCourse(101)], 101); };
  const data = await fetchCatalogInventory({ fetcher, pause: async () => {} }); assert.equal(data.courses.length, 101); assert.equal(requests, 4); assert.deepEqual(pages, [1,2,1]);
});
test('incomplete pagination, drifting inventory, missing headers, duplicate IDs and unknown categories fail closed', async () => {
  for (const kind of ['empty', 'duplicate', 'drift', 'headers', 'category', 'malformed']) {
    let courseCalls = 0;
    const fetcher: typeof fetch = async input => { const u = new URL(String(input)); if (u.pathname.endsWith('course-category')) return response([category], 1); courseCalls++;
      if (kind === 'headers') return new Response('[]'); if (kind === 'category') return response([{ ...sampleCourse(), 'course-category': [12345] }], 1); if (kind === 'malformed') return response([{ ...sampleCourse(), modified_gmt: 'bad' }], 1);
      if (courseCalls === 1) return response(Array.from({ length: 100 }, (_, i) => sampleCourse(i+1)), 101);
      if (kind === 'drift') return response([sampleCourse(101)], 102); if (kind === 'duplicate') return response([sampleCourse(1)], 101); return response([], 101); };
    await assert.rejects(() => fetchCatalogInventory({ fetcher, pause: async () => {} }), kind);
  }
});
test('temporary network errors retry with backoff; permanent authorization failures do not', async () => {
  const delays: number[] = []; let calls = 0;
  const fetcher: typeof fetch = async input => { calls++; if (calls === 1) return new Response('', { status: 429, headers: { 'retry-after': '2' } }); if (calls === 2) throw new Error('timeout'); return String(input).includes('course-category?') ? response([category], 1) : response([sampleCourse()], 1); };
  assert.equal((await fetchCatalogInventory({ fetcher, pause: async ms => { delays.push(ms); } })).courses.length, 1); assert.deepEqual(delays, [2000, 2000]);
  calls = 0; await assert.rejects(() => fetchCatalogInventory({ fetcher: async () => { calls++; return new Response('', { status: 401 }); }, pause: async () => {} }), (e: unknown) => e instanceof CatalogSourceError && e.code === 'SOURCE_HTTP_401'); assert.equal(calls, 1);
});
test('empty source is explicit and body, timeout/deadline and source-host limits are enforced', async () => {
  assert.equal((await fetchCatalogInventory({ fetcher: async () => response([], 0) })).courses.length, 0);
  await assert.rejects(() => fetchCatalogInventory({ fetcher: async () => new Response('[]', { headers: { 'x-wp-total': '10001', 'x-wp-totalpages': '101' } }) }));
  let calls = 0; await assert.rejects(() => fetchCatalogInventory({ fetcher: async () => { calls++; throw new Error('network timeout'); }, pause: async () => {} })); assert.equal(calls, 4);
});
test('request signals enforce timeouts and an expired global deadline makes no request', async () => {
  let attempts=0;
  await assert.rejects(()=>fetchCatalogInventory({timeoutMs:5,pause:async()=>{},fetcher:async(_url,options)=>{attempts++;return new Promise<Response>((_resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture guard')),1000);options!.signal!.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('request timed out'));},{once:true});});}}));assert.equal(attempts,4);
  attempts=0;await assert.rejects(()=>fetchCatalogInventory({maxDurationMs:-1,fetcher:async()=>{attempts++;return response([],0);}}));assert.equal(attempts,0);
  await assert.rejects(()=>fetchCatalogInventory({fetcher:async()=>new Response(' '.repeat(17*1024*1024),{headers:{'x-wp-totalpages':'0','x-wp-total':'0'}})}));
});

test('verified minimal public eStudy24 fixtures parse without private WordPress data', () => { const fixture=JSON.parse(readFileSync(new URL('./fixtures/course-catalog/verified-public-sample.json', import.meta.url), 'utf8')); assert.equal(fixture.records.length,2); for(const record of fixture.records) { const c=parseCourse(record); assert.ok(c.wordpressId>0); assert.ok(c.destinationUrl.startsWith('https://estudy24.com/courses/')); assert.equal('author' in record,false); } });
