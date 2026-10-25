import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { academicIngestSchema, academicIncoming } from './academic-validation';
import { academicSourceKey } from './academic-programs';
import { ingestionAuthentication } from './ingestion-auth';
import { requireUniversityScope } from './integration-policy';
import { HttpError, MAX_BATCH_SIZE, readJson } from './security';
import { failure, json } from './http';
import type { IngestResult } from './ingestion';
import { academicPublicationDecision } from './academic-publication-policy';

type Credential = { keyId: string; universityId: string; universitySlug: string };
async function importAcademic(raw: unknown, credential: Credential, requestId: string, index: number): Promise<IngestResult> {
  const parsed = academicIngestSchema.safeParse(raw);
  if (!parsed.success) {
    await db.ingestionLog.create({ data: { requestId, resourceType: 'academic-programs', outcome: 'rejected', errorCode: 'VALIDATION_ERROR' } });
    return { index, resource_type: 'academic-programs', outcome: 'rejected', error: { code: 'VALIDATION_ERROR', fields: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) } };
  }
  const input = parsed.data;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "UniversityApiKey" WHERE "id" = ${credential.keyId} FOR SHARE`;
        const key = await tx.universityApiKey.findUnique({ where: { id: credential.keyId } });
        if (!key || key.revokedAt || key.universityId !== credential.universityId) throw new HttpError(401, 'UNAUTHORIZED', 'مفتاح الجامعة غير صالح أو ملغى.');
        if (input.university_slug) requireUniversityScope(input.university_slug, credential.universitySlug);
        const source = await tx.ingestionSource.findUnique({ where: { key: input.source_key }, include: { university: true } });
        if (!source || !source.enabled || !source.university.enabled) throw new HttpError(422, 'UNKNOWN_SOURCE', 'مصدر الاستيراد غير موجود أو غير مفعّل.');
        if (source.universityId !== credential.universityId) throw new HttpError(403, 'UNIVERSITY_SCOPE_MISMATCH', 'المصدر لا يتبع جامعة المفتاح.');
        if (new URL(source.url).hostname !== new URL(input.source_url).hostname) throw new HttpError(422, 'SOURCE_HOST_MISMATCH', 'رابط المصدر لا يطابق المضيف المضبوط.');
        const sourceKey = academicSourceKey(credential.universityId, source.key, input.source_id);
        const old = await tx.academicProgram.findUnique({ where: { sourceKey } });
        const policy = academicPublicationDecision(source.autoPublishAcademicPrograms, input, !!old);
        const fingerprint = createHash('sha256').update(JSON.stringify(academicIncoming(input))).digest('hex');
        let outcome: IngestResult['outcome'] = 'unchanged';
        let item;
        if (!old) {
          item = await tx.academicProgram.create({ data: { ...academicIncoming(input), universityId: credential.universityId, origin: 'imported', sourceId: source.id, sourceSystem: source.key, externalId: input.source_id, sourceKey, lastSyncedAt: new Date(), fingerprint, sourceSnapshot: input, status: policy.publish ? 'published' : 'pending_review' } });
          outcome = 'created';
        } else {
          const fields = old.fingerprint !== fingerprint && !old.deletedAt ? Object.fromEntries(Object.entries(academicIncoming(input)).filter(([field]) => !old.editedFields.includes(field))) : {};
          if (old.fingerprint !== fingerprint && !old.deletedAt) outcome = 'updated';
          // Status, visibility, deletedAt, source identity and university never come from the payload.
          item = await tx.academicProgram.update({ where: { id: old.id }, data: { ...fields, lastSyncedAt: new Date(), fingerprint, sourceSnapshot: input } });
        }
        const decision = old?.deletedAt ? 'preserved_manual_deletion' : policy.reason;
        if (!old) await tx.auditLog.create({ data: { action: 'academic_import_publication_decision', entity: 'academic-programs', entityId: item.id, details: { universityId: credential.universityId, sourceId: source.id, decision, status: item.status, requestId } } });
        await tx.ingestionLog.create({ data: { requestId, sourceId: source.id, originalId: input.source_id, resourceType: 'academic-programs', resourceId: item.id, outcome, publicationDecision: decision } });
        return { index, resource_type: 'academic-programs', resource_id: item.id, outcome, publication: { status: item.status, decision } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code) && attempt < 3) continue;
      const rejected = error instanceof HttpError;
      const code = rejected ? error.code : 'INGESTION_FAILED';
      await db.ingestionLog.create({ data: { requestId, originalId: input.source_id, resourceType: 'academic-programs', outcome: rejected ? 'rejected' : 'failed', errorCode: code } });
      return { index, resource_type: 'academic-programs', outcome: rejected ? 'rejected' : 'failed', error: { code } };
    }
  }
  throw new HttpError(503, 'INGESTION_FAILED', 'تعذّر استيراد البرنامج.');
}
export async function handleAcademicIngestion(request: Request) {
  const requestId = randomUUID();
  let authenticated = false;
  try {
    const credential = await ingestionAuthentication(request, true);
    if (!credential) throw new HttpError(401, 'UNIVERSITY_KEY_REQUIRED', 'مفتاح الجامعة مطلوب.');
    authenticated = true;
    const body = await readJson(request);
    const batch = !!body && typeof body === 'object' && 'items' in body;
    let records: unknown[];
    if (batch) {
      const envelope = body as { items: unknown };
      if (Object.keys(envelope).some(key => key !== 'items') || !Array.isArray(envelope.items) || !envelope.items.length || envelope.items.length > MAX_BATCH_SIZE) throw new HttpError(422, 'INVALID_BATCH', 'أرسل من 1 إلى 50 سجلًا ضمن items.');
      records = envelope.items;
    } else records = [body];
    // Reject a forged scope anywhere in the batch before writing any record.
    for (const record of records) if (record && typeof record === 'object') {
      const value = record as Record<string, unknown>;
      if ('university_slug' in value) requireUniversityScope(value.university_slug, credential.universitySlug);
      if (['universityId', 'university_id', 'university', 'universitySlug'].some(field => field in value)) throw new HttpError(403, 'UNIVERSITY_SCOPE_MISMATCH', 'تُحدد الجامعة من المفتاح فقط.');
      if (typeof value.source_key === 'string') {
        const source = await db.ingestionSource.findUnique({ where: { key: value.source_key }, select: { universityId: true } });
        if (source && source.universityId !== credential.universityId) throw new HttpError(403, 'UNIVERSITY_SCOPE_MISMATCH', 'المصدر لا يتبع جامعة المفتاح.');
      }
    }
    const results: IngestResult[] = [];
    for (const [index, record] of records.entries()) results.push(await importAcademic(record, credential, requestId, index));
    const counts = { created: 0, updated: 0, unchanged: 0, rejected: 0, failed: 0 };
    for (const result of results) counts[result.outcome]++;
    return json({ request_id: requestId, resource_type: 'academic-programs', counts, results }, batch ? counts.rejected || counts.failed ? 207 : 200 : counts.failed ? 503 : counts.rejected ? 422 : counts.created ? 201 : 200);
  } catch (error) {
    // No request bodies, key material or sensitive exception details enter logs.
    if (authenticated) { try { await db.ingestionLog.create({ data: { requestId, resourceType: 'academic-programs', outcome: 'rejected', errorCode: error instanceof HttpError ? error.code : 'INGESTION_FAILED' } }); } catch { /* redacted failure */ } }
    return failure(error, requestId);
  }
}
