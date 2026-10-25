'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatNumber } from '@/lib/format';
import { bulkActions, actionLabels, emptySelection, selectedCount, isSelected, selectionCriteria, toggleSelection, BULK_LIMIT, type Selection, type BulkAction } from '@/lib/bulk';
import { useAdmin } from './shell';
import { CONTROL_PATH } from './config';
const EVENT = 'campus-bulk-selection';
function subscribe(callback: () => void) { window.addEventListener(EVENT, callback); window.addEventListener('storage', callback); return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback); }; }
const EMPTY = '{}';
function failureMessage(status: number, result: { error?: { message?: string } }) { return status === 401 ? 'انتهت الجلسة. سجّل الدخول مجددًا.' : status === 429 ? 'تجاوزت حد الطلبات. انتظر قليلًا ثم حاول مجددًا.' : result.error?.message && /[ء-ي]/.test(result.error.message) ? result.error.message : 'تعذّر إتمام العملية. راجع التحديد والصلاحيات وأعد المحاولة بالطلب نفسه.'; }
type Stored = { criteria?: string; selection?: Selection; notice?: string };
function readStored(raw: string): Stored {
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || typeof saved.criteria !== 'string') return {};
    const s = saved.selection;
    const validIds = (value: unknown): value is string[] => Array.isArray(value) && value.length <= BULK_LIMIT && new Set(value).size === value.length && value.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id));
    if (s?.mode === 'ids' && validIds(s.ids) || s?.mode === 'all' && typeof s.token === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(s.token) && Number.isInteger(s.count) && s.count > 0 && s.count <= BULK_LIMIT && validIds(s.excluded) && s.excluded.length <= s.count) return { criteria: saved.criteria, selection: s, notice: typeof saved.notice === 'string' ? saved.notice.slice(0, 500) : '' };
    return {};
  } catch { return {}; }
}
type Preview = { token: string; action: BulkAction; count: number; scope: string; confirmation: string; security: boolean; irreversible: boolean };
export function useBulkSelection(resource: string, filters: Record<string, string>, visibleIds: string[]) {
  const { csrf, role } = useAdmin(), criteria = selectionCriteria(filters), key = `campus-bulk:${csrf.slice(-16)}:${resource}`;
  const raw = useSyncExternalStore(subscribe, () => { try { return sessionStorage.getItem(key) || EMPTY; } catch { return EMPTY; } }, () => EMPTY);
  const stored = readStored(raw);
  const selection: Selection = stored.criteria === criteria && stored.selection ? stored.selection : emptySelection;
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [membership, setMembership] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] });
  const token = selection.mode === 'all' ? selection.token : '', visibleKey = visibleIds.join(','), membershipKey = token + ':' + visibleKey;
  function write(value: Selection, notice = '') { if (value.mode === 'ids' && value.ids.length > BULK_LIMIT) { setError(`الحد الأقصى ${formatNumber(BULK_LIMIT)} سجل للعملية الواحدة. لم يتغيّر التحديد السابق.`); return; } try { sessionStorage.setItem(key, JSON.stringify({ criteria, selection: value, notice })); window.dispatchEvent(new Event(EVENT)); } catch { setError('تعذّر حفظ التحديد في جلسة المتصفح. اسمح بتخزين الجلسة وأعد المحاولة.'); } }
  useEffect(() => { try { const saved = readStored(raw); if (saved.criteria && saved.criteria !== criteria) { sessionStorage.setItem(key, JSON.stringify({ criteria, selection: emptySelection, notice: 'أُلغي التحديد السابق لأن عوامل التصفية أو الجامعة تغيّرت.' })); window.dispatchEvent(new Event(EVENT)); } } catch { /* unavailable session storage */ } }, [criteria, key, raw]);
  async function call(payload: unknown) {
    const response = await fetch(`${CONTROL_PATH}/api/bulk/${resource}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(failureMessage(response.status, result));
    return result;
  }
  useEffect(() => {
    if (!token) return;
    let ignore = false;
    fetch(`${CONTROL_PATH}/api/bulk/${resource}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ op: 'membership', token, ids: visibleKey ? visibleKey.split(',') : [] }) }).then(async response => { const value = await response.json(); if (!response.ok) throw new Error(failureMessage(response.status, value)); if (!ignore) setMembership({ key: membershipKey, ids: value.ids }); }).catch(err => { if (!ignore) setError(err instanceof TypeError || err instanceof SyntaxError ? 'تعذّر التحقق من التحديد بسبب الاتصال.' : err instanceof Error ? err.message : 'تعذّر التحقق من التحديد.'); });
    return () => { ignore = true; };
  }, [token, visibleKey, membershipKey, resource, csrf]);
  const pageIds = selection.mode === 'ids' ? visibleIds : membership.key === membershipKey ? membership.ids : [];
  const actions = bulkActions(resource, role).filter(action => !['articles', 'academic-programs', 'platform_posts'].includes(resource) || (filters.deleted === 'true' ? action === 'restore' : action !== 'restore'));
  return { resource, criteria, actions, selection, count: selectedCount(selection), busy, setBusy, error, setError, message, setMessage, notice: stored.notice || '', call,
    selected: (id: string) => pageIds.includes(id) && isSelected(selection, id), eligible: (id: string) => pageIds.includes(id), pageIds,
    toggle: (ids: string[], checked: boolean) => write(toggleSelection(selection, ids, checked)), clear: () => write(emptySelection),
    selectAll: async () => { setBusy(true); setError(''); try { const s = await call({ op: 'snapshot', filters: JSON.parse(criteria) }); write({ mode: 'all', token: s.token, count: s.count, excluded: [] }); } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر تحديد النتائج.'); } finally { setBusy(false); } },
  };
}
export type BulkController = ReturnType<typeof useBulkSelection>;
export function SelectionCheckbox({ bulk, id, label }: { bulk: BulkController; id: string; label: string }) {
  return <input type="checkbox" aria-label={`تحديد السجل: ${label}`} className="size-4 accent-primary" disabled={bulk.busy || !bulk.eligible(id)} checked={bulk.selected(id)} onChange={event => bulk.toggle([id], event.target.checked)} title={!bulk.eligible(id) ? 'السجل غير موجود في لقطة التحديد أو جارٍ التحقق منها.' : undefined} />;
}
export function PageSelection({ bulk }: { bulk: BulkController }) {
  const count = bulk.pageIds.filter(bulk.selected).length;
  const snapshot = bulk.selection.mode === 'all';
  return <label className="inline-flex cursor-pointer items-center gap-2 text-xs"><input type="checkbox" aria-label={snapshot ? 'تحديد سجلات الصفحة ضمن لقطة النتائج' : 'تحديد جميع سجلات الصفحة الحالية'} className="size-4 accent-primary" checked={bulk.pageIds.length > 0 && count === bulk.pageIds.length} ref={node => { if (node) node.indeterminate = count > 0 && count < bulk.pageIds.length; }} disabled={bulk.busy || !bulk.pageIds.length} onChange={event => bulk.toggle(bulk.pageIds, event.target.checked)} />{snapshot ? 'تحديد سجلات الصفحة ضمن اللقطة' : 'تحديد الصفحة الحالية'}</label>;
}
export function BulkToolbar({ bulk, total, title, onSuccess }: { bulk: BulkController; total: number; title: string; onSuccess?: () => Promise<void> | void }) {
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<BulkAction | ''>(''), [preview, setPreview] = useState<Preview | null>(null), [typed, setTyped] = useState('');
  if (!bulk.actions.length) return null;
  async function review() {
    if (!action) return; bulk.setBusy(true); bulk.setError(''); bulk.setMessage('');
    try { const selection = bulk.selection.mode === 'ids' ? { ...bulk.selection, filters: JSON.parse(bulk.criteria) } : { mode: 'all', token: bulk.selection.token, excluded: bulk.selection.excluded }; const result = await bulk.call({ op: 'preview', action, selection }); setPreview(result); setTyped(''); dialog.current?.showModal(); }
    catch (err) { bulk.setError(err instanceof TypeError || err instanceof SyntaxError ? 'تعذّرت مراجعة التحديد بسبب الاتصال. لم يبدأ التنفيذ.' : err instanceof Error ? err.message : 'تعذّرت مراجعة التحديد.'); } finally { bulk.setBusy(false); }
  }
  async function execute() {
    if (!preview) return; bulk.setBusy(true); bulk.setError('');
    try {
      const result = await bulk.call({ op: 'execute', token: preview.token, confirmation: preview.security ? typed : preview.confirmation });
      if (result.affected_count !== preview.count || result.failed_count !== 0 || result.changed_count + result.unchanged_count !== preview.count) throw new Error('تعذّر تأكيد النتيجة. أبقِ الطلب نفسه وأعد المحاولة أو حدّث القائمة للتحقق.');
      dialog.current?.close(); bulk.clear(); bulk.setMessage(`تم تنفيذ ${actionLabels[preview.action]} على ${formatNumber(result.affected_count)} سجلًا؛ تغيّر ${formatNumber(result.changed_count)}، ودون تغيير ${formatNumber(result.unchanged_count)}. رقم العملية: ${result.operation_id}`);
      try { await onSuccess?.(); } catch { bulk.setError('تم تنفيذ العملية وتأكيد نتيجتها، لكن تعذّر تحديث القائمة. حدّث الصفحة لعرض الحالة الحالية.'); }
      router.refresh();
    } catch (err) { bulk.setError(err instanceof TypeError || err instanceof SyntaxError ? 'تعذّر تأكيد النتيجة بسبب الاتصال. أعد التأكيد بنفس الطلب للحصول على نتيجته دون تكرار التنفيذ.' : err instanceof Error ? err.message : 'لم تُنفّذ تغييرات جزئية. راجع التحديد.'); }
    finally { bulk.setBusy(false); }
  }
  return <section aria-label={`التحديد والإجراءات الجماعية — ${title}`} className="space-y-4 rounded-[18px] border border-border bg-white p-5">
    <div className="flex flex-wrap items-center gap-3"><PageSelection bulk={bulk} /><span role="status" aria-live="polite">تم تحديد {formatNumber(bulk.count)} سجلًا</span><Button type="button" variant="outline" size="sm" className="h-auto min-h-9 max-w-full whitespace-normal py-2" disabled={bulk.busy || !total} onClick={bulk.selectAll}>تحديد جميع النتائج المطابقة للفلاتر ({formatNumber(total)})</Button><Button type="button" variant="ghost" size="sm" disabled={bulk.busy || !bulk.count} onClick={bulk.clear}>مسح التحديد</Button></div>
    <p className="text-xs leading-7 text-secondary-foreground">{bulk.selection.mode === 'all' ? `لقطة ثابتة لجميع النتائج وقت التحديد، باستثناء ${formatNumber(bulk.selection.excluded.length)} سجلًا. السجلات الجديدة لا تنضم تلقائيًا؛ تغيّر السجلات المحددة يوقف التنفيذ للمراجعة.` : 'التحديد اليدوي محفوظ عند التنقل بين الصفحات. تحديد الصفحة الحالية لا يحدد الصفحات الأخرى.'}</p>
    {bulk.notice && <p role="status" className="text-sm text-primary">{bulk.notice}</p>}
    <div className="flex flex-wrap gap-3"><select aria-label="الإجراء الجماعي" className="h-10 rounded-xl border border-border bg-white px-3 text-sm" value={action} onChange={event => setAction(event.target.value as BulkAction)} disabled={bulk.busy}><option value="">اختر الإجراء</option>{bulk.actions.map(value => <option key={value} value={value}>{actionLabels[value]}</option>)}</select><Button type="button" disabled={bulk.busy || !bulk.count || !action} onClick={review}>{action ? actionLabels[action] : 'مراجعة المحدد'} ({formatNumber(bulk.count)})</Button></div>
    {bulk.message && <p role="status" className="break-words text-sm leading-7 text-primary">{bulk.message}</p>}{bulk.error && <p role="alert" className="text-sm leading-7 text-red-700">{bulk.error}</p>}
    <dialog ref={dialog} aria-labelledby="bulk-confirm-title" onCancel={event => { if (bulk.busy) event.preventDefault(); }} className="m-auto w-[calc(100%_-_32px)] max-w-lg rounded-[18px] border border-border bg-white p-6 text-foreground backdrop:bg-[#182230]/35">
      {preview && <div className="space-y-5"><h2 id="bulk-confirm-title" className="text-lg font-medium">تأكيد {actionLabels[preview.action]}</h2><p>العدد الدقيق: <strong>{formatNumber(preview.count)}</strong> سجلًا</p><p className="text-sm leading-7">النطاق: {preview.scope} · {title}</p><p className="text-sm leading-7">{preview.irreversible ? 'هذا الإجراء نهائي ولا يمكن التراجع عنه من لوحة الإدارة.' : 'سيُطبّق الإجراء على كامل التحديد المؤكد، وليس الصفحة الظاهرة فقط. أي تعارض يلغي العملية كاملة.'}</p>{preview.security && <label className="block text-sm leading-7">إجراء حساس: اكتب <strong>{preview.confirmation}</strong> للتأكيد<Input aria-label="نص تأكيد الإجراء الحساس" value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" /></label>}{bulk.error && <p role="alert" className="text-sm leading-7 text-red-700">{bulk.error}</p>}<div className="flex flex-wrap gap-3"><Button className="h-auto min-h-11 max-w-full whitespace-normal py-2" disabled={bulk.busy || preview.security && typed !== preview.confirmation} variant={preview.irreversible || preview.security ? 'destructive' : 'default'} onClick={execute}>تأكيد التنفيذ على {formatNumber(preview.count)} سجلًا</Button><Button variant="outline" disabled={bulk.busy} onClick={() => dialog.current?.close()}>إلغاء</Button></div></div>}
    </dialog>
  </section>;
}
