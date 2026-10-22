import Link from 'next/link';
import { db } from '@/server/db';
import { academicList } from '@/server/academic-programs';
import { available } from '@/server/platform-data';
import { formatDateTime, formatNumber } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Pagination, Unavailable, type Query } from './content';

export async function AcademicDirectory({ universitySlug, query }: { universitySlug: string; query: Query }) {
  const search = new URLSearchParams({ university: universitySlug, page_size: '12' });
  for (const key of ['search', 'degree', 'college', 'department', 'page']) if (typeof query[key] === 'string' && query[key]) search.set(key, query[key] as string);
  const result = await available(() => academicList(db, search));
  if (!result) return <Unavailable />;
  const base = `/universities/${universitySlug}`;
  return <section className="space-y-6" aria-labelledby="academic-heading"><div><h2 id="academic-heading" className="text-2xl font-medium">التخصصات والبرامج الأكاديمية</h2><p className="mt-3 text-sm leading-8 text-secondary-foreground">دليل الدرجات والتخصصات كما ترد في مصادر الجامعة. وجود البرنامج في الدليل لا يعني إتاحة القبول حاليًا.</p></div>
    <form action={base} className="grid gap-4 rounded-[18px] border border-border bg-white p-5 sm:grid-cols-2 xl:grid-cols-4"><input type="hidden" name="section" value="academic-programs" /><label className="text-sm">اسم البرنامج<Input name="search" maxLength={200} defaultValue={search.get('search') || ''} className="mt-2" placeholder="ابحث باسم التخصص أو البرنامج" /></label>
      {([['degree', 'الدرجة الأكاديمية', result.filters.degrees], ['college', 'الكلية', result.filters.colleges], ['department', 'القسم', result.filters.departments]] as const).filter(([name, , options]) => name !== 'department' || options.length).map(([name, label, options]) => <label key={name} className="text-sm">{label}<select name={name} defaultValue={search.get(name) || ''} className="public-select mt-2 w-full"><option value="">الكل</option>{options.map(value => <option key={value} value={value}>{value}</option>)}</select></label>)}
      <div className="flex items-end gap-3"><Button type="submit">بحث وتصفية</Button><Button asChild variant="outline"><Link href={`${base}?section=academic-programs`}>مسح التصفية</Link></Button></div>
    </form><p className="text-sm text-secondary-foreground" role="status">{formatNumber(result.total)} برنامج أكاديمي مطابق</p>
    {result.items.length ? <div className="grid gap-5 md:grid-cols-2">{result.items.map(item => <Card key={item.id} className="space-y-4 p-6"><div>{item.degreeName && <Badge variant="outline">{item.degreeName}</Badge>}<h3 className="mt-3 text-lg font-medium leading-8">{item.title}</h3></div><dl className="grid gap-3 text-sm leading-7">{([['الكلية', item.college], ['القسم', item.department], ['المقر / المدينة', item.campus], ['الساعات المعتمدة', item.creditHours === null ? null : formatNumber(item.creditHours)], ['نمط الدراسة', item.studyMode]] as const).filter(([, value]) => value !== null).map(([label, value]) => <div key={label} className="flex flex-wrap gap-2"><dt className="text-secondary-foreground">{label}:</dt><dd>{value}</dd></div>)}</dl>
      {item.description && <p className="whitespace-pre-wrap text-sm leading-[1.9] text-secondary-foreground">{item.description}</p>}
      {item.tuitionVerified && item.tuitionInfo && item.tuitionSourceUrl && <div className="rounded-xl bg-accent p-4 text-sm leading-8"><p>{item.tuitionInfo}</p><a href={item.tuitionSourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">مصدر معلومات الرسوم</a></div>}
      <div className="flex flex-wrap gap-3">{item.officialProgramUrl && <Button asChild variant="outline" size="sm"><a href={item.officialProgramUrl} target="_blank" rel="noopener noreferrer">صفحة البرنامج الرسمية</a></Button>}{item.studyPlanUrl && <Button asChild variant="secondary" size="sm"><a href={item.studyPlanUrl} target="_blank" rel="noopener noreferrer">الخطة الدراسية</a></Button>}</div>
      <div className="border-t border-border pt-4 text-xs leading-7 text-secondary-foreground">{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">المصدر الرسمي</a> : <span>أضيف يدويًا بواسطة إدارة البوابة</span>}<p>{item.lastSyncedAt ? `آخر مزامنة: ${formatDateTime(item.lastSyncedAt)}` : 'لم تتم مزامنة هذا السجل آليًا بعد.'}</p></div>
    </Card>)}</div> : <EmptyState title="لا توجد برامج أكاديمية منشورة مطابقة" text="لم تُضف بيانات لهذا الدليل بعد، أو لا توجد نتائج لعوامل التصفية المختارة. ستظهر البرامج بعد استيرادها أو إضافتها ومراجعتها ونشرها." />}
    <Pagination page={result.page} pages={result.pages} base={base} query={{ ...query, section: 'academic-programs' }} />
  </section>;
}
