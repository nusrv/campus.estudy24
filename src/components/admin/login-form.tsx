"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTROL_PATH } from "./config";
export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try { const response = await fetch(`${CONTROL_PATH}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) }); if (!response.ok) { setError(response.status === 429 ? "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة." : response.status === 503 ? "الخدمة غير جاهزة. راجع إعدادات الخادم وقاعدة البيانات." : "تعذّر تسجيل الدخول. تحقّق من بياناتك."); return; } router.replace(CONTROL_PATH); router.refresh(); } catch { setError("تعذّر الاتصال بالخادم."); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-5"><div className="space-y-2"><label htmlFor="admin-email" className="text-sm">البريد الإلكتروني</label><Input id="admin-email" name="email" type="email" dir="ltr" autoComplete="username" maxLength={254} required /></div><div className="space-y-2"><label htmlFor="admin-password" className="text-sm">كلمة المرور</label><Input id="admin-password" name="password" type="password" dir="ltr" autoComplete="current-password" maxLength={256} required /></div>{error && <p role="alert" className="text-sm leading-7 text-red-700">{error}</p>}<Button className="w-full" type="submit" disabled={busy}>{busy ? "جارٍ التحقّق…" : "دخول الإدارة"}</Button></form>;
}
