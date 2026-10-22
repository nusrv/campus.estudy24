import Link from 'next/link';
import { db } from '@/server/db';
import { requireAdminPage } from '@/server/auth';
import { ADMIN_PATH } from '@/server/security';
import { formatNumber } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export async function AmbassadorOverview() {
  const auth = await requireAdminPage();
  const university = auth.administrator.university;
  if (auth.administrator.role !== 'ambassador' || !university?.enabled) return null;
  const scope = { universityId: university.id };
  const [published, pending, events, programs, links, recent] = await Promise.all([
    db.article.count({ where: { ...scope, status: 'published', deletedAt: null } }),
    db.article.count({ where: { ...scope, status: 'pending_review', deletedAt: null } }),
    db.event.count({ where: scope }), db.program.count({ where: scope }), db.managedLink.count({ where: scope }),
    db.article.findMany({ where: { ...scope, origin: 'imported', status: 'pending_review', deletedAt: null }, orderBy: { discoveredAt: 'desc' }, take: 8, select: { id: true, title: true } }),
  ]);
  return <div className="space-y-7"><div><h1 className="text-3xl font-medium">لوحة سفير {university.name}</h1><p className="mt-3 text-sm leading-7 text-secondary-foreground">أدر محتوى جامعتك وراجعه وانشره مباشرة. يُحفظ سجل لكل تعديل.</p></div>
    <Link href={`${ADMIN_PATH}/academic-programs`} className="block rounded-[18px] border border-border bg-white p-6 text-sm font-medium text-primary">التخصصات والبرامج الأكاديمية</Link>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[['الأخبار المنشورة', published], ['بانتظار المراجعة', pending], ['الفعاليات والمواعيد', events], ['البرامج والفرص', programs], ['الروابط والخدمات', links]].map(([label, count]) => <Card key={label}><CardContent><p className="text-xs text-secondary-foreground">{label}</p><p className="mt-4 text-3xl font-medium text-primary">{formatNumber(Number(count))}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>أخبار مستوردة بانتظار المراجعة</CardTitle></CardHeader><CardContent className="space-y-4">{recent.length ? recent.map(item => <Link key={item.id} href={`${ADMIN_PATH}/articles?status=pending_review&search=${encodeURIComponent(item.title)}`} className="block border-b border-border pb-4 text-sm leading-7 last:border-0">{item.title}</Link>) : <p className="text-sm text-secondary-foreground">لا توجد أخبار مستوردة بانتظار المراجعة لجامعتك.</p>}</CardContent></Card>
    <div className="grid gap-4 sm:grid-cols-2">{[['articles', 'أخبار الجامعة'], ['events', 'الفعاليات والمواعيد الأكاديمية'], ['programs', 'البرامج والفرص'], ['links', 'الخدمات والروابط المهمة']].map(([key, label]) => <Link key={key} href={`${ADMIN_PATH}/${key}`} className="rounded-[18px] border border-border bg-white p-6 text-sm font-medium text-primary">{label}</Link>)}</div>
  </div>;
}
