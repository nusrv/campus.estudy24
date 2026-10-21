import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./security";
import { adSchema, articlePatchSchema, articleSchema, categorySchema, eventSchema, linkSchema, pagination, platformPostActionSchema, platformPostSchema, programSchema, sourceSchema, universitySchema } from "./validation";
import { changedEditorialFields } from "./ingestion-policy";
import { bulkArticleDeleteSchema } from './bulk-article-validation';

export const RESOURCES = ["universities", "articles", "platform_posts", "ads", "links", "events", "programs", "sources", "categories", "logs", "audit"] as const;
export type Resource = typeof RESOURCES[number];
export function resourceName(value: string): Resource {
  if (!(RESOURCES as readonly string[]).includes(value)) throw new HttpError(404, "NOT_FOUND", "Unknown resource.");
  return value as Resource;
}
function snapshot(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)); }
const dateOrNull = (value?: string | null) => value ? new Date(value) : null;
async function protectSyncedFields(tx: Prisma.TransactionClient, resource: string, recordId: string | undefined, data: Record<string, unknown>) {
  if (!recordId) return;
  const types = resource === 'events' ? ['events', 'calendar'] : [resource];
  const sync = await tx.contentSync.findFirst({ where: { recordId, contentType: { in: types } } });
  if (!sync) return;
  const before = resource === 'links' ? await tx.managedLink.findUniqueOrThrow({ where: { id: recordId } }) : resource === 'programs' ? await tx.program.findUniqueOrThrow({ where: { id: recordId } }) : await tx.event.findUniqueOrThrow({ where: { id: recordId } });
  if ('universityId' in data && data.universityId !== before.universityId) throw new HttpError(422, 'IMMUTABLE_SOURCE', 'لا يمكن نقل المحتوى المستورد إلى جامعة أخرى.');
  const old = before as unknown as Record<string, unknown>;
  const edited = Object.keys(data).filter(field => JSON.stringify(old[field]) !== JSON.stringify(data[field]));
  await tx.contentSync.update({ where: { id: sync.id }, data: { editedFields: [...new Set([...sync.editedFields, ...edited])] } });
}

export async function adminList(resource: Resource, search: URLSearchParams) {
  const p = pagination(search);
  const args = { skip: p.skip, take: p.take };
  const textSearch = p.search ? { contains: p.search, mode: "insensitive" as const } : undefined;
  let items: unknown[];
  let total: number;
  switch (resource) {
    case "platform_posts": {
      const where: Prisma.PlatformPostWhereInput = { deletedAt: p.deleted === "true" ? { not: null } : null, ...(textSearch && { title: textSearch }), ...(p.status && { status: p.status }), ...(p.type && { type: p.type }), ...(p.category && { category: { slug: p.category } }) };
      [items, total] = await Promise.all([db.platformPost.findMany({ where, ...args, orderBy: { updatedAt: "desc" }, include: { category: true } }), db.platformPost.count({ where })]); break;
    }
    case "articles": {
      const where: Prisma.ArticleWhereInput = { deletedAt: p.deleted === "true" ? { not: null } : null, ...(p.status && { status: p.status }), ...(p.university && { university: { slug: p.university } }), ...(p.category && { category: { slug: p.category } }), ...(textSearch && { title: textSearch }), ...((p.from || p.to) && { discoveredAt: { ...(p.from && { gte: new Date(p.from) }), ...(p.to && { lte: new Date(p.to) }) } }) };
      [items, total] = await Promise.all([db.article.findMany({ where, ...args, orderBy: [{ discoveredAt: "desc" }, { id: "desc" }], include: { university: true, category: true } }), db.article.count({ where })]); break;
    }
    case "universities": {
      const where = textSearch ? { name: textSearch } : {};
      [items, total] = await Promise.all([db.university.findMany({ where, ...args, orderBy: { name: "asc" } }), db.university.count({ where })]); break;
    }
    case "ads": {
      const where = textSearch ? { title: textSearch } : {};
      const records = await db.advertisement.findMany({ where, ...args, orderBy: { createdAt: "desc" }, include: { universities: true, placement: true, placementAssignments: true, metrics: { where: { day: { gte: new Date(Date.now() - 30 * 86400000) } } } } });
      items = records.map(a => ({ ...a, universityIds: a.universities.map(u => u.universityId), placementIds: a.placementAssignments.length ? a.placementAssignments.map(p => p.placementId) : [a.placementId] })); total = await db.advertisement.count({ where }); break;
    }
    case "links": {
      const where = textSearch ? { title: textSearch } : {};
      [items, total] = await Promise.all([db.managedLink.findMany({ where, ...args, orderBy: { displayOrder: "asc" } }), db.managedLink.count({ where })]); break;
    }
    case "events": {
      const where = textSearch ? { title: textSearch } : {};
      [items, total] = await Promise.all([db.event.findMany({ where, ...args, orderBy: { startsAt: "desc" } }), db.event.count({ where })]); break;
    }
    case "programs": {
      const where = textSearch ? { title: textSearch } : {};
      [items, total] = await Promise.all([db.program.findMany({ where, ...args, orderBy: { startsAt: "desc" } }), db.program.count({ where })]); break;
    }
    case "sources": [items, total] = await Promise.all([db.ingestionSource.findMany({ ...args, orderBy: { name: "asc" }, include: { university: true } }), db.ingestionSource.count()]); break;
    case "categories": [items, total] = await Promise.all([db.articleCategory.findMany({ ...args, orderBy: { name: "asc" } }), db.articleCategory.count()]); break;
    case "logs": [items, total] = await Promise.all([db.ingestionLog.findMany({ ...args, orderBy: { createdAt: "desc" }, include: { source: { select: { name: true } } } }), db.ingestionLog.count()]); break;
    case "audit": [items, total] = await Promise.all([db.auditLog.findMany({ ...args, orderBy: { createdAt: "desc" }, include: { administrator: { select: { name: true } } } }), db.auditLog.count()]); break;
  }
  return { items, total, page: p.page, page_size: p.take, pages: Math.ceil(total / p.take) };
}

