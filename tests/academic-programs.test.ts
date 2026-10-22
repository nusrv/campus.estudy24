import test from 'node:test';
import assert from 'node:assert/strict';
import { academicCreateSchema, academicPatchSchema, academicIngestSchema, academicIncoming, academicQuerySchema, verifiedTuition } from '../src/server/academic-validation.ts';
import { academicSourceKey } from '../src/server/academic-programs.ts';
import { academicExample } from '../src/lib/academic-example.ts';
import { contentPermission, bindUniversity, type AdministratorAccess } from '../src/server/administrator-access.ts';

const input = { source_key: 'uqu-degrees', source_id: 'illustrative-variant-1', name: 'مثال توضيحي للاختبار فقط', source_url: 'https://uqu.edu.sa/App/Degrees' };
test('academic fields remain nullable; degrees retain unrestricted original designations', () => {
  const parsed = academicIngestSchema.parse(input), fields = academicIncoming(parsed);
  assert.equal(fields.degreeName, null); assert.equal(fields.creditHours, null); assert.equal(fields.tuitionInfo, null); assert.equal(fields.studyPlanUrl, null);
  for (const degree_name of ['دبلوم متوسط', 'الزمالة الطبية', 'برنامج تأهيلي', 'درجة كما يسميها المصدر']) assert.equal(academicIncoming(academicIngestSchema.parse({ ...input, degree_name })).degreeName, degree_name);
  assert.equal(academicIngestSchema.safeParse({ ...input, name: '' }).success, false);
  assert.equal(academicIngestSchema.safeParse({ ...input, source_id: '' }).success, false);
  assert.equal(academicIngestSchema.safeParse({ ...input, credit_hours: -1 }).success, false);
  assert.equal(academicIngestSchema.safeParse({ ...input, credit_hours: '60' }).success, false);
  assert.ok(academicIngestSchema.safeParse({ ...input, credit_hours: 0.5 }).success);
  const invalid = academicCreateSchema.safeParse({ title: 'اسم', universityId: 'u1', creditHours: -1 });
  assert.ok(!invalid.success && invalid.error.issues.some(issue => /الساعات/.test(issue.message)));
});
test('fees require explicit verified information and source; plan links are never inferred', () => {
  assert.equal(academicIngestSchema.safeParse({ ...input, tuition_info: 'رسوم توضيحية' }).success, false);
  assert.equal(academicIngestSchema.safeParse({ ...input, tuition_verified: true }).success, false);
  assert.ok(academicIngestSchema.safeParse({ ...input, tuition_info: 'نص رسوم توضيحي', tuition_verified: true, tuition_source_url: 'https://uqu.edu.sa/fees' }).success);
  assert.equal(verifiedTuition({ tuitionInfo: null, tuitionVerified: false, tuitionSourceUrl: null }), true);
  assert.equal(academicIngestSchema.safeParse({ ...input, study_plan_url: 'javascript:alert(1)' }).success, false);
  assert.equal(academicIncoming(academicIngestSchema.parse(input)).studyPlanUrl, null);
});
test('deduplication uses university, registered source and stable variant ID, never program names', () => {
  const key = academicSourceKey('u1', 'degrees', 'variant-a');
  assert.equal(key, academicSourceKey('u1', 'degrees', 'variant-a'));
  assert.notEqual(key, academicSourceKey('u2', 'degrees', 'variant-a'));
  assert.notEqual(key, academicSourceKey('u1', 'other-source', 'variant-a'));
  assert.notEqual(key, academicSourceKey('u1', 'degrees', 'variant-b'));
});
test('academic ingestion rejects editorial fields and unsupported fields; PATCH has no destructive defaults', () => {
  for (const field of ['status', 'visible', 'deletedAt', 'editedFields', 'universityId', 'sourceKey']) assert.equal(academicIngestSchema.safeParse({ ...input, [field]: 'forged' }).success, false);
  assert.deepEqual(academicPatchSchema.parse({ title: 'تعديل' }), { title: 'تعديل' });
  assert.ok(academicCreateSchema.safeParse({ title: 'اسم', universityId: 'u1' }).success);
  assert.equal(academicCreateSchema.safeParse({ title: 'اسم' }).success, false);
});
test('academic filters validate pagination and forbid homepage scope', () => {
  assert.equal(academicQuerySchema.parse({}).page_size, 12);
  for (const params of [{ page: 0 }, { page_size: 101 }, { scope: 'homepage' }]) assert.equal(academicQuerySchema.safeParse(params).success, false);
  assert.equal(academicQuerySchema.parse({ degree: 'الزمالة الطبية', college: 'كلية', department: 'قسم' }).degree, 'الزمالة الطبية');
});
test('academic resources use existing Ambassador scope and Editor permissions', () => {
  const ambassador: AdministratorAccess = { id: 'a', role: 'ambassador', universityId: 'u1', university: { id: 'u1', name: 'جامعة', slug: 'u1', enabled: true } };
  for (const operation of ['read', 'write', 'delete'] as const) assert.doesNotThrow(() => contentPermission(ambassador, 'academic-programs', operation));
  assert.deepEqual(bindUniversity(ambassador, { title: 'اسم' }), { title: 'اسم', universityId: 'u1' });
  assert.throws(() => bindUniversity(ambassador, { universityId: 'u2' }));
  const editor = { ...ambassador, role: 'editor', universityId: null, university: null };
  assert.doesNotThrow(() => contentPermission(editor, 'academic-programs', 'write'));
  assert.throws(() => contentPermission(editor, 'academic-programs', 'delete'));
});
test('documentation example is illustrative, valid and contains no fabricated academic facts', () => {
  const example = academicExample();
  assert.match(example.name, /مثال توضيحي/); assert.equal(example.degree_name, null); assert.equal(example.tuition_info, null);
  assert.ok(academicIngestSchema.safeParse(example).success);
  assert.equal(academicExample('other', 'https://official.example.edu').source_url, 'https://official.example.edu');
});
