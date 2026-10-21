import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { dateRange } from "../lib/portal";
import { platformVisibility, universityContentScope } from "./content-policy";
import { articlePublicSelect, publishedArticleWhere } from "./public-data";
import { platformPreviewSelect } from "./platform-data";
import { eventKind, linkKind, platformType, slug as slugSchema } from "./validation";

export type PublicQuery = Record<string, string | string[] | undefined>;
export function searchFromQuery(query: PublicQuery) {
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const search = new URLSearchParams();
  const page = Number(value("page"));
  search.set("page", Number.isInteger(page) && page > 0 && page <= 100000 ? String(page) : "1");
  search.set("page_size", "12");
  if (value("search").trim()) search.set("search", value("search").trim().slice(0, 200));
  if (value("region")) search.set("region", value("region").slice(0, 100));
  if (slugSchema.safeParse(value("category")).success) search.set("category", value("category"));
  if (platformType.safeParse(value("type")).success) search.set("type", value("type"));
  for (const [key, item] of Object.entries(dateRange(value("from"), value("to")))) search.set(key, item);
  return search;
}
export async function homepageContent() {
  const featured = await db.platformPost.findFirst({ where: { ...platformVisibility, featured: true }, select: platformPreviewSelect, orderBy: [{ featurePriority: "desc" }, { publishedAt: "desc" }, { id: "desc" }] });
  const remaining = featured ? { id: { not: featured.id } } : {};
  const [news, learning] = await Promise.all([
    db.platformPost.findMany({ where: { ...platformVisibility, ...remaining, type: "platform_news" }, select: platformPreviewSelect, take: 3, orderBy: [{ publishedAt: "desc" }, { id: "desc" }] }),
    db.platformPost.findMany({ where: { ...platformVisibility, ...remaining, type: { in: ["blog", "guide", "topic"] } }, select: platformPreviewSelect, take: 6, orderBy: [{ publishedAt: "desc" }, { id: "desc" }] }),
  ]);
  return { featured, news, learning };
}
export const universityPublicSelect = { id: true, name: true, slug: true, description: true, logoUrl: true, websiteUrl: true, telegramCommunityUrl: true, city: true, region: true } satisfies Prisma.UniversitySelect;
export async function directoryPage(search: URLSearchParams) {
  const query = search.get("search");
  const region = search.get("region");
  const page = Number(search.get("page") || 1);
  const where: Prisma.UniversityWhereInput = { enabled: true, ...(region && { region }), ...(query && { OR: [{ name: { contains: query, mode: "insensitive" } }, { city: { contains: query, mode: "insensitive" } }] }) };
  const [items, total, regions] = await Promise.all([db.university.findMany({ where, select: universityPublicSelect, skip: (page - 1) * 12, take: 12, orderBy: [{ name: "asc" }, { id: "asc" }] }), db.university.count({ where }), db.university.findMany({ where: { enabled: true }, distinct: ["region"], select: { region: true }, orderBy: { region: "asc" } })]);
  return { items, total, regions: regions.map(r => r.region), page, pages: Math.ceil(total / 12) };
}
export const universityTabs = [
  { value: "all", label: "نظرة عامة" }, { value: "news", label: "أخبار الجامعة" },
  { value: "programs", label: "البرامج والفرص" }, { value: "events", label: "الفعاليات" },
  { value: "calendar", label: "التقويم الأكاديمي" }, { value: "schedules", label: "الجداول الدراسية" },
  { value: "services", label: "خدمات الطلبة" }, { value: "links", label: "روابط مهمة" },
] as const;
export function selectedTab(query: PublicQuery) { const value = typeof query.section === "string" ? query.section : "all"; return universityTabs.some(t => t.value === value) ? value : "all"; }

export async function universitySections(universitySlug: string, query: PublicQuery) {
  const university = await db.university.findFirst({ where: { slug: universitySlug, enabled: true }, select: universityPublicSelect });
  if (!university) return { university: null, section: "all", news: [], programs: [], events: [], calendar: [], links: [], categories: [], total: 0, page: 1, pages: 0 } as const;
  const section = selectedTab(query);
  const p = searchFromQuery(query);
  const page = Number(p.get("page"));
  const search = p.get("search");
  const titleSearch = search ? { title: { contains: search, mode: "insensitive" as const } } : {};
  const from = p.get("from"), to = p.get("to");
  const dates = from || to ? { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } : undefined;
  const base = { status: "published" as const, visible: true, ...universityContentScope(universitySlug), ...titleSearch };
  const all = section === "all";
  const { content: _content, ...newsSelect } = articlePublicSelect;
  const newsWhere: Prisma.ArticleWhereInput = { ...publishedArticleWhere, ...universityContentScope(universitySlug), ...titleSearch, ...(p.get("category") && { category: { slug: p.get("category")! } }), ...(dates && { publishedAt: dates }) };
  const programWhere = { ...base, ...(dates && { startsAt: dates }) };
  const eventWhere: Prisma.EventWhereInput = { ...base, kind: "event", ...(dates && { startsAt: dates }) };
  const calendarKind = typeof query.kind === "string" ? eventKind.safeParse(query.kind) : null;
  const calendarWhere: Prisma.EventWhereInput = { ...base, kind: calendarKind?.success && calendarKind.data !== "event" ? calendarKind.data : { in: ["academic_date", "registration", "examination"] }, ...(dates && { startsAt: dates }) };
  const chosenKind = typeof query.kind === "string" ? linkKind.safeParse(query.kind) : null;
  const linksWhere: Prisma.ManagedLinkWhereInput = { active: true, status: "published", ...universityContentScope(universitySlug), ...titleSearch, ...(section === "schedules" ? { kind: "timetable" } : section === "calendar" ? { kind: "academic_calendar" } : section === "services" ? { kind: { in: ["student_service", "admission"] } } : section === "links" && chosenKind?.success ? { kind: chosenKind.data } : {}) };
  const args = { take: all ? 4 : 12, skip: all ? 0 : (page - 1) * 12 };
  const [news, programs, events, calendar, links, categories, total] = await Promise.all([
    all || section === "news" ? db.article.findMany({ where: newsWhere, select: newsSelect, ...args, orderBy: [{ publishedAt: "desc" }, { id: "desc" }] }) : [],
    all || section === "programs" ? db.program.findMany({ where: programWhere, ...args, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }) : [],
    all || section === "events" ? db.event.findMany({ where: eventWhere, ...args, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }) : [],
    all || section === "calendar" ? db.event.findMany({ where: calendarWhere, ...args, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }) : [],
    all || ["links", "services", "schedules", "calendar"].includes(section) ? db.managedLink.findMany({ where: linksWhere, take: 12, skip: all || section === "calendar" ? 0 : (page - 1) * 12, orderBy: [{ displayOrder: "asc" }, { id: "asc" }] }) : [],
    db.articleCategory.findMany({ where: { articles: { some: { ...publishedArticleWhere, ...universityContentScope(universitySlug) } } }, select: { name: true, slug: true }, orderBy: { name: "asc" } }),
    section === "news" ? db.article.count({ where: newsWhere }) : section === "programs" ? db.program.count({ where: programWhere }) : section === "events" ? db.event.count({ where: eventWhere }) : section === "calendar" ? db.event.count({ where: calendarWhere }) : ["links", "services", "schedules"].includes(section) ? db.managedLink.count({ where: linksWhere }) : 0,
  ]);
  return { university, section, news, programs, events, calendar, links, categories, total, page, pages: Math.ceil(total / 12) };
}
