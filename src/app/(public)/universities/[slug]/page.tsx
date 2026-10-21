import { NewsCategoryFilters } from "@/components/campus/news-category-filters";
import { OfficialWebsiteLink } from "@/components/campus/external-link";
import { TelegramLink } from "@/components/campus/telegram-link";
import { UniversityLogo } from "@/components/campus/university-logo";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { db } from "@/server/db";
import { selectedTab, universitySections, universityTabs } from "@/server/campus-data";
import { available } from "@/server/platform-data";
import { publicAds } from "@/server/advertisements";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Advertisement } from "@/components/campus/advertisement";
import { DatedCard, EditorialCard, EmptyState, Pagination, PublicFilters, SectionHeading, ServiceCard, Unavailable, type Query } from "@/components/campus/content";
import { cn } from "@/lib/utils";
import { linkKinds } from "@/lib/portal";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Query> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const university = await available(() => db.university.findFirst({ where: { slug, enabled: true }, select: { name: true, description: true } }));
  return university ? { title: university.name, description: university.description.slice(0, 200), alternates: { canonical: `/universities/${slug}` } } : { title: "بوابة الجامعة", robots: { index: false } };
}
export default async function UniversityPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const [data, banners, between, sidebar, footer] = await Promise.all([available(() => universitySections(slug, query)), available(() => publicAds({ university: slug, placement: "university_banner", take: 1 })), available(() => publicAds({ university: slug, placement: "between_news", take: 1 })), available(() => publicAds({ university: slug, placement: "sidebar", take: 1 })), available(() => publicAds({ university: slug, placement: "footer", take: 1 }))]);
  if (!data) return <Unavailable />;
  if (!data.university) notFound();
  const university = data.university;
  const section = selectedTab(query);
  const all = section === "all";
  const base = `/universities/${university.slug}`;
  const calendarLabels = { academic_date: "موعد أكاديمي", registration: "تسجيل", examination: "اختبارات", event: "فعالية" };
  return <div className="space-y-8"><nav aria-label="مسار التصفح" className="flex flex-wrap items-center gap-2 text-xs text-secondary-foreground"><Link href="/">الرئيسية</Link><span>/</span><Link href="/universities">الجامعات</Link><span>/</span><span className="text-foreground">{university.name}</span></nav><Card className="flex flex-wrap items-start gap-6 p-6 sm:p-8"><UniversityLogo url={university.logoUrl} name={university.name} className="h-24 w-40" /><div className="min-w-0 flex-1"><Badge>بوابة الجامعة</Badge><h1 className="mt-3 text-[28px] font-medium leading-[1.7] sm:text-3xl">{university.name}</h1>{(university.city || university.region) && <p className="mt-2 flex items-center gap-1.5 text-xs text-secondary-foreground"><MapPin className="size-3.5" />{university.city || university.region}</p>}<p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-[1.9] text-secondary-foreground">{university.description || "أخبار الجامعة وبرامجها ومواعيدها وروابط خدماتها، في مساحة واحدة مفتوحة للجميع."}</p></div><OfficialWebsiteLink url={university.websiteUrl} /></Card>
    <TelegramLink url={university.telegramCommunityUrl} universityName={university.name} />
    {banners?.items.map(ad => <Advertisement key={ad.id} ad={ad} />)}
    <nav aria-label="أقسام الجامعة" className="flex gap-1 overflow-x-auto border-b border-border pb-3">{universityTabs.map(tab => <Link key={tab.value} href={`${base}?section=${tab.value}`} aria-current={section === tab.value ? "page" : undefined} className={cn("shrink-0 rounded-xl px-4 py-3 text-xs transition-colors", section === tab.value ? "bg-accent font-medium text-primary" : "text-secondary-foreground hover:bg-white")}>{tab.label}</Link>)}</nav>
    {section === "news" && <NewsCategoryFilters universitySlug={university.slug} categories={data.categories} query={query} />}
    <PublicFilters action={base} query={query} kinds={section === "calendar" ? [{ value: "academic_date", label: "مواعيد أكاديمية" }, { value: "registration", label: "التسجيل" }, { value: "examination", label: "الاختبارات" }] : section === "links" ? [...linkKinds] : undefined} hidden={{ section, ...(section === "news" && typeof query.category === "string" ? { category: query.category } : {}) }} categories={all ? data.categories.map(c => ({ value: c.slug, label: c.name })) : undefined} dates={!["schedules", "services", "links"].includes(section)} />
    <div className={sidebar?.items.length ? "grid items-start gap-7 xl:grid-cols-[1fr_280px]" : ""}><div className="min-w-0 space-y-10">
      {(all || section === "news") && <section><SectionHeading title="أخبار الجامعة وإعلاناتها" description="مستجدات منشورة وفق سياسة الجامعة ومراجعة إدارة البوابة." href={all ? `${base}?section=news` : undefined} />{data.news.length ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{data.news.map(item => <EditorialCard key={item.id} href={`${base}/news/${item.id}`} title={item.title} summary={item.summary} tag={item.category?.name || "أخبار الجامعة"} publisher={university.name} image={item.media.find(m => m.kind === "image")?.url} date={item.originalPublishedAt || item.publishedAt} />)}</div> : <EmptyState title="لا توجد أخبار منشورة مطابقة" text="ستظهر أخبار الجامعة هنا بعد مراجعتها ونشرها. جرّب أيضًا تعديل عوامل التصفية." />}</section>}
      {between?.items.map(ad => <Advertisement key={ad.id} ad={ad} />)}
      {(all || section === "programs") && <section><SectionHeading title="برامج وفرص تصنع الفرق" href={all ? `${base}?section=programs` : undefined} />{data.programs.length ? <div className="grid gap-4 md:grid-cols-2">{data.programs.map(item => <DatedCard key={item.id} item={item} showTime tag="برنامج أو فرصة جامعية" />)}</div> : <EmptyState title="لا توجد برامج أو فرص مطابقة حاليًا" />}</section>}
      {(all || section === "events") && <section><SectionHeading title="فعاليات وأنشطة الجامعة" href={all ? `${base}?section=events` : undefined} />{data.events.length ? <div className="grid gap-4 md:grid-cols-2">{data.events.map(item => <DatedCard key={item.id} item={item} showTime tag="فعالية جامعية" />)}</div> : <EmptyState title="لا توجد فعاليات منشورة مطابقة" />}</section>}
      {(all || section === "calendar") && <section><SectionHeading title="التقويم الأكاديمي" description="المواعيد الأكاديمية والتسجيل والاختبارات؛ تواريخ مستقلة عن تاريخ نشر الأخبار." href={all ? `${base}?section=calendar` : undefined} />{data.calendar.length ? <div className="grid gap-4 md:grid-cols-2">{data.calendar.map(item => <DatedCard key={item.id} item={item} tag={calendarLabels[item.kind]} />)}</div> : <EmptyState title="لا توجد مواعيد أكاديمية مطابقة" text="تُعرض هنا المواعيد المنشورة التي أضافتها إدارة البوابة لهذه الجامعة." />}{data.links.filter(link => link.kind === "academic_calendar").map(item => <div key={item.id} className="mt-4"><ServiceCard item={item} /></div>)}</section>}
      {(all || ["schedules", "services", "links"].includes(section)) && <section><SectionHeading title={section === "schedules" ? "الجداول الدراسية الرسمية" : section === "services" ? "خدمات الطلبة والقبول والتسجيل" : "روابط وخدمات الجامعة"} description="روابط عامة تخص الجامعة، متاحة دون حساب طالب في البوابة." href={all ? `${base}?section=links` : undefined} />{all && <div className="mb-5 flex flex-wrap gap-3"><Button asChild variant="secondary" size="sm"><Link href={`${base}?section=schedules`}>الجداول الدراسية</Link></Button><Button asChild variant="outline" size="sm"><Link href={`${base}?section=services`}>خدمات الطلبة والقبول</Link></Button></div>}{data.links.length ? <div className="grid gap-4 md:grid-cols-2">{data.links.map(item => <ServiceCard key={item.id} item={item} />)}</div> : <EmptyState title="لا توجد روابط منشورة في هذا القسم" text="ستظهر روابط الجامعة الرسمية والموارد المرتبطة بها عند إضافتها من إدارة البوابة." />}</section>}
      {!all && <Pagination page={data.page} pages={data.pages} base={base} query={query} />}
    </div>{sidebar?.items.length ? <aside aria-label="إعلانات تعليمية" className="space-y-4">{sidebar.items.map(ad => <Advertisement key={ad.id} ad={ad} />)}</aside> : null}</div>
    {footer?.items.map(ad => <Advertisement key={ad.id} ad={ad} />)}
  </div>;
}
