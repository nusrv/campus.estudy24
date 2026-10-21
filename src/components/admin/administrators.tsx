"use client";
import { administratorRoles, administratorRoleLabel } from "@/lib/administrator-roles";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '@/lib/password-policy';
import { useAdmin } from './shell';
import { CONTROL_PATH } from './config';
type Administrator = { id: string; email: string; name: string; role: string; active: boolean; universityId?: string | null; university?: { name: string } | null };
export function Administrators({ initial, actorId, universities }: { initial: Administrator[]; actorId: string; universities: { id: string; name: string }[] }) {
  const { csrf } = useAdmin();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [editing, setEditing] = useState<Administrator | null>(null);
  const [role, setRole] = useState("editor");
  async function mutate(path: string, method: string, data?: unknown) {
    setBusy(true); setMessage(''); setResetCode('');
    try {
      const response = await fetch(`${CONTROL_PATH}/api/administrators${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, ...(data ? { body: JSON.stringify(data) } : {}) });
      const result = await response.json();
      if (!response.ok) {
        const messages: Record<string, string> = { INVALID_ASSIGNMENT: 'اختر جامعة موجودة ومفعّلة لسفير الجامعة فقط.', LAST_OWNER: 'يجب الإبقاء على مدير منصة نشط واحد على الأقل.', SELF_PROTECTION: 'لا يمكنك حذف حسابك أو تعطيله أو إلغاء دور مدير المنصة لنفسك.', CONFLICT: 'البريد الإلكتروني مسجّل لحساب آخر.', VALIDATION_ERROR: 'تحقق من البريد والاسم والدور والجامعة، ومن تطابق كلمة المرور وطولها: 8 أحرف على الأقل.', UNAUTHORIZED: 'انتهت الجلسة. سجّل الدخول مجددًا.' };
        setMessage(messages[result.error?.code] || 'تعذّر تنفيذ العملية. تحقق من البيانات والصلاحيات.'); return false;
      }
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
    const assignment = { role, universityId: role === "ambassador" ? data.universityId : null };
    const payload = editing ? { name: data.name, email: data.email, active: data.active === "on", ...assignment } : { ...data, ...assignment };
    if (await mutate(editing ? `/${editing.id}` : '', editing ? 'PATCH' : 'POST', payload)) { form.reset(); setEditing(null); setRole("editor"); }
  }
  return <div className="space-y-7"><div><h1 className="text-2xl font-medium">المشرفون</h1><p className="mt-3 text-sm leading-7 text-secondary-foreground">إدارة حسابات مديري المنصة والمحررين وسفراء الجامعات. السفير مسؤول عن محتوى جامعة واحدة فقط.</p></div>
    <Card className="p-6"><h2 className="mb-5 text-lg font-medium">{editing ? 'تعديل الحساب' : 'إضافة مشرف'}</h2><form key={editing?.id || 'new'} onSubmit={save} className="grid gap-5 sm:grid-cols-2">
      <label className="text-sm">الدور<select name="role" value={role} onChange={event => setRole(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3">{administratorRoles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      {role === 'ambassador' && <label className="text-sm">الجامعة المعيّنة<select name="universityId" required defaultValue={editing?.universityId || ''} className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3"><option value="">اختر جامعة واحدة</option>{universities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <label className="text-sm">الاسم<Input name="name" required maxLength={200} defaultValue={editing?.name} autoComplete="off" className="mt-2" /></label>
      <label className="text-sm">البريد الإلكتروني<Input name="email" type="email" required maxLength={254} defaultValue={editing?.email} autoComplete="off" dir="ltr" className="mt-2" /></label>
      {editing ? <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={editing.active} />حساب نشط</label> : <>
        <label className="text-sm">كلمة المرور (8 أحرف على الأقل)<Input name="password" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" className="mt-2" /></label>
        <label className="text-sm">تأكيد كلمة المرور<Input name="confirmation" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" className="mt-2" /></label>
      </>}
      <div className="flex gap-3 sm:col-span-2"><Button disabled={busy}>{editing ? 'حفظ التعديل' : 'إضافة مشرف'}</Button>{editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setRole("editor"); }}>إلغاء</Button>}</div>
    </form></Card>
    {message && <Card className="space-y-4 p-6"><p role="status" className="text-sm leading-7">{message}</p>{resetCode && <><code dir="ltr" className="block break-all rounded-xl bg-accent p-4 text-sm">{resetCode}</code><p className="text-xs">صفحة التعيين: <span dir="ltr">{CONTROL_PATH}/reset</span></p><Button variant="outline" onClick={() => setResetCode('')}>إخفاء الرمز</Button></>}</Card>}
    <div className="grid gap-4">{initial.map(admin => <Card key={admin.id} className="flex flex-wrap items-center justify-between gap-5 p-6"><div><h2 className="font-medium">{admin.name}</h2><p dir="ltr" className="my-2 text-sm text-secondary-foreground">{admin.email}</p><p className="mb-2 text-sm text-primary">{admin.university?.name}</p><Badge variant="outline">{administratorRoleLabel(admin.role)} · {admin.active ? 'نشط' : 'معطّل'}</Badge></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => { setEditing(admin); setRole(admin.role); }}>تعديل</Button><Button variant="outline" size="sm" disabled={busy || !admin.active} onClick={() => { if (confirm('إبطال الجلسات وإصدار رمز إعادة تعيين لهذا الحساب؟')) void mutate(`/${admin.id}/reset`, 'POST'); }}>إعادة تعيين كلمة المرور</Button>{admin.id !== actorId && <><Button variant="outline" size="sm" disabled={busy} onClick={() => void mutate(`/${admin.id}`, 'PATCH', { email: admin.email, name: admin.name, active: !admin.active })}>{admin.active ? 'تعطيل' : 'تفعيل'}</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => { if (confirm('حذف هذا الحساب نهائيًا؟ سيبقى سجل التدقيق.')) void mutate(`/${admin.id}`, 'DELETE'); }}>حذف</Button></>}</div></Card>)}</div>
  </div>;
}
