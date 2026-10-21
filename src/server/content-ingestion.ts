import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { failure, json } from './http';
import { HttpError, MAX_BATCH_SIZE, readJson } from './security';
import { ingestionAuthentication } from './ingestion-auth';
import { requireUniversityScope } from './integration-policy';
import { contentIngestionSchemas, ingestedLinkSchema, ingestedEventSchema, ingestedCalendarSchema, ingestedProgramSchema, type ImportedContentType } from './content-ingestion-validation';
import type { IngestResult } from './ingestion';
type Credential = { keyId: string; universityId: string; universitySlug: string };
function unedited<T extends object>(fields: T, protectedFields: readonly string[]) { return Object.fromEntries(Object.entries(fields).filter(([key]) => !protectedFields.includes(key))) as Partial<T>; }

async function importContent(type: ImportedContentType, raw: unknown, credential: Credential, requestId: string, index: number): Promise<IngestResult> {
  const parsed = contentIngestionSchemas[type].safeParse(raw);
  if (!parsed.success) {
    await db.ingestionLog.create({ data: { requestId, outcome: 'rejected', resourceType: type, errorCode: 'VALIDATION_ERROR' } });
    return { index, resource_type: type, outcome: 'rejected', error: { code: 'VALIDATION_ERROR', fields: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) } };
  }
  const value = parsed.data;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "UniversityApiKey" WHERE "id" = ${credential.keyId} FOR SHARE`;
        const key = await tx.universityApiKey.findUnique({ where: { id: credential.keyId } });
        if (!key || key.revokedAt || key.universityId !== credential.universityId) throw new HttpError(401, 'UNAUTHORIZED', 'المفتاح ملغى.');
        requireUniversityScope(value.university_slug, credential.universitySlug);
        const source = await tx.ingestionSource.findUnique({ where: { key: value.source_key || `${value.university_slug}-rss` }, include: { university: true } });
        if (!source || !source.enabled || !source.university.enabled) throw new HttpError(422, 'UNKNOWN_SOURCE', 'مصدر الاستيراد غير مفعّل.');
        if (source.universityId !== credential.universityId) throw new HttpError(403, 'UNIVERSITY_SCOPE_MISMATCH', 'المصدر لا يتبع الجامعة المخوّلة.');
        if (new URL(source.url).hostname !== new URL(value.source_url).hostname) throw new HttpError(422, 'SOURCE_HOST_MISMATCH', 'رابط المصدر يجب أن يطابق المضيف المضبوط.');
        const existing = await tx.contentSync.findUnique({ where: { sourceId_contentType_originalId: { sourceId: source.id, contentType: type, originalId: value.source_id } } });
        const fingerprint = createHash('sha256').update(JSON.stringify(value)).digest('hex');
        let recordId = existing?.recordId;
        let outcome: IngestResult['outcome'] = 'unchanged';
        let status = 'pending_review';
        let decision = 'pending_content_review';
        const update = !existing || existing.fingerprint !== fingerprint;
        const protectedFields = existing?.editedFields || [];
        if (existing?.deletedAt) decision = 'preserved_manual_deletion';
        else if (type === 'links') {
          const input = ingestedLinkSchema.parse(raw);
          const fields = { title: input.title, description: input.description, destinationUrl: input.destination_url, imageUrl: input.image_url || null, kind: input.kind, category: input.category, sourceUrl: input.source_url };
          const old = recordId ? await tx.managedLink.findUnique({ where: { id: recordId } }) : null;
          if (existing && !old) decision = 'preserved_manual_deletion';
          else if (!existing) { const created = await tx.managedLink.create({ data: { ...fields, universityId: credential.universityId, status: 'pending_review', active: false } }); recordId = created.id; outcome = 'created'; }
          else { status = old!.status; decision = 'preserved_publication_decision'; if (update) { await tx.managedLink.update({ where: { id: recordId! }, data: unedited(fields, protectedFields) }); outcome = 'updated'; } }
        } else if (type === 'events' || type === 'calendar') {
          const input = type === 'events' ? ingestedEventSchema.parse(raw) : ingestedCalendarSchema.parse(raw);
          const fields = { title: input.title, description: input.description, kind: input.kind, startsAt: new Date(input.starts_at), endsAt: input.ends_at ? new Date(input.ends_at) : null, applicationUrl: input.application_url || null, sourceUrl: input.source_url };
          const old = recordId ? await tx.event.findUnique({ where: { id: recordId } }) : null;
          if (existing && !old) decision = 'preserved_manual_deletion';
          else if (!existing) { const created = await tx.event.create({ data: { ...fields, universityId: credential.universityId, status: 'pending_review', visible: true } }); recordId = created.id; outcome = 'created'; }
          else { status = old!.status; decision = 'preserved_publication_decision'; if (update) { await tx.event.update({ where: { id: recordId! }, data: unedited(fields, protectedFields) }); outcome = 'updated'; } }
        } else {
          const input = ingestedProgramSchema.parse(raw);
          const fields = { title: input.title, description: input.description, startsAt: new Date(input.starts_at), endsAt: input.ends_at ? new Date(input.ends_at) : null, applicationUrl: input.application_url || null, sourceUrl: input.source_url };
          const old = recordId ? await tx.program.findUnique({ where: { id: recordId } }) : null;
          if (existing && !old) decision = 'preserved_manual_deletion';
          else if (!existing) { const created = await tx.program.create({ data: { ...fields, universityId: credential.universityId, status: 'pending_review', visible: true } }); recordId = created.id; outcome = 'created'; }
          else { status = old!.status; decision = 'preserved_publication_decision'; if (update) { await tx.program.update({ where: { id: recordId! }, data: unedited(fields, protectedFields) }); outcome = 'updated'; } }
        }
        if (!existing) await tx.contentSync.create({ data: { sourceId: source.id, contentType: type, originalId: value.source_id, recordId: recordId!, fingerprint, sourceSnapshot: value as Prisma.InputJsonValue } });
        else if (update && !existing.deletedAt) await tx.contentSync.update({ where: { id: existing.id }, data: { fingerprint, sourceSnapshot: value as Prisma.InputJsonValue } });
        await tx.ingestionLog.create({ data: { requestId, sourceId: source.id, originalId: value.source_id, outcome, resourceType: type, resourceId: recordId, publicationDecision: decision } });
        return { index, resource_type: type, resource_id: recordId, outcome, publication: { status, decision } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code) && attempt < 3) continue;
      const code = error instanceof HttpError ? error.code : 'INGESTION_FAILED';
      await db.ingestionLog.create({ data: { requestId, originalId: value.source_id, resourceType: type, outcome: error instanceof HttpError ? 'rejected' : 'failed', errorCode: code, publicationDecision: 'ingestion_failed' } });
      return { index, resource_type: type, outcome: error instanceof HttpError ? 'rejected' : 'failed', error: { code } };
    }
  }
  throw new HttpError(503, 'INGESTION_FAILED', 'تعذّر إتمام الاستيراد.');
}
export async function handleContentIngestion(request: Request, type: ImportedContentType) {
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
      if (Object.keys(envelope).some(key => key !== 'items') || !Array.isArray(envelope.items) || envelope.items.length < 1 || envelope.items.length > MAX_BATCH_SIZE) throw new HttpError(422, 'INVALID_BATCH', 'استخدم items بمصفوفة من 1 إلى 50 سجلًا.');
      records = envelope.items;
    } else records = [body];
    for (const record of records) if (record && typeof record === 'object' && 'university_slug' in record) requireUniversityScope(record.university_slug, credential.universitySlug);
    const results: IngestResult[] = [];
    for (const [index, record] of records.entries()) results.push(await importContent(type, record, credential, requestId, index));
    const counts = { created: 0, updated: 0, unchanged: 0, rejected: 0, failed: 0 };
    for (const result of results) counts[result.outcome]++;
    return json({ request_id: requestId, resource_type: type, counts, results }, batch ? counts.rejected || counts.failed ? 207 : 200 : counts.failed ? 503 : counts.rejected ? 422 : counts.created ? 201 : 200);
  } catch (error) {
    if (authenticated) { try { await db.ingestionLog.create({ data: { requestId, resourceType: type, outcome: 'failed', errorCode: error instanceof HttpError ? error.code : 'INGESTION_FAILED' } }); } catch { /* redacted failure response */ } }
    return failure(error, requestId);
  }
}
