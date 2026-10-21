"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '@/lib/password-policy';
import { useAdmin } from './shell';
import { CONTROL_PATH } from './config';
type Administrator = { id: string; email: string; name: string; role: string; active: boolean };
export function Administrators({ initial, actorId }: { initial: Administrator[]; actorId: string }) {
  const { csrf } = useAdmin();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [editing, setEditing] = useState<Administrator | null>(null);
  async function mutate(path: string, method: string, data?: unknown) {
    setBusy(true); setMessage(''); setResetCode('');
    try {
      const response = await fetch(`${CONTROL_PATH}/api/administrators${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, ...(data ? { body: JSON.stringify(data) } : {}) });
      if (!response.ok) { setMessage('تعذّر تنفيذ العملية. تحقق من البيانات والصلاحيات. لا يمكن تعطيل آخر مالك نشط.'); return false; }
      const result = await response.json();
      if (result.token) setResetCode(result.token);
      setMessage(result.token ? 'رمز صالح لمدة 30 دقيقة ولمرة واحدة. سلّمه لصاحب الحساب عبر قناة آمنة مع رابط صفحة إعادة التعيين.' : 'تم حفظ التغييرات. قد يلزم تسجيل الدخول مجددًا للحساب المعدّل.');
      // Keep a self-reset code visible after its issuance revokes this session.
      if (!result.token) router.refresh();
      return true;
    } catch { setMessage('تعذّر الاتصال بالخادم.'); return false; }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (!editing && data.password !== data.confirmation) { setMessage('كلمتا المرور غير متطابقتين.'); return; }
    const payload = editing ? { name: data.name, email: data.email, active: data.active === 'on' } : data;
    if (await mutate(editing ? `/${editing.id}` : '', editing ? 'PATCH' : 'POST', payload)) { form.reset(); setEditing(null); }
  }
  return <div className="space-y-7"><div><h1 className="text-2xl font-medium">المشرفون</h1><p className="mt-3 text-sm leading-7 text-secondary-foreground">أضف محرّرين للمحتوى وأدر صلاحيات الوصول. إدارة الحسابات متاحة للمالك فقط.</p></div>
    <Card className="p-6"><h2 className="mb-5 text-lg font-medium">{editing ? 'تعديل الحساب' : 'إضافة محرّر'}</h2><form key={editing?.id || 'new'} onSubmit={save} className="grid gap-5 sm:grid-cols-2">
      <label className="text-sm">الاسم<Input name="name" required maxLength={200} defaultValue={editing?.name} autoComplete="off" className="mt-2" /></label>
      <label className="text-sm">البريد الإلكتروني<Input name="email" type="email" required maxLength={254} defaultValue={editing?.email} autoComplete="off" dir="ltr" className="mt-2" /></label>
      {editing ? <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={editing.active} />حساب نشط</label> : <>
        <label className="text-sm">كلمة المرور (8 أحرف على الأقل)<Input name="password" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" className="mt-2" /></label>
        <label className="text-sm">تأكيد كلمة المرور<Input name="confirmation" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" className="mt-2" /></label>
      </>}
      <div className="flex gap-3 sm:col-span-2"><Button disabled={busy}>{editing ? 'حفظ التعديل' : 'إضافة محرّر'}</Button>{editing && <Button type="button" variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>}</div>
    </form></Card>
    {message && <Card className="space-y-4 p-6"><p role="status" className="text-sm leading-7">{message}</p>{resetCode && <><code dir="ltr" className="block break-all rounded-xl bg-accent p-4 text-sm">{resetCode}</code><p className="text-xs">صفحة التعيين: <span dir="ltr">{CONTROL_PATH}/reset</span></p><Button variant="outline" onClick={() => setResetCode('')}>إخفاء الرمز</Button></>}</Card>}
    <div className="grid gap-4">{initial.map(admin => <Card key={admin.id} className="flex flex-wrap items-center justify-between gap-5 p-6"><div><h2 className="font-medium">{admin.name}</h2><p dir="ltr" className="my-2 text-sm text-secondary-foreground">{admin.email}</p><Badge variant="outline">{admin.role === 'owner' ? 'مالك' : 'محرّر'} · {admin.active ? 'نشط' : 'معطّل'}</Badge></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => setEditing(admin)}>تعديل</Button><Button variant="outline" size="sm" disabled={busy || !admin.active} onClick={() => { if (confirm('إبطال الجلسات وإصدار رمز إعادة تعيين لهذا الحساب؟')) void mutate(`/${admin.id}/reset`, 'POST'); }}>إعادة تعيين كلمة المرور</Button>{admin.id !== actorId && <><Button variant="outline" size="sm" disabled={busy} onClick={() => void mutate(`/${admin.id}`, 'PATCH', { email: admin.email, name: admin.name, active: !admin.active })}>{admin.active ? 'تعطيل' : 'تفعيل'}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => { if (confirm('حذف هذا الحساب نهائيًا؟ سيبقى سجل التدقيق.')) void mutate(`/${admin.id}`, 'DELETE'); }}>حذف</Button></>}</div></Card>)}</div>
  </div>;
}
