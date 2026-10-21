"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '@/lib/password-policy';
import { CONTROL_PATH } from './config';
export function AccountForm({ mode }: { mode: 'setup' | 'reset' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (data.password !== data.confirmation) { setMessage('كلمتا المرور غير متطابقتين.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${CONTROL_PATH}/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!response.ok) { setMessage(response.status === 429 ? 'محاولات كثيرة. حاول لاحقًا.' : 'تعذّر إتمام العملية. تحقّق من رمز التفويض والبيانات أو راجع مسؤول الخادم.'); return; }
      form.reset();
      setMessage(mode === 'setup' ? 'تم إنشاء المدير. يمكنك تسجيل الدخول الآن.' : 'تم تحديث كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.');
      router.replace(`${CONTROL_PATH}/login`); router.refresh();
    } catch { setMessage('تعذّر الاتصال بالخادم.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-5">
    {mode === 'setup' && <label className="block text-sm">الاسم<Input name="name" required maxLength={200} autoComplete="name" className="mt-2" /></label>}
    <label className="block text-sm">البريد الإلكتروني<Input name="email" type="email" required maxLength={254} autoComplete="username" dir="ltr" className="mt-2" /></label>
    <label className="block text-sm">{mode === 'setup' ? 'رمز التهيئة الخاص بالخادم' : 'رمز إعادة تعيين كلمة المرور'}<Input name={mode === 'setup' ? 'bootstrapToken' : 'token'} type="password" required minLength={32} maxLength={256} autoComplete="off" dir="ltr" className="mt-2" /></label>
    <label className="block text-sm">كلمة المرور الجديدة<Input name="password" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" dir="ltr" className="mt-2" /><span className="mt-1 block text-xs text-secondary-foreground">8 أحرف على الأقل.</span></label>
    <label className="block text-sm">تأكيد كلمة المرور<Input name="confirmation" type="password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" dir="ltr" className="mt-2" /></label>
    {message && <p role="status" className="text-sm leading-7">{message}</p>}
    <Button disabled={busy} className="w-full">{busy ? 'جارٍ الحفظ…' : mode === 'setup' ? 'إنشاء المدير الأول' : 'تحديث كلمة المرور'}</Button>
    {mode === 'reset' && <Link href={`${CONTROL_PATH}/login`} className="block text-center text-sm text-primary">العودة لتسجيل الدخول</Link>}
  </form>;
}
