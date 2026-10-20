import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { available, platformDetail } from "@/server/platform-data";
import { publicAds } from "@/server/advertisements";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Unavailable } from "@/components/campus/content";
import { Advertisement } from "@/components/campus/advertisement";
import { arabicDate, platformTypeLabel } from "@/lib/portal";
type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await available(() => platformDetail(slug));
  return result ? { title: result.seoTitle || result.title, description: result.seoDescription || result.summary.slice(0, 200), alternates: { canonical: `/articles/${result.slug}` }, openGraph: { type: "article", title: result.seoTitle || result.title, description: result.seoDescription || result.summary.slice(0, 200), ...(result.coverImageUrl && { images: [{ url: result.coverImageUrl }] }), ...(result.publishedAt && { publishedTime: result.publishedAt.toISOString() }) } } : { title: "محتوى eStudy24", robots: { index: false } };
}
export default async function PlatformArticle({ params }: Props) {
  const { slug } = await params;
  const [data, ads, footer] = await Promise.all([available(async () => ({ post: await platformDetail(slug) })), available(() => publicAds({ placement: "article_page", take: 2 })), available(() => publicAds({ placement: "footer", take: 1 }))]);
  if (!data) return <Unavailable />;
  if (!data.post) notFound();
  const post = data.post;
  return <div className="mx-auto max-w-4xl space-y-7"><nav aria-label="مسار التصفح" className="flex flex-wrap gap-2 text-xs text-secondary-foreground"><Link href="/">الرئيسية</Link><span>/</span><Link href="/articles">محتوى eStudy24</Link></nav><article><Card className="overflow-hidden"><div className="space-y-5 p-6 sm:p-10"><Badge>{platformTypeLabel(post.type)}</Badge><h1 className="text-[28px] font-medium leading-[1.8] sm:text-4xl">{post.title}</h1><p className="text-xs text-secondary-foreground">eStudy24 <span className="mx-2">·</span>{arabicDate(post.publishedAt)}</p><p className="text-base leading-[1.9] text-secondary-foreground">{post.summary}</p></div>{post.coverImageUrl && <img src={post.coverImageUrl} referrerPolicy="no-referrer" alt="" className="max-h-[440px] w-full object-cover" />}<div className="whitespace-pre-wrap p-6 text-[15px] leading-[1.9] sm:p-10">{post.content}</div></Card></article>{ads?.items.map(ad => <Advertisement key={ad.id} ad={ad} />)}<Link href="/articles" className="inline-block text-sm text-primary hover:underline">العودة إلى المقالات والأدلة</Link>{footer?.items.map(ad => <Advertisement key={ad.id} ad={ad} />)}</div>;
}
