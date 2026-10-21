import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./security";
import { eventKind, linkKind, pagination } from "./validation";
import { publicAds } from "./advertisements";
export { activeAdsWhere } from "./advertisements";

export const publishedArticleWhere: Prisma.ArticleWhereInput = { status: "published", visible: true, deletedAt: null, university: { enabled: true } };
export const articlePublicSelect = { id: true, title: true, summary: true, description: true, content: true, sourceUrl: true, originalPublishedAt: true, publishedAt: true, university: { select: { id: true, name: true, slug: true, logoUrl: true } }, category: { select: { id: true, name: true, slug: true } }, media: { select: { kind: true, url: true, attribution: true, usage: true, sortOrder: true }, orderBy: { sortOrder: "asc" as const } }, registrationLinks: { select: { url: true } } } satisfies Prisma.ArticleSelect;

export async function publicList(resource: string, search: URLSearchParams) {
  const p = pagination(search);
  if (p.scope === "homepage" && ["news", "events", "programs"].includes(resource)) throw new HttpError(422, "INVALID_SCOPE", "University content is not homepage content. Use /api/content.");
  if (p.scope === "university" && !p.university && ["news", "events", "programs", "links"].includes(resource)) throw new HttpError(422, "UNIVERSITY_REQUIRED", "A university slug is required.");
  if (p.scope === "homepage" && p.university) throw new HttpError(422, "INVALID_SCOPE", "Homepage requests cannot target a university.");
  const args = { skip: p.skip, take: p.take };
  let items: unknown[];
  let total: number;
  if (resource === "universities") {
    const where: Prisma.UniversityWhereInput = { enabled: true, ...(p.university && { slug: p.university }), ...(p.region && { region: p.region }), ...(p.search && { OR: [{ name: { contains: p.search, mode: "insensitive" } }, { city: { contains: p.search, mode: "insensitive" } }] }) };
    [items, total] = await Promise.all([db.university.findMany({ where, ...args, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, description: true, city: true, region: true, logoUrl: true, websiteUrl: true, telegramCommunityUrl: true } }), db.university.count({ where })]);
  } else if (resource === "news") {
    if (p.scope === "homepage") throw new HttpError(422, "INVALID_SCOPE", "University news is not homepage content. Use /api/content.");
    const where: Prisma.ArticleWhereInput = { ...publishedArticleWhere, ...(p.university && { university: { enabled: true, slug: p.university } }), ...(p.category && { category: { slug: p.category } }), ...(p.search && { title: { contains: p.search, mode: "insensitive" } }), ...((p.from || p.to) && { publishedAt: { ...(p.from && { gte: new Date(p.from) }), ...(p.to && { lte: new Date(p.to) }) } }) };
    const { content: _content, ...previewSelect } = articlePublicSelect;
    [items, total] = await Promise.all([db.article.findMany({ where, ...args, select: previewSelect, orderBy: [{ publishedAt: "desc" }, { id: "desc" }] }), db.article.count({ where })]);
  } else if (resource === "events" || resource === "programs") {
    const where = { status: "published" as const, visible: true, university: { enabled: true, ...(p.university && { slug: p.university }) }, ...((p.from || p.to) && { startsAt: { ...(p.from && { gte: new Date(p.from) }), ...(p.to && { lte: new Date(p.to) }) } }) };
    const select = { id: true, title: true, description: true, startsAt: true, endsAt: true, applicationUrl: true, sourceUrl: true, university: { select: { id: true, name: true, slug: true } } };
    if (resource === "events") { const eventsWhere = { ...where, ...(p.kind && { kind: eventKind.parse(p.kind) }) }; [items, total] = await Promise.all([db.event.findMany({ where: eventsWhere, ...args, select: { ...select, kind: true }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }), db.event.count({ where: eventsWhere })]); }
    else [items, total] = await Promise.all([db.program.findMany({ where, ...args, select, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }), db.program.count({ where })]);
  } else if (resource === "ads") {
    if (p.scope === "university" && !p.university) throw new HttpError(422, "UNIVERSITY_REQUIRED", "A university slug is required.");
    if (p.scope === "homepage" && p.university) throw new HttpError(422, "INVALID_SCOPE", "Homepage requests cannot target a university.");
    const ads = await publicAds({ university: p.university, placement: p.placement, skip: p.skip, take: p.take }); items = ads.items; total = ads.total;
  } else if (resource === "links") {
    const where: Prisma.ManagedLinkWhereInput = { active: true, status: "published", ...(p.category && { category: p.category }), ...(p.kind && { kind: linkKind.parse(p.kind) }), ...(p.university ? { university: { enabled: true, slug: p.university } } : { universityId: null }) };
    [items, total] = await Promise.all([db.managedLink.findMany({ where, ...args, orderBy: [{ displayOrder: "asc" }, { id: "asc" }], select: { id: true, title: true, description: true, destinationUrl: true, sourceUrl: true, imageUrl: true, icon: true, category: true, kind: true, university: { select: { id: true, name: true, slug: true } } } }), db.managedLink.count({ where })]);
  } else throw new Error("Unknown public resource.");
  return { items, total, page: p.page, page_size: p.take, pages: Math.ceil(total / p.take) };
}
