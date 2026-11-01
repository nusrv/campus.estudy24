import type { PrismaClient } from '@prisma/client';
import { AdminPageHeader } from './page-header';
import { CourseCard } from '@/components/campus/course-card';
import { Pagination } from '@/components/campus/content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatNumber } from '@/lib/format';
import { publicCourseCatalog } from '@/server/course-catalog-service';
import { CONTROL_PATH } from './config';
export async function CatalogList({ db, filters }: { db: PrismaClient; filters: Record<string, string> }) {
  const { items, total, universities, page, pages } = await publicCourseCatalog(db, new URLSearchParams({ ...filters, page_size: '20' }));
  return <div className="space-y-5"><AdminPageHeader title="شروحات المواد" count={`${formatNumber(total)} شرح`} /><form className="flex flex-wrap gap-3 rounded-[18px] border border-border bg-white p-4"><input type="hidden" name="view" value="catalog" /><Input name="search" aria-label="بحث في الشروحات" defaultValue={filters.search} placeholder="بحث باسم المادة…" className="sm:max-w-xs" /><select name="university" aria-label="المؤسسة التعليمية" className="public-select" defaultValue={filters.university}><option value="">كل المؤسسات</option>{universities.map(u => <option key={u.slug} value={u.slug}>{u.name}</option>)}</select><Button variant="outline">بحث</Button></form><div className="grid gap-3 xl:grid-cols-2">{items.map(course => <CourseCard key={course.id} course={course} />)}</div>{!items.length && <p className="rounded-[18px] border border-border bg-white p-5 text-sm">لا توجد نتائج.</p>}<Pagination page={Math.floor(page)} pages={pages} base={`${CONTROL_PATH}/course-catalog`} query={{ ...filters, view: 'catalog' }} /></div>;
}
