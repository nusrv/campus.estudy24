import { formatNumber } from "@/lib/format";
import { directoryPage, searchFromQuery } from "@/server/campus-data";
import { available } from "@/server/platform-data";
import { EmptyState, Pagination, PublicFilters, Unavailable, UniversityLinkCard, type Query } from "@/components/campus/content";
export const dynamic = "force-dynamic";
export const metadata = { title: "الجامعات والمؤسسات التعليمية", description: "دليل الجامعات والمؤسسات التعليمية وأخبارها وفرصها وخدماتها الطلابية.", alternates: { canonical: "/universities" } };
export default async function UniversitiesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const data = await available(() => directoryPage(searchFromQuery(query)));
  return <div className="space-y-7"><header><span className="text-xs text-primary">دليل المؤسسات التعليمية</span><h1 className="mt-3 text-3xl font-medium leading-relaxed">الجامعات والمؤسسات التعليمية</h1><p className="mt-3 text-sm leading-[1.9] text-secondary-foreground">دليل يجمع الجامعات والكليات. ابحث عن مؤسستك التعليمية وابدأ من المكان الذي يهمّك.</p></header><PublicFilters action="/universities" query={query} regions={data?.regions || []} dates={false} institutionFilter />{!data ? <Unavailable /> : <><p role="status" className="mb-4 text-sm text-secondary-foreground">{formatNumber(data.total)} مؤسسة تعليمية مطابقة</p>{data.items.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{data.items.map(university => <UniversityLinkCard key={university.id} university={university} />)}</div> : <EmptyState title="لم نعثر على مؤسسة تعليمية مطابقة" text="جرّب اسمًا آخر أو امسح عوامل التصفية." />}<Pagination page={data.page} pages={data.pages} base="/universities" query={query} /></>}</div>;
}
