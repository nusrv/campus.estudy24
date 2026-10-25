import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { bulkActions, bulkResources, BULK_LIMIT, actionLabels, type BulkAction } from '../lib/bulk.ts';
import { administratorAccess, contentPermission, type AdministratorAccess } from './administrator-access.ts';
import { managementQuery } from './management-query.ts';
import { bulkRequestSchema } from './bulk-validation.ts';
import { HttpError } from './security.ts';

type Tx = Prisma.TransactionClient;
type Row = { id: string; universityId?: string | null; status?: string; visible?: boolean; active?: boolean; enabled?: boolean; role?: string; deletedAt?: Date | null; revokedAt?: Date | null; publishedAt?: Date | null; editedFields?: string[]; [key: string]: unknown };
type Stamp = { id: string; revision: string };
const tables: Record<string, string> = { articles: 'Article', 'academic-programs': 'AcademicProgram', platform_posts: 'PlatformPost', events: 'Event', programs: 'Program', links: 'ManagedLink', ads: 'Advertisement', universities: 'University', sources: 'IngestionSource', categories: 'ArticleCategory', administrators: 'Administrator', 'api-keys': 'UniversityApiKey' };
const models: Record<string, string> = { articles: 'article', 'academic-programs': 'academicProgram', platform_posts: 'platformPost', events: 'event', programs: 'program', links: 'managedLink', ads: 'advertisement', universities: 'university', sources: 'ingestionSource', categories: 'articleCategory', administrators: 'administrator', 'api-keys': 'universityApiKey' };
const selectFields: Record<string, string[]> = {
  articles: ['universityId', 'status', 'visible', 'deletedAt', 'updatedAt', 'publishedAt', 'publicationLocked'],
  'academic-programs': ['universityId', 'status', 'visible', 'deletedAt', 'updatedAt'],
  platform_posts: ['status', 'visible', 'deletedAt', 'updatedAt', 'publishedAt'],
  events: ['universityId', 'status', 'visible', 'updatedAt'], programs: ['universityId', 'status', 'visible', 'updatedAt'], links: ['universityId', 'status', 'active', 'updatedAt'],
  ads: ['status', 'updatedAt'], universities: ['enabled', 'updatedAt'], sources: ['key', 'name', 'url', 'universityId', 'enabled', 'autoPublishAcademicPrograms'], categories: ['name', 'slug'],
  administrators: ['email', 'name', 'role', 'active', 'universityId', 'updatedAt'], 'api-keys': ['universityId', 'createdAt', 'revokedAt'],
};
// A small typed adapter keeps generic selection infrastructure independent of resource payloads.
type Delegate = { findMany(args: { where: object; select: object; take?: number; orderBy?: object }): Promise<Row[]>; updateMany(args: { where: object; data: object }): Promise<{ count: number }>; deleteMany(args: { where: object }): Promise<{ count: number }> };
function model(tx: Tx, resource: string) { return (tx as unknown as Record<string, Delegate>)[models[resource]]; }
function scope(actor: AdministratorAccess) { return JSON.stringify([actor.role, actor.universityId]); }
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
function stamp(row: Row): Stamp { return { id: row.id, revision: createHash('sha256').update(JSON.stringify(row)).digest('hex') }; }
function denied() { throw new HttpError(403, 'FORBIDDEN', 'الإجراء غير متاح لهذا الحساب أو لهذا القسم.'); }
function stale() { throw new HttpError(409, 'STALE_SELECTION', 'تغيّرت السجلات المحددة أو نطاقها. لم تُنفّذ أي تغييرات. امسح التحديد وحدّث القائمة وأعد المراجعة.'); }
function permit(actor: AdministratorAccess, resource: string, action?: BulkAction) {
  if (!(bulkResources as readonly string[]).includes(resource) || !bulkActions(resource, actor.role).length) denied();
  if (action && !bulkActions(resource, actor.role).includes(action)) denied();
  if (!['administrators', 'api-keys'].includes(resource)) contentPermission(actor, resource, action === 'delete' ? 'delete' : action ? 'write' : 'read');
}
async function rows(tx: Tx, resource: string, where: object) {
  return model(tx, resource).findMany({ where, select: Object.fromEntries(['id', ...selectFields[resource]].map(key => [key, true])), orderBy: { id: 'asc' }, take: BULK_LIMIT + 1 });
}
async function capture(tx: Tx, actor: AdministratorAccess, sessionId: string, resource: string, filters: Record<string, string>, ids?: string[]) {
  const query = managementQuery(resource, new URLSearchParams(filters), actor);
  const found = await rows(tx, resource, { AND: [query.where, ...(ids ? [{ id: { in: ids } }] : [])] });
  if (ids && found.length !== ids.length) stale();
  if (!found.length) throw new HttpError(409, 'EMPTY_SELECTION', 'لا توجد سجلات متاحة ضمن هذا التحديد.');
  if (found.length > BULK_LIMIT) throw new HttpError(422, 'SELECTION_LIMIT', `الحد الأقصى ${BULK_LIMIT} سجل للعملية الواحدة. ضيّق عوامل التصفية.`);
  return tx.adminBulkSelection.create({ data: { administratorId: actor.id, sessionId, resource, actorScope: scope(actor), filters: query.filters, records: json(found.map(stamp)), count: found.length, expiresAt: new Date(Date.now() + 30 * 60000) } });
}
async function selection(tx: Tx, token: string, actor: AdministratorAccess, sessionId: string, resource: string, completed = false) {
  const s = await tx.adminBulkSelection.findFirst({ where: { id: token, administratorId: actor.id, sessionId, resource } });
  if (!s || s.actorScope !== scope(actor)) throw new HttpError(404, 'SELECTION_NOT_FOUND', 'التحديد غير متاح لهذه الجلسة. أعد التحديد.');
  if (!completed && s.expiresAt <= new Date()) throw new HttpError(409, 'SELECTION_EXPIRED', 'انتهت صلاحية التحديد. أعد تحديد السجلات.');
  return s;
}
async function check(tx: Tx, actor: AdministratorAccess, resource: string, filters: Prisma.JsonValue, records: Stamp[]) {
  const query = managementQuery(resource, new URLSearchParams(filters as Record<string, string>), actor);
  const current = await rows(tx, resource, { AND: [query.where, { id: { in: records.map(r => r.id) } }] });
  if (current.length !== records.length) stale();
  const revisions = new Map(records.map(r => [r.id, r.revision]));
  if (current.some(row => revisions.get(row.id) !== stamp(row).revision)) stale();
  return current;
}
async function eligible(tx: Tx, actor: AdministratorAccess, resource: string, action: BulkAction, selected: Row[]) {
  if (['restore'].includes(action) ? selected.some(r => !r.deletedAt) : action !== 'delete' && selected.some(r => r.deletedAt)) throw new HttpError(409, 'INELIGIBLE_SELECTION', 'اختر سجلات متوافقة مع الإجراء: استعد المحذوفات أولًا، والاستعادة للمحذوفات فقط. لم يُغيّر أي سجل.');
  if (action === 'delete' && selected.some(r => r.deletedAt)) throw new HttpError(409, 'INELIGIBLE_SELECTION', 'السجلات محذوفة بالفعل. الاستعادة هي الإجراء المتاح للمحذوفات.');
  if (resource === 'administrators') {
    if (action === 'disable' && selected.some(r => r.id === actor.id)) throw new HttpError(409, 'SELF_PROTECTION', 'استبعد حسابك من عملية التعطيل. لم يُعطّل أي حساب.');
    if (action === 'disable' && !await tx.administrator.count({ where: { active: true, role: 'owner', id: { notIn: selected.map(r => r.id) } } })) throw new HttpError(409, 'LAST_OWNER', 'يجب الإبقاء على مدير منصة نشط واحد على الأقل.');
    if (action === 'enable') {
      const universities = [...new Set(selected.filter(r => r.role === 'ambassador').map(r => r.universityId).filter((v): v is string => !!v))];
      if (await tx.university.count({ where: { id: { in: universities }, enabled: true } }) !== universities.length || selected.some(r => r.role === 'ambassador' && !r.universityId)) throw new HttpError(409, 'INVALID_ASSIGNMENT', 'يتطلب تفعيل السفير جامعة مفعّلة وموجودة.');
    }
  }
  if (resource === 'api-keys' && selected.some(r => r.revokedAt)) throw new HttpError(409, 'INELIGIBLE_SELECTION', 'اختر المفاتيح النشطة فقط.');
  if (resource === 'categories') {
    const ids = selected.map(r => r.id);
    if (await tx.article.count({ where: { categoryId: { in: ids } } }) || await tx.platformPost.count({ where: { categoryId: { in: ids } } })) throw new HttpError(409, 'CATEGORY_IN_USE', 'لا يمكن حذف تصنيفات مرتبطة بمحتوى. لم يُحذف أي تصنيف.');
  }
}
function change(resource: string, action: BulkAction, now: Date): Record<string, unknown> {
  if (action === 'publish') return { status: 'published', ...(resource === 'links' ? { active: true } : { visible: true }) };
  if (action === 'unpublish') return { status: 'unpublished' };
  if (action === 'hide') return { status: 'hidden', ...(resource === 'links' ? { active: false } : { visible: false }) };
  if (action === 'restore') return { deletedAt: null };
  if (action === 'delete' && ['articles', 'academic-programs', 'platform_posts'].includes(resource)) return { deletedAt: now };
  if (action === 'enable' || action === 'disable') return { [['universities', 'sources'].includes(resource) ? 'enabled' : 'active']: action === 'enable' };
  if (action === 'activate' || action === 'pause' || action === 'archive') return { status: { activate: 'active', pause: 'paused', archive: 'archived' }[action] };
  if (action === 'revoke') return { revokedAt: now };
  return {};
}
async function mutate(tx: Tx, actor: AdministratorAccess, resource: string, action: BulkAction, selected: Row[], operationId: string) {
  const ids = selected.map(r => r.id), now = new Date(), fields = change(resource, action, now);
  const hardDelete = action === 'delete' && !['articles', 'academic-programs', 'platform_posts'].includes(resource);
  if (['links', 'events', 'programs'].includes(resource)) {
    const syncs = await tx.contentSync.findMany({ where: { recordId: { in: ids }, contentType: { in: resource === 'events' ? ['events', 'calendar'] : [resource] } } });
    if (hardDelete) await tx.contentSync.updateMany({ where: { id: { in: syncs.map(row => row.id) } }, data: { deletedAt: now } });
    else {
      const groups = new Map<string, string[]>();
      for (const sync of syncs) { const key = JSON.stringify([...new Set([...sync.editedFields, ...Object.keys(fields)])].sort()); groups.set(key, [...(groups.get(key) || []), sync.id]); }
      for (const [key, group] of groups) await tx.contentSync.updateMany({ where: { id: { in: group } }, data: { editedFields: JSON.parse(key) as string[] } });
    }
  }
  if (resource === 'articles') {
    fields.publicationLocked = true;
    if (action === 'publish') await tx.article.updateMany({ where: { id: { in: ids }, status: { not: 'published' } }, data: { publishedAt: now } });
    await tx.articleEdit.createMany({ data: selected.map(before => ({ articleId: before.id, administratorId: actor.id, before: json(before), after: json({ ...before, ...fields, ...(action === 'publish' && before.status !== 'published' && { publishedAt: now }), bulkOperationId: operationId }) })) });
  }
  if (resource === 'platform_posts' && action === 'publish') await tx.platformPost.updateMany({ where: { id: { in: ids }, publishedAt: null }, data: { publishedAt: now } });
  const changed = selected.filter(row => hardDelete || Object.entries(fields).some(([key, value]) => JSON.stringify(row[key]) !== JSON.stringify(value)) || action === 'publish' && (resource === 'articles' && row.status !== 'published' || resource === 'platform_posts' && !row.publishedAt)).length;
  const result = hardDelete ? await model(tx, resource).deleteMany({ where: { id: { in: ids } } }) : await model(tx, resource).updateMany({ where: { id: { in: ids } }, data: fields });
  if (result.count !== ids.length) stale();
  if (resource === 'administrators') {
    const revoked = action === 'disable' ? ids : selected.filter(row => !row.active).map(row => row.id);
    await tx.adminSession.deleteMany({ where: { administratorId: { in: revoked } } });
    await tx.adminPasswordReset.deleteMany({ where: { administratorId: { in: revoked } } });
  }
  if (resource === 'universities' && action === 'disable') {
    const where = { administrator: { role: 'ambassador' as const, universityId: { in: ids } } };
    await tx.adminSession.deleteMany({ where }); await tx.adminPasswordReset.deleteMany({ where });
  }
  await tx.auditLog.createMany({ data: selected.map(before => ({ administratorId: actor.id, action: `bulk_${action}`, entity: resource, entityId: before.id, details: json({ operationId, actorId: actor.id, universityId: before.universityId || (resource === 'universities' ? before.id : null), before, changes: hardDelete ? { deleted: true } : fields }) })) });
  return { operation_id: operationId, action, affected_count: ids.length, changed_count: changed, unchanged_count: ids.length - changed, failed_count: 0 };
}
export async function bulkOperation(db: PrismaClient, resource: string, input: unknown, administratorId: string, sessionId: string) {
  const body = bulkRequestSchema.parse(input);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const actor = await administratorAccess(tx, administratorId, body.op === 'execute', sessionId);
        permit(actor, resource, body.op === 'preview' ? body.action : undefined);
        if (body.op === 'snapshot') {
          await tx.adminBulkSelection.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400000) } } });
          const s = await capture(tx, actor, sessionId, resource, body.filters);
          return { token: s.id, count: s.count, expires_at: s.expiresAt, captured_at: s.createdAt };
        }
        if (body.op === 'membership') {
          const s = await selection(tx, body.token, actor, sessionId, resource);
          const query = managementQuery(resource, new URLSearchParams(s.filters as Record<string, string>), actor);
          const authorized = await rows(tx, resource, { AND: [query.where, { id: { in: body.ids } }] });
          if (authorized.length !== body.ids.length) stale();
          const original = new Set((s.records as unknown as Stamp[]).map(r => r.id));
          return { ids: body.ids.filter(id => original.has(id)), count: s.count };
        }
        if (body.op === 'preview') {
          const s = body.selection.mode === 'ids' ? await capture(tx, actor, sessionId, resource, body.selection.filters, body.selection.ids) : await selection(tx, body.selection.token, actor, sessionId, resource);
          const all = s.records as unknown as Stamp[], excluded = body.selection.mode === 'all' ? body.selection.excluded : [];
          const originalIds = new Set(all.map(record => record.id)), excludedIds = new Set(excluded);
          if (excluded.some(id => !originalIds.has(id))) throw new HttpError(422, 'INVALID_EXCLUSION', 'الاستثناء لا ينتمي إلى التحديد الأصلي.');
          const records = all.filter(r => !excludedIds.has(r.id));
          if (!records.length) throw new HttpError(409, 'EMPTY_SELECTION', 'لا توجد سجلات محددة.');
          const current = await check(tx, actor, resource, s.filters, records); await eligible(tx, actor, resource, body.action, current);
          const confirmation = await tx.adminBulkConfirmation.create({ data: { selectionId: s.id, action: body.action, records: json(records), count: records.length, expiresAt: new Date(Math.min(s.expiresAt.getTime(), Date.now() + 10 * 60000)) } });
          const university = (s.filters as Record<string, string>).university;
          const universityIds = [...new Set(current.map(row => row.universityId || (resource === 'universities' ? row.id : null)).filter((value): value is string => !!value))];
          const names = await tx.university.findMany({ where: { id: { in: universityIds } }, select: { name: true }, take: 4 });
          const universityName = university ? (await tx.university.findUnique({ where: { slug: university }, select: { name: true } }))?.name : actor.university?.name || (universityIds.length > 3 ? `${universityIds.length} جامعات` : names.map(row => row.name).join('، '));
          return { token: confirmation.id, count: records.length, action: body.action, expires_at: confirmation.expiresAt, scope: universityName || (resource === 'platform_posts' ? 'محتوى eStudy24 العام' : 'السجلات المصرّح بها في هذا القسم'), confirmation: `${actionLabels[body.action]} ${records.length}`, security: ['administrators', 'api-keys', 'universities', 'sources'].includes(resource), irreversible: body.action === 'revoke' || body.action === 'delete' && !['articles', 'academic-programs', 'platform_posts'].includes(resource) };
        }
        await tx.$queryRaw`SELECT "id" FROM "AdminBulkConfirmation" WHERE "id" = ${body.token} FOR UPDATE`;
        const confirmation = await tx.adminBulkConfirmation.findUnique({ where: { id: body.token } });
        if (!confirmation) throw new HttpError(404, 'NOT_FOUND', 'طلب التأكيد غير موجود.');
        const s = await selection(tx, confirmation.selectionId, actor, sessionId, resource, !!confirmation.completedAt);
        const action = confirmation.action as BulkAction; permit(actor, resource, action);
        if (body.confirmation !== `${actionLabels[action]} ${confirmation.count}`) throw new HttpError(422, 'CONFIRMATION_REQUIRED', 'نص التأكيد لا يطابق الإجراء والعدد المعروضين.');
        if (confirmation.completedAt) return confirmation.result;
        if (confirmation.expiresAt <= new Date()) throw new HttpError(409, 'CONFIRMATION_EXPIRED', 'انتهت مهلة التأكيد. أعد مراجعة التحديد.');
        const records = confirmation.records as unknown as Stamp[], ids = records.map(r => r.id).sort();
        if (resource === 'api-keys') { const slug = (s.filters as Record<string, string>).university; await tx.$queryRaw`SELECT "id" FROM "University" WHERE "slug" = ${slug} FOR UPDATE`; }
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM ${Prisma.raw('"' + tables[resource] + '"')} WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`);
        const current = await check(tx, actor, resource, s.filters, records); await eligible(tx, actor, resource, action, current);
        const result = await mutate(tx, actor, resource, action, current, confirmation.id);
        await tx.adminBulkConfirmation.update({ where: { id: confirmation.id }, data: { completedAt: new Date(), result } });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000, maxWait: 10000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) { if (attempt < 2) continue; throw new HttpError(409, 'CONCURRENT_UPDATE', 'تحديث متزامن منع العملية. لم يتم تنفيذ تغييرات جزئية. حدّث القائمة وحاول مجددًا.'); }
      throw error;
    }
  }
  throw new HttpError(503, 'BULK_FAILED', 'تعذّر إتمام العملية.');
}
