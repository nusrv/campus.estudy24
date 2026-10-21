import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { newsPublicationDecision } from '../src/server/publication-policy.ts';
import { ingestArticleSchema, universitySchema, settingsSchema } from '../src/server/validation.ts';
import { contentIngestionSchemas } from '../src/server/content-ingestion-validation.ts';
import { validExternalUrl, validTelegramUrl } from '../src/lib/external-links.ts';
import { formatNumber, formatDate, formatDateTime, formatTime, westernDigits } from '../src/lib/format.ts';
const news = ingestArticleSchema.parse({ university_slug: 'uqu', source_id: '1', source_url: 'https://uqu.edu.sa/App/News/1', title: 'خبر موثوق من الجامعة', summary: 'ملخص خبري واضح يستعرض تفاصيل الخبر المنشور في المصدر الرسمي للجامعة.', published_at: '2026-10-21T08:00:00Z' });
const now = new Date('2026-10-21T10:00:00Z');
test('university automatic publication is explicitly opt-in and validates trusted news', () => {
  assert.notEqual(universitySchema.parse({ name: 'جامعة الاختبار', slug: 'test' }).autoPublishNews, true);
  assert.equal(newsPublicationDecision(false, news, null, now).publish, false);
  assert.equal(newsPublicationDecision(true, news, null, now).publish, true);
  for (const patch of [{ published_at: null }, { title: 'قصير' }, { summary: '', content_text: '' }, { published_at: '2027-10-21T08:00:00Z' }, { content_text: '<script>alert(1)</script>' }, { source_url: 'http://uqu.edu.sa/1' }]) {
    const decision = newsPublicationDecision(true, { ...news, ...patch }, null, now);
    assert.equal(decision.publish, false); assert.equal(decision.review, true);
  }
});
test('manual publication locks, hidden, unpublished, deleted and existing published decisions survive synchronization', () => {
  for (const patch of [{ publicationLocked: true }, { status: 'unpublished' }, { status: 'hidden' }, { visible: false }, { deletedAt: now }]) {
    assert.equal(newsPublicationDecision(true, news, { status: 'pending_review', visible: true, publicationLocked: false, deletedAt: null, ...patch }, now).publish, false);
  }
  assert.equal(newsPublicationDecision(false, news, { status: 'published', visible: true, publicationLocked: false, deletedAt: null }, now).reason, 'preserved_published');
  assert.equal(newsPublicationDecision(true, { ...news, content_text: '<script>bad</script>' }, { status: 'published', visible: true, publicationLocked: true, deletedAt: null }, now).reason, 'held_update_preserved_editorial_decision');
});
test('structured resources require explicit dates and destinations and reject publication injection', () => {
  const base = { university_slug: 'uqu', source_id: 1, source_url: 'https://uqu.edu.sa/1', title: 'محتوى اختباري' };
  assert.equal(contentIngestionSchemas.links.safeParse(base).success, false);
  for (const type of ['events', 'calendar', 'programs'] as const) assert.equal(contentIngestionSchemas[type].safeParse({ ...base, published_at: now.toISOString() }).success, false);
  const valid = { links: { ...base, kind: 'student_service', destination_url: 'https://uqu.edu.sa/service' }, events: { ...base, starts_at: now.toISOString() }, calendar: { ...base, starts_at: now.toISOString(), kind: 'examination' }, programs: { ...base, starts_at: now.toISOString() } };
  for (const type of Object.keys(valid) as (keyof typeof valid)[]) {
    assert.equal(contentIngestionSchemas[type].safeParse(valid[type]).success, true);
    assert.equal(contentIngestionSchemas[type].safeParse({ ...valid[type], status: 'published' }).success, false);
    assert.equal(contentIngestionSchemas[type].safeParse({ ...valid[type], universityId: 'other' }).success, false);
  }
  assert.equal(contentIngestionSchemas.events.safeParse({ ...valid.events, ends_at: '2020-01-01T00:00:00Z' }).success, false);
});
test('official and Telegram links permit safe external navigation only', () => {
  assert.equal(validExternalUrl(' https://uqu.edu.sa '), 'https://uqu.edu.sa/');
  for (const value of [null, '', 'javascript:alert(1)', '/relative', 'https://user:pass@uqu.edu.sa', 'https://localhost']) assert.equal(validExternalUrl(value), null);
  for (const value of ['https://t.me/example_campus', 'https://telegram.me/example_support', 'https://t.me/+Abcd12345678']) assert.ok(validTelegramUrl(value));
  for (const value of ['https://t.me.evil.com/group', 'https://evil.com/t.me/group', 'http://t.me/example', 'https://t.me/share', 'https://t.me/proxy?server=x', 'https://t.me/example?secret=x']) assert.equal(validTelegramUrl(value), null);
  assert.equal(settingsSchema.safeParse({ telegramSupportUrl: 'https://evil.com' }).success, false);
  assert.equal(settingsSchema.safeParse({ telegramSupportUrl: null }).success, true);
});
test('Arabic dates, RTL metrics and all digit variants consistently use Western numerals', () => {
  assert.equal(formatNumber(200350), '200,350'); assert.equal(westernDigits('\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'), '0123456789');
  assert.equal(westernDigits('\u06f1\u06f2\u06f3'), '123');
  for (const formatted of [formatDate(now), formatDateTime(now), formatTime(now), formatDate(now, { numberingSystem: 'arab' })]) { assert.doesNotMatch(formatted, /[\u0660-\u0669\u06f0-\u06f9]/); assert.match(formatted, /[0-9]/); }
});
test('verified logo assets retain provenance and exact checksums; workflows contain no inline credentials', () => {
  const logos = JSON.parse(readFileSync('docs/university-logos.json', 'utf8'));
  for (const logo of logos) { assert.ok(new URL(logo.sourcePage).hostname.endsWith('.edu.sa')); assert.equal(createHash('sha256').update(readFileSync('public' + logo.localUrl)).digest('hex'), logo.sha256); }
  for (const type of ['links', 'events', 'calendar', 'programs']) {
    const workflow = JSON.parse(readFileSync(`docs/examples/n8n-${type}-workflow.json`, 'utf8'));
    assert.equal(workflow.active, false); assert.ok(workflow.nodes.some((node: { type: string }) => node.type === 'n8n-nodes-base.httpRequest'));
    assert.doesNotMatch(JSON.stringify(workflow), /campus_uak_/);
  }
});