export async function articleDetails(id: string) {
  const item = await db.article.findUnique({ where: { id }, include: { university: true, category: true, media: { orderBy: { sortOrder: "asc" } }, registrationLinks: true, edits: { orderBy: { createdAt: "desc" }, take: 20, include: { administrator: { select: { name: true } } } } } });
  if (!item) throw new HttpError(404, "NOT_FOUND", "Article not found.");
  return { ...item, imageUrls: item.media.filter(m => m.kind === "image").map(m => m.url), pdfUrls: item.media.filter(m => m.kind === "pdf").map(m => m.url), registrationLinks: item.registrationLinks.map(m => m.url) };
}

export async function saveResource(resource: Resource, raw: unknown, administratorId: string, recordId?: string, transaction?: Prisma.TransactionClient) {
  const save = async (tx: Prisma.TransactionClient) => {
    let item: { id: string };
    if (resource === "platform_posts") {
      const old = recordId ? await tx.platformPost.findUniqueOrThrow({ where: { id: recordId } }) : null;
      if (raw && typeof raw === "object" && "action" in raw) {
        platformPostActionSchema.parse(raw);
        if (!recordId) throw new HttpError(422, "RECORD_REQUIRED", "Restoration requires an existing record.");
        item = await tx.platformPost.update({ where: { id: recordId }, data: { deletedAt: null } });
      } else {
        const data = platformPostSchema.parse(raw);
        const publishedAt = data.status === "published" ? old?.publishedAt || new Date() : old?.publishedAt || null;
        item = recordId ? await tx.platformPost.update({ where: { id: recordId }, data: { ...data, publishedAt } }) : await tx.platformPost.create({ data: { ...data, publishedAt } });
      }
      await tx.auditLog.create({ data: { administratorId, entity: resource, entityId: item.id, action: "editorial_snapshot", details: snapshot({ before: old, after: item }) } });
    } else if (resource === "articles") {
      const parsed = recordId ? articlePatchSchema.parse(raw) : articleSchema.parse(raw);
      const { imageUrls, pdfUrls, registrationLinks, originalPublishedAt, ...fields } = parsed;
      const action = "action" in fields ? fields.action : undefined;
      const clean = { ...fields };
      delete (clean as { action?: string }).action;
      const old = recordId ? await tx.article.findUnique({ where: { id: recordId }, include: { media: true, registrationLinks: true } }) : null;
      if (recordId && !old) throw new HttpError(404, "NOT_FOUND", "Article not found.");
      if (recordId && old) {
        // An imported article's source association is immutable; editorial fields remain editable.
        if (old.origin === "imported" && clean.universityId && clean.universityId !== old.universityId) throw new HttpError(422, "IMMUTABLE_SOURCE", "An imported article cannot change university.");
        const incoming = { ...clean, ...(originalPublishedAt !== undefined && { originalPublishedAt: dateOrNull(originalPublishedAt) }), ...(imageUrls !== undefined || pdfUrls !== undefined ? { media: [...(imageUrls || old.media.filter(m => m.kind === "image").map(m => m.url)), ...(pdfUrls || old.media.filter(m => m.kind === "pdf").map(m => m.url))].sort() } : {}), ...(registrationLinks !== undefined && { registrationLinks: [...registrationLinks].sort() }) };
        const before = { ...old, media: old.media.map(m => m.url).sort(), registrationLinks: old.registrationLinks.map(m => m.url).sort() };
        const { media: _media, registrationLinks: _registration, ...scalar } = incoming;
        item = await tx.article.update({ where: { id: recordId }, data: { ...scalar, publicationLocked: true, editedFields: changedEditorialFields(before, incoming, old.editedFields), ...(clean.status === "published" && old.status !== "published" && { publishedAt: new Date() }), ...(action === "soft_delete" && { deletedAt: new Date() }), ...(action === "restore" && { deletedAt: null }) } });
        if (imageUrls !== undefined || pdfUrls !== undefined) {
          await tx.articleMedia.deleteMany({ where: { articleId: recordId } });
          const images = imageUrls || old.media.filter(m => m.kind === "image").map(m => m.url);
          const pdfs = pdfUrls || old.media.filter(m => m.kind === "pdf").map(m => m.url);
          const media = [...images.map(url => ({ url, kind: "image" as const })), ...pdfs.map(url => ({ url, kind: "pdf" as const }))];
          if (media.length) await tx.articleMedia.createMany({ data: media.map((m, sortOrder) => ({ ...m, sortOrder, articleId: recordId, attribution: clean.sourceUrl || old.sourceUrl || "administrator_provided", usage: m.url.startsWith("/media/") ? "administrator_upload" : "external_reference_only" })), skipDuplicates: true });
        }
        if (registrationLinks !== undefined) {
          await tx.articleRegistrationLink.deleteMany({ where: { articleId: recordId } });
          if (registrationLinks.length) await tx.articleRegistrationLink.createMany({ data: registrationLinks.map(url => ({ articleId: recordId, url })), skipDuplicates: true });
        }
        await tx.articleEdit.create({ data: { articleId: recordId, administratorId, before: snapshot(old), after: snapshot({ ...item, imageUrls, pdfUrls, registrationLinks }) } });
      } else {
        const value = articleSchema.parse(raw);
        const { imageUrls: images, pdfUrls: pdfs, registrationLinks: registrations, originalPublishedAt: originalDate, ...data } = value;
        item = await tx.article.create({ data: { ...data, originalPublishedAt: dateOrNull(originalDate), origin: "manual", publishedAt: data.status === "published" ? new Date() : null, media: { create: [...images.map(url => ({ url, kind: "image" as const })), ...pdfs.map(url => ({ url, kind: "pdf" as const }))].map((m, sortOrder) => ({ ...m, sortOrder, attribution: data.sourceUrl || "administrator_provided", usage: m.url.startsWith("/media/") ? "administrator_upload" : "external_reference_only" })) }, registrationLinks: { create: [...new Set(registrations)].map(url => ({ url })) } } });
      }
    } else if (resource === "universities") {
      const data = universitySchema.parse(raw);
      item = recordId ? await tx.university.update({ where: { id: recordId }, data }) : await tx.university.create({ data });
    } else if (resource === "ads") {
      const { universityIds, placementIds, startsAt, endsAt, ...fields } = adSchema.parse(raw);
      const data = { ...fields, startsAt: dateOrNull(startsAt), endsAt: dateOrNull(endsAt) };
      if (recordId) {
        item = await tx.advertisement.update({ where: { id: recordId }, data });
        await tx.advertisementUniversity.deleteMany({ where: { advertisementId: recordId } });
      } else item = await tx.advertisement.create({ data });
      await tx.advertisementPlacementAssignment.deleteMany({ where: { advertisementId: item.id } });
      await tx.advertisementPlacementAssignment.createMany({ data: placementIds.map(placementId => ({ advertisementId: item.id, placementId })) });
      if (!data.global) await tx.advertisementUniversity.createMany({ data: [...new Set(universityIds)].map(universityId => ({ universityId, advertisementId: item.id })) });
    } else if (resource === "links") {
      const data = linkSchema.parse(raw);
      await protectSyncedFields(tx, resource, recordId, data);
      item = recordId ? await tx.managedLink.update({ where: { id: recordId }, data }) : await tx.managedLink.create({ data });
    } else if (resource === "events") {
      const parsed = eventSchema.parse(raw);
      const data = { ...parsed, startsAt: new Date(parsed.startsAt), endsAt: dateOrNull(parsed.endsAt) };
      await protectSyncedFields(tx, resource, recordId, data);
      item = recordId ? await tx.event.update({ where: { id: recordId }, data }) : await tx.event.create({ data });
    } else if (resource === "programs") {
      const parsed = programSchema.parse(raw);
      const data = { ...parsed, startsAt: new Date(parsed.startsAt), endsAt: dateOrNull(parsed.endsAt) };
      await protectSyncedFields(tx, resource, recordId, data);
      item = recordId ? await tx.program.update({ where: { id: recordId }, data }) : await tx.program.create({ data });
    } else if (resource === "sources") {
      const data = sourceSchema.parse(raw);
      if (recordId) {
        const old = await tx.ingestionSource.findUnique({ where: { id: recordId }, include: { _count: { select: { articles: true, contentSyncs: true } } } });
        if (old && (old._count.articles || old._count.contentSyncs) && (old.key !== data.key || old.universityId !== data.universityId)) throw new HttpError(409, "SOURCE_IN_USE", "Source identity cannot change after ingestion.");
      }
      item = recordId ? await tx.ingestionSource.update({ where: { id: recordId }, data }) : await tx.ingestionSource.create({ data });
    } else if (resource === "categories") {
      const data = categorySchema.parse(raw);
      item = recordId ? await tx.articleCategory.update({ where: { id: recordId }, data }) : await tx.articleCategory.create({ data });
    } else throw new HttpError(405, "READ_ONLY", "This resource is read-only.");
    await tx.auditLog.create({ data: { administratorId, action: recordId ? "update" : "create", entity: resource, entityId: item.id, details: { fields: Object.keys(raw as object) } } });
    return item;
  };
  return transaction ? save(transaction) : db.$transaction(save, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
}

export async function bulkDeleteArticles(raw: unknown, administratorId: string) {
  const { ids } = bulkArticleDeleteSchema.parse(raw);
  const ordered = [...ids].sort();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const actor = await tx.administrator.findUnique({ where: { id: administratorId } });
        if (!actor?.active || actor.role !== 'owner') throw new HttpError(403, 'FORBIDDEN', 'حذف الأخبار متاح للمالك فقط.');
        const count = await tx.article.count({ where: { id: { in: ordered }, deletedAt: null } });
        if (count !== ordered.length) throw new HttpError(409, 'STALE_SELECTION', 'تغيّر التحديد أو حُذف أحد الأخبار مسبقًا. لم يُحذف أي خبر من هذا الطلب. حدّث القائمة وأعد التحديد.');
        // The identical individual-delete path, all inside one transaction: any error rolls back every row and audit entry.
        for (const id of ordered) await saveResource('articles', { action: 'soft_delete' }, administratorId, id, tx);
        return { ids, deleted_count: ids.length };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        if (attempt < 2) continue;
        throw new HttpError(409, 'CONCURRENT_UPDATE', 'تعذّر الحذف بسبب تحديث متزامن. لم يُحذف أي خبر من هذا الطلب. حدّث القائمة وحاول مجددًا.');
      }
      throw error;
    }
  }
  throw new HttpError(503, 'DELETE_FAILED', 'تعذّر إتمام عملية الحذف.');
}

