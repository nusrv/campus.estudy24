"use client";
import { formatDateTime } from "../../lib/format.ts";

import { useBulkSelection, BulkToolbar, SelectionCheckbox } from "./bulk-selection";
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CONTROL_PATH } from './config';
import { useAdmin } from './shell';
import { ingestionExample } from '@/lib/ingestion-example';
type Key = { id: string; createdAt: string; revokedAt: string | null };
export function UniversityIntegration({ university, initialKeys, origin }: { university: { id: string; name: string; slug: string; websiteUrl: string | null; autoPublishNews: boolean }; initialKeys: Key[]; origin: string }) {
  const { csrf, role } = useAdmin();
  const [keys, setKeys] = useState(initialKeys);
  const [secret, setSecret] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const bulk = useBulkSelection('api-keys', { university: university.slug, revoked: 'false' }, keys.filter(key => !key.revokedAt).map(key => key.id));
  const payload = JSON.stringify(ingestionExample(university.slug, university.websiteUrl || 'https://example.edu.sa'), null, 2);
  const curl = `curl -X POST '${origin}/api/ingest/articles' \\\n  -H 'Authorization: Bearer YOUR_UNIVERSITY_API_KEY' \\\n  -H 'Content-Type: application/json' \\\n  --data-binary @article.json`;
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setMessage('تم النسخ.'); } catch { setMessage('تعذّر النسخ. يمكنك تحديد النص ونسخه يدويًا.'); } }
  async function manage(action: 'create' | 'rotate' | 'revoke') {
    if (action !== 'create' && !confirm('سيتم إلغاء المفتاح الحالي فورًا. هل تريد المتابعة؟')) return;
    setBusy(true); setSecret(''); setMessage('');
    try {
      const response = await fetch(`${CONTROL_PATH}/api/universities/${university.id}/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ action }) });
      if (!response.ok) { setMessage(response.status === 409 ? 'يوجد مفتاح نشط أو الجامعة معطّلة. حدّث الصفحة وتحقّق من الإعدادات.' : 'تعذّر إدارة المفتاح. تحقّق من الصلاحيات وحاول لاحقًا.'); return; }
      const body = await response.json(); setSecret(body.secret || '');
      setMessage(body.secret ? 'انسخ السر الآن إلى مخزن بيانات الاعتماد في n8n. لن يظهر مرة أخرى.' : 'تم إلغاء المفتاح.');
      const history = await fetch(`${CONTROL_PATH}/api/universities/${university.id}/keys`, { cache: 'no-store' });
      if (history.ok) setKeys(await history.json());
    } catch { setMessage('تعذّر الاتصال بالخادم.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6"><div><h1 className="text-2xl font-medium">تكامل n8n وAPI</h1><h2 className="mt-3 text-lg">{university.name}</h2><p className="mt-3 text-sm">النشر التلقائي للأخبار: {university.autoPublishNews ? "مفعّل للأخبار المستوفية للشروط" : "معطّل — المراجعة مطلوبة"}</p><p className="mt-3 text-sm text-secondary-foreground">الاسم المختصر: <code dir="ltr">{university.slug}</code></p><p className="mt-2 text-sm text-secondary-foreground">المعرّف الداخلي الثابت: <code dir="ltr">{university.id}</code></p></div>
    <Card className="space-y-4 p-6"><h2 className="text-lg font-medium">بيانات الاعتماد</h2>{role === 'owner' ? <><div className="flex flex-wrap gap-3"><Button disabled={busy || keys.some(key => !key.revokedAt)} onClick={() => manage('create')}>إنشاء مفتاح الجامعة</Button><Button variant="outline" disabled={busy || !keys.some(key => !key.revokedAt)} onClick={() => manage('rotate')}>استبدال المفتاح</Button><Button variant="outline" disabled={busy || !keys.some(key => !key.revokedAt)} onClick={() => manage('revoke')}>إلغاء المفتاح</Button></div><p role="status" className="text-sm leading-7">{message}</p>{secret && <div className="space-y-3 rounded-xl border border-border bg-accent p-4"><code dir="ltr" className="block break-all text-sm">{secret}</code><Button variant="outline" size="sm" onClick={() => copy(secret)}>نسخ السر</Button><Button variant="ghost" size="sm" onClick={() => setSecret('')}>إخفاء</Button></div>}<BulkToolbar bulk={bulk} total={keys.filter(key => !key.revokedAt).length} title={`مفاتيح ${university.name}`} onSuccess={async () => { setSecret(''); const response = await fetch(`${CONTROL_PATH}/api/universities/${university.id}/keys`, { cache: 'no-store' }); if (response.ok) setKeys(await response.json()); }} /><ul className="space-y-3 text-sm">{keys.map(key => <li key={key.id} className="border-t border-border pt-3">{!key.revokedAt && <SelectionCheckbox bulk={bulk} id={key.id} label={key.id} />} <code dir="ltr">{key.id}</code> · {key.revokedAt ? 'ملغى' : 'نشط'} · {formatDateTime(new Date(key.createdAt), { numberingSystem: 'latn', timeZone: 'Asia/Riyadh' })}</li>)}</ul></> : <p className="text-sm">إنشاء المفاتيح وإلغاؤها متاحان للمالك فقط. اطلب منه إعداد بيانات الاعتماد في n8n.</p>}</Card>
    <Card className="space-y-4 p-6"><h2 className="text-lg font-medium">إعداد عقدة HTTP Request في n8n</h2><ol className="list-inside list-decimal space-y-3 text-sm leading-8"><li>اختر POST، ثم أحد المسارين أدناه.</li><li>اختر Generic Credential Type ثم Header Auth. خزّن Authorization بقيمة Bearer ثم مسافة ثم مفتاح هذه الجامعة في بيانات الاعتماد، وليس في رابط الطلب.</li><li>اختر إرسال JSON واستخدم البيانات المحوّلة من المصدر. يجب أن يطابق university_slug هذه الجامعة.</li><li>اضبط source_key وفق مصدر الاستيراد المفعّل. حقل source_id هو معرّف الخبر الأصلي، وليس معرّف المصدر الداخلي.</li><li>تُنشر الأخبار تلقائيًا فقط إذا فعّل المالك ذلك للجامعة واجتاز الخبر فحوص الثقة. التخصصات الأكاديمية الجديدة تتبع خيار مصدرها المستقل؛ الأنواع الأخرى تتطلب المراجعة.</li></ol>{['articles', 'batch', 'links', 'events', 'calendar', 'programs'].map(endpoint => <div key={endpoint} className="flex flex-wrap items-center gap-3"><code dir="ltr" className="break-all text-sm">POST {origin}/api/ingest/{endpoint}</code><Button size="sm" variant="outline" onClick={() => copy(`${origin}/api/ingest/${endpoint}`)}>نسخ الرابط</Button></div>)}<p className="text-sm leading-7 text-secondary-foreground">لا ينفّذ الخادم أي جلب RSS. عناوين المصادر غير أم القرى هي نطاقات التحقق فقط؛ اضبط رابط RSS الحقيقي في n8n وتحقّق من تطابق نطاق روابط الأخبار مع مصدر الاستيراد.</p></Card>
    <Card className="space-y-4 p-6"><h2 className="text-lg font-medium">مثال JSON — استبدل بيانات الاختبار قبل الإرسال</h2><pre dir="ltr" className="overflow-auto rounded-xl bg-muted p-4 text-xs leading-6">{payload}</pre><Button variant="outline" size="sm" onClick={() => copy(payload)}>نسخ JSON</Button><pre dir="ltr" className="overflow-auto rounded-xl bg-muted p-4 text-xs leading-6">{curl}</pre><Button variant="outline" size="sm" onClick={() => copy(curl)}>نسخ الطلب</Button><Link href={`${CONTROL_PATH}/api-docs`} className="block text-sm text-primary">وثائق API والتكاملات</Link></Card>
  </div>;
}
