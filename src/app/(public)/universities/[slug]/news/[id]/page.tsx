import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { articlePublicSelect, publishedArticleWhere } from "@/server/public-data";
import { available } from "@/server/platform-data";
import { publicAds } from "@/server/advertisements";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Unavailable } from "@/components/campus/content";
import { Advertisement } from "@/components/campus/advertisement";
import { arabicDate } from "@/lib/portal";
type Props = { params: Promise<{ slug: string; id: string }> };
export const dynamic = "force-dynamic";
function findArticle(slug: string, id: string) { return db.article.findFirst({ where: { ...publishedArticleWhere, id, university: { slug, enabled: true } }, select: articlePublicSelect }); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug, id } = await params; const post = await available(() => findArticle(slug, id)); return post ? { title: post.title, description: post.description || post.summary.slice(0, 200), alternates: { canonical: `/universities/${slug}/news/${id}` }, openGraph: { type: "article", title: post.title } } : { title: "خبر الجامعة", robots: { index: false } }; }
export default async function UniversityArticle({ params }: Props) {
  const { slug, id } = await params;
  const [data, ads, footer] = await Promise.all([available(async () => ({ post: await findArticle(slug, id) })), available(() => publicAds({ university: slug, placement: "article_page", take: 2 })), available(() => publicAds({ university: slug, placement: "footer", take: 1 }))]);
  if (!data) return <Unavailable />;
  if (!data.post) notFound();
  const post = data.post;
  return <div className="mx-auto max-w-4xl space-y-7"><nav aria-label="مسار التصفح" className="flex flex-wrap gap-2 text-xs text-secondary-foreground"><Link href="/universities">الجامعات والمؤسسات التعليمية</Link><span>/</span><Link href={`/universities/${slug}`}>{post.university.name}</Link><span>/</span><Link href={`/universities/${slug}?section=news`}>الأخبار</Link></nav><article><Card><div className="space-y-5 p-6 sm:p-10"><Badge>{post.category?.name || "أخبار المؤسسة التعليمية"}</Badge><h1 className="text-[28px] font-medium leading-[1.8] sm:text-4xl">{post.title}</h1><p className="text-xs text-secondary-foreground">{post.university.name} <span className="mx-2">·</span>{arabicDate(post.originalPublishedAt || post.publishedAt)}</p><p className="text-base leading-[1.9] text-secondary-foreground">{post.summary}</p>{post.description && <p className="text-sm leading-[1.9] text-secondary-foreground">{post.description}</p>}<div className="whitespace-pre-wrap border-t border-border pt-6 text-[15px] leading-[1.9]">{post.content}</div>{post.media.filter(item => item.kind === "image").map(item => <figure key={item.url} className="space-y-2"><img src={item.url} referrerPolicy="no-referrer" alt="صورة مرفقة بالخبر" loading="lazy" className="max-h-[480px] w-full rounded-xl object-contain" /><figcaption className="text-[11px] text-secondary-foreground">{item.usage === "external_reference_only" ? "صورة معروضة عبر المصدر الأصلي" : "صورة مرفقة"}</figcaption></figure>)}{post.sourceUrl && <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" className="block break-all rounded-xl bg-muted p-4 text-sm leading-7 text-primary">المصدر الأصلي للخبر: {post.sourceUrl}</a>}{post.media.filter(item => item.kind === "pdf").length > 0 && <section><h2 className="mb-3 text-base font-medium">الملفات والمرفقات</h2><div className="flex flex-wrap gap-3">{post.media.filter(item => item.kind === "pdf").map((item, index) => <Button key={item.url} asChild variant="outline" size="sm"><a href={item.url} target="_blank" rel="noopener noreferrer">ملف PDF {index + 1}</a></Button>)}</div></section>}{post.registrationLinks.length > 0 && <section><h2 className="mb-3 text-base font-medium">روابط التسجيل</h2><div className="flex flex-wrap gap-3">{post.registrationLinks.map((item, index) => <Button key={item.url} asChild variant="secondary" size="sm"><a href={item.url} target="_blank" rel="noopener noreferrer">رابط التسجيل {index + 1}</a></Button>)}</div></section>}</div></Card></article>{ads?.items.map(ad => <Advertisement key={ad.id} ad={ad} />)}<Link href={`/universities/${slug}?section=news`} className="inline-block text-sm text-primary hover:underline">العودة إلى أخبار المؤسسة التعليمية</Link>{footer?.items.map(ad => <Advertisement key={ad.id} ad={ad} />)}</div>;
}