export async function deleteResource(resource: Resource, id: string, administratorId: string) {
  if (resource === "articles") return saveResource(resource, { action: "soft_delete" }, administratorId, id);
  return db.$transaction(async tx => {
    if (['links', 'events', 'programs'].includes(resource)) await tx.contentSync.updateMany({ where: { recordId: id, contentType: { in: resource === 'events' ? ['events', 'calendar'] : [resource] } }, data: { deletedAt: new Date() } });
    switch (resource) {
      case "platform_posts": await tx.platformPost.update({ where: { id }, data: { deletedAt: new Date() } }); break;
      case "ads": await tx.advertisement.delete({ where: { id } }); break;
      case "links": await tx.managedLink.delete({ where: { id } }); break;
      case "events": await tx.event.delete({ where: { id } }); break;
      case "programs": await tx.program.delete({ where: { id } }); break;
      // Universities and sources are disabled instead of deleted, preserving provenance.
      case "universities": await tx.university.update({ where: { id }, data: { enabled: false } }); break;
      case "sources": await tx.ingestionSource.update({ where: { id }, data: { enabled: false } }); break;
      default: throw new HttpError(405, "DELETE_NOT_SUPPORTED", "Deletion is not available for this resource.");
    }
    await tx.auditLog.create({ data: { administratorId, action: ["universities", "sources"].includes(resource) ? "disable" : "delete", entity: resource, entityId: id } });
    return { id };
  });
}
