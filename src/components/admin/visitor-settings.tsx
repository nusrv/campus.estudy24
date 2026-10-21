"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatVisits } from '@/lib/visitor-counter';
import { CONTROL_PATH } from './config';
import { useAdmin } from './shell';
export function VisitorSettings({ initial, tracked }: { initial: { visitorStartingValue: number }; tracked: number }) {
  const { csrf } = useAdmin();
  const [value, setValue] = useState(String(initial.visitorStartingValue));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault(); setMessage(''); setError('');
    const number = Number(value);
    if (!value.trim() || !Number.isSafeInteger(number) || number < 0 || number > 2147483647) { setError('أدخل عددًا صحيحًا من 0 إلى 2,147,483,647.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`${CONTROL_PATH}/api/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ visitorStartingValue: number }) });
      const body = await response.json();
      if (!response.ok) { setError(response.status === 422 ? body.error?.fields?.map((field: { message: string }) => field.message).join(' — ') || 'القيمة غير صالحة.' : 'تعذّر حفظ القيمة. تحقّق من صلاحية الجلسة وحاول مجددًا.'); return; }
      setValue(String(body.visitorStartingValue)); setMessage('تم حفظ القيمة الابتدائية دون تغيير الزيارات المسجّلة.');
    } catch { setError('تعذّر الاتصال بالخادم. حاول مجددًا.'); }
    finally { setBusy(false); }
  }
  return <div className="max-w-2xl space-y-6"><h1 className="text-2xl font-medium">عدّاد زيارات البوابة</h1><p className="text-sm leading-8 text-secondary-foreground">الزيارات الجديدة المسجّلة: <span dir="ltr" className="font-medium text-primary">{formatVisits(tracked)}</span>. العدد الظاهر يجمع القيمة الابتدائية والزيارات الجديدة. هذه القيمة يحددها المسؤول ولا تمثّل إحصاءات مستقلة موثّقة.</p><Card><CardContent><form onSubmit={save} className="space-y-5"><label htmlFor="visitor-starting-value" className="block text-sm">القيمة الابتدائية لعداد الزيارات</label><Input id="visitor-starting-value" type="number" min={0} max={2147483647} step={1} required dir="ltr" value={value} onChange={event => setValue(event.target.value)} />{error && <p role="alert" className="text-sm leading-7 text-red-700">{error}</p>}{message && <p role="status" className="text-sm leading-7 text-primary">{message}</p>}<Button disabled={busy} type="submit">حفظ</Button></form></CardContent></Card></div>;
}
