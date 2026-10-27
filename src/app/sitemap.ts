import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { available } from "@/server/platform-data";
import { platformVisibility } from "@/server/content-policy";
import { publishedArticleWhere } from "@/server/public-data";
import { siteUrl } from "@/server/seo";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const url = (path: string) => new URL(path, base).toString();
  const data = await available(async () => {
    const [universities, posts, news] = await Promise.all([db.university.findMany({ where: { enabled: true }, take: 10000, select: { slug: true, updatedAt: true } }), db.platformPost.findMany({ where: platformVisibility, take: 10000, select: { slug: true, updatedAt: true } }), db.article.findMany({ where: publishedArticleWhere, take: 10000, select: { id: true, updatedAt: true, university: { select: { slug: true } } } })]);
    return [...universities.map(u => ({ url: url(`/universities/${u.slug}`), lastModified: u.updatedAt })), ...posts.map(p => ({ url: url(`/articles/${p.slug}`), lastModified: p.updatedAt })), ...news.map(n => ({ url: url(`/universities/${n.university.slug}/news/${n.id}`), lastModified: n.updatedAt }))];
  });
  return ["/", "/universities", "/articles", "/courses"].map(path => ({ url: url(path) })).concat(data || []);
}
