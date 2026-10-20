import { available, platformPage } from "@/server/platform-data";
import { searchFromQuery } from "@/server/campus-data";
import { platformTypeLabel, platformTypes } from "@/lib/portal";
import { EditorialCard, EmptyState, Pagination, PublicFilters, Unavailable, type Query } from "@/components/campus/content";
import { db } from "@/server/db";
import { platformVisibility } from "@/server/content-policy";
export const dynamic = "force-dynamic";
export const metadata = { title: "المقالات والأدلة وأخبار المنصة", description: "محتوى eStudy24: أخبار المنصة، مقالات المدوّنة، أدلة وموضوعات تعليمية.", alternates: { canonical: "/articles" } };
export default async function ArticlesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const [data, categories] = await Promise.all([available(() => platformPage(searchFromQuery(query))), available(() => db.articleCategory.findMany({ where: { platformPosts: { some: platformVisibility } }, select: { name: true, slug: true }, orderBy: { name: "asc" } }))]);
  return <div className="space-y-7"><header><span className="text-xs text-primary" dir="ltr">eStudy24</span><h1 className="mt-3 text-3xl font-medium leading-relaxed">معرفة تفتح لك آفاقًا.</h1><p className="mt-3 text-sm leading-[1.9] text-secondary-foreground">أخبار المنصة، ومقالات وأدلة تعليمية ترافقك في كل خطوة.</p></header><PublicFilters action="/articles" query={query} types={[...platformTypes]} categories={categories?.map(c => ({ value: c.slug, label: c.name }))} />{!data ? <Unavailable /> : <>{data.items.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{data.items.map(post => <EditorialCard key={post.id} href={`/articles/${post.slug}`} title={post.title} summary={post.summary} tag={platformTypeLabel(post.type)} image={post.coverImageUrl} date={post.publishedAt} />)}</div> : <EmptyState title="لا يوجد محتوى مطابق حاليًا" text="جرّب تغيير عوامل التصفية، أو عُد لاحقًا للاطلاع على جديد eStudy24." />}<Pagination page={data.page} pages={data.pages} base="/articles" query={query} /></>}</div>;
}
