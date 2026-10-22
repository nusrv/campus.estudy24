import { formatDateTime } from '@/lib/format';
export function AcademicRowInfo({ item }: { item: Record<string, unknown> }) {
  const summary = [item.degreeName, item.college, item.department, item.campus].filter(value => typeof value === 'string' && value).join(' · ');
  return <div className="mt-2 space-y-1 text-xs leading-6 text-secondary-foreground">{summary && <p>{summary}</p>}<p>{item.origin === 'imported' ? 'مستورد · ' : 'أضيف يدويًا'}{item.origin === 'imported' && String(item.sourceSystem || '')}</p>{item.lastSyncedAt ? <p>آخر مزامنة: {formatDateTime(new Date(String(item.lastSyncedAt)))}</p> : null}</div>;
}
