import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { platformVisibility } from "./content-policy";
import { pagination } from "./validation";
import { HttpError } from "./security";

export const platformPreviewSelect = { id: true, slug: true, type: true, title: true, summary: true, coverImageUrl: true, publishedAt: true, featured: true, category: { select: { name: true, slug: true } } } satisfies Prisma.PlatformPostSelect;
export const platformFullSelect = { ...platformPreviewSelect, content: true, seoTitle: true, seoDescription: true } satisfies Prisma.PlatformPostSelect;
export async function platformPage(search: URLSearchParams) {
  const p = pagination(search);
  if (p.university || p.scope === "university") throw new HttpError(422, "PLATFORM_ONLY", "eStudy24 content cannot be requested as university content.");
  const where: Prisma.PlatformPostWhereInput = { ...platformVisibility, ...(p.type && { type: p.type }), ...(p.category && { category: { slug: p.category } }), ...(p.search && { title: { contains: p.search, mode: "insensitive" } }), ...(p.featured && { featured: p.featured === "true" }), ...((p.from || p.to) && { publishedAt: { ...(p.from && { gte: new Date(p.from) }), ...(p.to && { lte: new Date(p.to) }) } }) };
  const [items, total] = await Promise.all([db.platformPost.findMany({ where, select: platformPreviewSelect, take: p.take, skip: p.skip, orderBy: [{ featured: "desc" }, { featurePriority: "desc" }, { publishedAt: "desc" }, { id: "desc" }] }), db.platformPost.count({ where })]);
  return { items, total, page: p.page, page_size: p.take, pages: Math.ceil(total / p.take) };
}
export function platformDetail(slug: string) { return db.platformPost.findFirst({ where: { ...platformVisibility, slug }, select: platformFullSelect }); }

// Availability failures stay distinct from a successful query returning zero results.
export async function available<T>(operation: () => Promise<T>): Promise<T | null> {
  try { return await operation(); } catch { console.error(JSON.stringify({ event: "public_data_unavailable" })); return null; }
}
