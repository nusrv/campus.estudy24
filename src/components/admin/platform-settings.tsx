"use client";
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { validTelegramUrl } from '@/lib/external-links';
import { CONTROL_PATH } from './config';
import { useAdmin } from './shell';
export function PlatformSettings({ initialUrl }: { initialUrl: string | null }) {
  const { csrf } = useAdmin();
  const [url, setUrl] = useState(initialUrl || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault(); setMessage('');
    if (url.trim() && !validTelegramUrl(url.trim())) { setMessage('أدخل رابط تيليجرام آمنًا، مثل https://t.me/username، أو اترك الحقل فارغًا لإخفائه.'); return; }
    setBusy(true);
    try { const result = await fetch(`${CONTROL_PATH}/api/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ telegramSupportUrl: url.trim() || null }) }); setMessage(result.ok ? 'تم حفظ رابط دعم المنصة.' : 'تعذّر حفظ الإعداد. تحقّق من الجلسة والرابط.'); }
    catch { setMessage('تعذّر الاتصال بالخادم.'); }
    finally { setBusy(false); }
  }
  return <div className="max-w-2xl space-y-6"><h1 className="text-2xl font-medium">إعدادات المنصة</h1><Card className="p-6"><form onSubmit={save} className="space-y-5"><label htmlFor="telegram-support" className="block text-sm">الدعم الفني لمنصة eStudy24 عبر تيليجرام</label><Input id="telegram-support" type="url" dir="ltr" maxLength={300} value={url} onChange={event => setUrl(event.target.value)} /><p className="text-xs leading-7 text-secondary-foreground">رابط دعم المنصة مستقل عن مجتمعات الجامعات. اتركه فارغًا لإخفائه من التذييل.</p>{message && <p role="status" className="text-sm leading-7">{message}</p>}<Button disabled={busy}>حفظ</Button></form></Card></div>;
}
