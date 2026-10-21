"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { BookOpen, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { adminSections, CONTROL_PATH } from "./config";

const AdminContext = createContext({ csrf: "", role: "" });
export const useAdmin = () => useContext(AdminContext);
export function AdminShell({ children, csrf, name, role }: { children: React.ReactNode; csrf: string; name: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    try { const response = await fetch(`${CONTROL_PATH}/api/auth/logout`, { method: "POST", headers: { "x-csrf-token": csrf } }); if (!response.ok) throw new Error(); router.replace(`${CONTROL_PATH}/login`); router.refresh(); } catch { setError("تعذّر تسجيل الخروج، يرجى المحاولة مجددًا."); }
  }
  return <AdminContext.Provider value={{ csrf, role }}><header className="border-b border-border bg-white"><div className="mx-auto flex min-h-20 max-w-[1480px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-10"><div className="flex items-center gap-3"><BookOpen className="size-7 text-primary" /><span className="text-2xl font-medium">eStudy24<span className="text-primary">.</span></span><span className="border-s border-border ps-4 text-sm text-secondary-foreground">إدارة المحتوى</span><Badge variant="outline">مساحة خاصة</Badge></div><div className="flex items-center gap-4"><span className="text-xs text-secondary-foreground">{name} · {role === "owner" ? "مدير" : "محرّر"}</span><Button size="sm" variant="outline" onClick={logout}><LogOut />خروج</Button><Button variant="ghost" size="icon" className="lg:hidden" aria-label="قائمة الإدارة" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</Button></div></div></header>{error && <p role="alert" className="p-4 text-center text-sm text-red-700">{error}</p>}<div className="mx-auto grid max-w-[1480px] gap-8 px-5 py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-10"><aside className={cn("lg:border-e lg:border-border lg:pe-6", !open && "max-lg:hidden")}><nav className="space-y-1" aria-label="أقسام الإدارة">{adminSections.filter(s => !["settings", "administrators", "platform-settings"].includes(s.key) || role === "owner").map(s => <Link key={s.key} href={`${CONTROL_PATH}${s.key ? `/${s.key}` : ""}`} onClick={() => setOpen(false)} aria-current={pathname === `${CONTROL_PATH}${s.key ? `/${s.key}` : ""}` ? "page" : undefined} className={cn("block rounded-xl px-4 py-3 text-sm transition-colors", pathname === `${CONTROL_PATH}${s.key ? `/${s.key}` : ""}` ? "bg-accent font-medium text-primary" : "text-secondary-foreground hover:bg-white")}>{s.title}</Link>)}</nav></aside><main className="min-w-0">{children}</main></div></AdminContext.Provider>;
}
