'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/format';
import { CONTROL_PATH } from './config';
import { useAdmin } from './shell';
import type { cleanupPreflight } from '@/server/institution-cleanup';
type Report = Awaited<ReturnType<typeof cleanupPreflight>>;
const labels: Record<string, string> = { University: 'مؤسسات', Article: 'أخبار', AcademicProgram: 'تخصصات أكاديمية', Event: 'فعاليات ومواعيد', Program: 'برامج تدريبية', ManagedLink: 'روابط وخدمات', IngestionSource: 'مصادر استيراد', Administrator: 'حسابات سفراء', CourseExplanation: 'شروحات', Advertisement: 'إعلانات خاصة', exclusiveUploads: 'ملفات خاصة', preservedSharedUploads: 'ملفات مشتركة محفوظة', preservedSharedAds: 'إعلانات مشتركة محفوظة' };
export function InstitutionCleanup({ onComplete }: { onComplete?: (message: string) => void }) {
  const { csrf } = useAdmin(), router = useRouter(), dialog = useRef<HTMLDialogElement>(null);
  const [report, setReport] = useState<Report | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  async function review() {
    setBusy(true); setError('');
    try { const r = await fetch(`${CONTROL_PATH}/api/institution-cleanup`); const body = await r.json(); if (!r.ok) throw new Error(body.error?.message || 'تعذر فحص المؤسسات.'); setReport(body); if (body.completed) setDone(true); else dialog.current?.showModal(); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر الاتصال.'); } finally { setBusy(false); }
  }
  async function execute() {
    setBusy(true); setError('');
    try { const r = await fetch(`${CONTROL_PATH}/api/institution-cleanup`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ snapshot: report?.snapshot, confirmed: true }) }); const body = await r.json(); if (!r.ok) throw new Error(body.error?.message || 'تعذر تنفيذ العملية.'); setDone(true); onComplete?.(body.pendingFiles === 0 ? 'تم تنظيم المؤسسات بنجاح. يمكنك تشغيل مزامنة eStudy24.' : 'تم تنظيم المؤسسات. ستُعاد محاولة حذف الملفات المتبقية في الصيانة.'); dialog.current?.close(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر الاتصال. أعد الفحص لمعرفة حالة العملية.'); } finally { setBusy(false); }
  }
  if (done) return <p role="status" className="rounded-xl bg-accent p-3 text-sm">اكتمل تنظيم المؤسسات المعتمدة. يمكنك الآن تشغيل مزامنة eStudy24.</p>;
  return <><Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="text-sm font-medium">تنظيم المؤسسات المعتمدة</h2><p className="mt-1 text-xs text-secondary-foreground">عملية واحدة لإضافة المؤسسات الناقصة وإزالة المؤسسات الثلاث المعتمدة للحذف.</p></div><Button variant="outline" size="sm" disabled={busy} onClick={review}>مراجعة المؤسسات</Button></Card>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <dialog ref={dialog} aria-labelledby="cleanup-title" className="m-auto max-h-[90dvh] w-[min(600px,94vw)] overflow-y-auto rounded-[18px] border border-border bg-white p-5 backdrop:bg-black/30" onCancel={event => { if (busy) event.preventDefault(); }}>
      <h2 id="cleanup-title" className="text-xl font-medium">تأكيد الحذف النهائي</h2><p className="my-3 text-sm leading-7">سيُحذف نهائيًا كل من:</p><ul className="list-inside list-disc text-sm leading-8"><li>جامعة الملك سعود</li><li>جامعة الملك خالد</li><li>جامعة طيبة</li></ul>
      <p className="my-3 text-sm leading-7">يشمل الحذف محتواها وحسابات سفرائها وتكاملاتها الخاصة. ستبقى السجلات المشتركة والمؤسسات العشر المعتمدة محفوظة. لا يمكن التراجع عن الحذف.</p>
      {report && <><div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-3 text-xs">{Object.entries(labels).filter(([key]) => report.counts[key]).map(([key, label]) => <p key={key}>{label}: {formatNumber(report.counts[key])}</p>)}</div><p className="my-3 text-sm">إضافة أو ربط: جامعة الباحة، جامعة تبوك، كلية ينبع الصناعية.</p>{report.conflicts.length > 0 && <div role="alert" className="my-3 rounded-xl bg-red-50 p-3 text-sm leading-7">{report.conflicts.map((c, i) => <p key={i}>{c}</p>)}</div>}</>}
      {error && <p role="alert" className="my-3 text-sm text-red-700">{error}</p>}<div className="mt-5 flex flex-wrap gap-3"><Button variant="destructive" disabled={busy || !report || report.conflicts.length > 0} onClick={execute}>تأكيد الحذف وتنظيم المؤسسات</Button><Button variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>إلغاء</Button></div>
    </dialog></>;
}
