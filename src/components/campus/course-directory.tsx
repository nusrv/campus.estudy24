import Link from 'next/link';
import { db } from '@/server/db';
import { publicCourseCatalog } from '@/server/course-catalog-service';
import { available } from '@/server/platform-data';
import { trustedCourseUrl } from '@/lib/course-catalog';
import { validTelegramUrl } from '@/lib/external-links';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CourseImage } from './course-image';
import { UniversityLogo } from './university-logo';
import { TelegramIcon } from './telegram-link';
import { EmptyState, Pagination, Unavailable, type Query } from './content';
export function CourseSupport({ url }: { url?: string | null }) {
  const href = validTelegramUrl(url); if (!href) return null;
  return <aside className="sticky bottom-4 z-20 ms-auto mt-8 w-fit max-w-full" aria-label="مساعدة في العثور على شرح"><a href={href} target="_blank" rel="noopener noreferrer external" className="flex max-w-full items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 text-primary shadow-sm focus-visible:outline-2 focus-visible:outline-primary"><TelegramIcon /><span><span className="block text-sm font-medium">لم تجد شرح مادتك؟</span><span className="block text-[11px] leading-6 text-secondary-foreground">تواصل مع فريق eStudy24 لمساعدتك.</span></span></a></aside>;
}
export async function CourseDirectory({ query, universitySlug }: { query: Query; universitySlug?: string }) {
  const search = new URLSearchParams();
  for (const key of ['search', 'page', 'university']) if (typeof query[key] === 'string' && query[key]) search.set(key, query[key] as string);
  if (universitySlug) search.set('university', universitySlug);
  const [result, settings] = await Promise.all([available(() => publicCourseCatalog(db, search)), available(() => db.siteSettings.findUnique({ where: { id: 'main' }, select: { telegramSupportUrl: true } }))]);
  if (!result) return <Unavailable />;
  const base = universitySlug ? `/universities/${universitySlug}` : '/courses', fixed = universitySlug ? { section: 'courses' } : {};
  return <section className="space-y-6" aria-labelledby="course-directory-heading"><div><Badge variant="outline">شروحات eStudy24</Badge><h2 id="course-directory-heading" className="mt-3 text-2xl font-medium">شروحات المواد الدراسية</h2><p className="mt-3 text-sm leading-8 text-secondary-foreground">اكتشف شروحات تعليمية تقدمها منصة eStudy24. هذه الشروحات ليست مقررات رسمية مقدّمة من الجامعة. تفاصيل الشرح متاحة في صفحة المنصة الأصلية، ولا يلزم تسجيل الدخول إلى Campus للتصفح.</p></div>
    {!universitySlug && result.universities.length > 0 && <nav aria-label="جامعات تتوفر لها شروحات" className="flex gap-3 overflow-x-auto pb-2">{result.universities.map(u => <Link key={u.slug} href={`/courses?university=${u.slug}`} aria-current={search.get('university') === u.slug ? 'page' : undefined} className="flex min-w-48 items-center gap-3 rounded-[18px] border border-border bg-white p-4 text-xs hover:border-primary"><UniversityLogo url={u.logoUrl} name={u.name} className="h-10 w-14 shrink-0" /><span>{u.name}</span></Link>)}</nav>}
    <form action={base} className="flex flex-wrap items-end gap-4 rounded-[18px] border border-border bg-white p-5">{universitySlug && <input type="hidden" name="section" value="courses" />}<label className="min-w-0 flex-1 basis-60 text-sm">اسم المادة أو الشرح<Input name="search" maxLength={200} defaultValue={search.get('search') || ''} placeholder="ابحث بالعربية أو الإنجليزية" className="mt-2" /></label>
      {!universitySlug && <label className="min-w-0 flex-1 basis-60 text-sm">الجامعة<select aria-label="الجامعة" name="university" defaultValue={search.get('university') || ''} className="public-select mt-2 w-full"><option value="">جميع الجامعات المشاركة</option>{result.universities.map(u => <option key={u.slug} value={u.slug}>{u.name}</option>)}</select></label>}
      <Button type="submit">بحث</Button><Button variant="outline" asChild><Link href={universitySlug ? `${base}?section=courses` : base}>مسح البحث</Link></Button>
    </form><p role="status" className="text-sm text-secondary-foreground">{formatNumber(result.total)} شرح متاح مطابق</p>
    {result.items.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{result.items.map(c => <Card key={c.id} className="flex flex-col gap-4 p-5"><CourseImage url={c.imageUrl} title={c.title} /><p className="text-xs text-primary">{c.university?.name}</p><h3 className="text-lg font-medium leading-8">{c.title}</h3>{c.description && <p className="line-clamp-3 text-sm leading-[1.9] text-secondary-foreground">{c.description}</p>}{trustedCourseUrl(c.destinationUrl) && <Button asChild className="mt-auto"><a href={c.destinationUrl} target="_blank" rel="noopener noreferrer external">عرض الشرح</a></Button>}</Card>)}</div> : <EmptyState title="لا توجد شروحات مطابقة حاليًا" text="جرّب اسمًا آخر أو جامعة أخرى. ستظهر هنا الشروحات المرتبطة بجامعتك بعد اكتمال المزامنة والتحقق من الربط." />}
    <Pagination page={result.page} pages={result.pages} base={base} query={{ ...query, ...fixed }} /><CourseSupport url={settings?.telegramSupportUrl} />
  </section>;
}
