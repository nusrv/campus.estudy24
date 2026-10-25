import { Input } from '@/components/ui/input';
import { statuses } from './config';
export function ManagementFilters({ resource, filters, universities, ambassador }: { resource: string; filters: Record<string, string>; universities: { id: string; slug?: string; name: string }[]; ambassador: boolean }) {
  if (['academic-programs', 'articles', 'platform_posts', 'categories', 'logs', 'audit'].includes(resource)) return null;
  const style = 'h-11 rounded-xl border border-border bg-white px-3 text-sm';
  return <>
    {!ambassador && ['links', 'events', 'programs', 'sources'].includes(resource) && <select name="university" aria-label="تصفية حسب الجامعة" defaultValue={filters.university || ''} className={style}><option value="">كل الجامعات</option>{universities.map(u => <option key={u.id} value={u.slug}>{u.name}</option>)}</select>}
    {['links', 'events', 'programs', 'ads'].includes(resource) && <select name="status" aria-label="تصفية حسب الحالة" defaultValue={filters.status || ''} className={style}><option value="">كل الحالات</option>{(resource === 'ads' ? [{ value: 'active', label: 'نشط' }, { value: 'paused', label: 'متوقف' }, { value: 'archived', label: 'مؤرشف' }] : statuses).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>}
    {['universities', 'sources', 'links'].includes(resource) && <select name={resource === 'links' ? 'active' : 'enabled'} aria-label="تصفية التفعيل" defaultValue={filters[resource === 'links' ? 'active' : 'enabled'] || ''} className={style}><option value="">كل حالات التفعيل</option><option value="true">مفعّل</option><option value="false">معطّل</option></select>}
    {resource === 'events' && <select name="kind" aria-label="نوع الفعالية أو الموعد الأكاديمي" defaultValue={filters.kind || ''} className={style}><option value="">كل الأنواع</option>{[{ value: 'event', label: 'فعالية' }, { value: 'academic_date', label: 'موعد أكاديمي' }, { value: 'registration', label: 'تسجيل' }, { value: 'examination', label: 'اختبار' }].map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}
    {['events', 'programs'].includes(resource) && <><label className="text-xs">من تاريخ البداية<Input name="from" type="date" defaultValue={filters.from?.slice(0, 10)} /></label><label className="text-xs">إلى تاريخ البداية<Input name="to" type="date" defaultValue={filters.to?.slice(0, 10)} /></label></>}
  </>;
}
