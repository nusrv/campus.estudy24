"use client";
import { administratorRoleLabel } from '@/lib/administrator-roles';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, useContext, useRef, useState } from 'react';
import { BookOpen, LogOut, Menu, X, ChevronDown, Home, GraduationCap, FileText, Megaphone, Plug, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { navigationForRole, activeNavigationKey } from '@/lib/admin-navigation';
import { CONTROL_PATH } from './config';
const AdminContext = createContext({ csrf: '', role: '' });
export const useAdmin = () => useContext(AdminContext);
const icons = [GraduationCap, FileText, Megaphone, Plug, Settings];
export function AdminShell({ children, csrf, name, role, universityName = '' }: { children: React.ReactNode; csrf: string; name: string; role: string; universityName?: string }) {
  const pathname = usePathname(), params = useSearchParams(), router = useRouter();
  const current = activeNavigationKey(pathname, params.get('view') === 'catalog', params.get('view') === 'mappings');
  const groups = navigationForRole(role);
  const currentGroup = groups.find(g => g.items.some(i => i.key === current))?.key;
  const [expanded, setExpanded] = useState<string[]>(currentGroup ? [currentGroup] : []);
  const [error, setError] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const [previousPage, setPreviousPage] = useState(current);
  if (previousPage !== current) { setPreviousPage(current); if (currentGroup && !expanded.includes(currentGroup)) setExpanded([...expanded, currentGroup]); }
  async function logout() {
    try { const response = await fetch(`${CONTROL_PATH}/api/auth/logout`, { method: 'POST', headers: { 'x-csrf-token': csrf } }); if (!response.ok) throw new Error(); router.replace(`${CONTROL_PATH}/login`); router.refresh(); }
    catch { setError('تعذّر تسجيل الخروج. حاول مجددًا.'); }
  }
  const linkClass = (active: boolean) => cn('block rounded-xl px-3 py-2.5 text-sm transition-colors', active ? 'bg-accent font-medium text-primary' : 'text-secondary-foreground hover:bg-white');
  function navigation(prefix: string) { return <div className="flex h-full min-h-0 flex-col gap-4"><nav className="min-h-0 flex-1 space-y-2 overflow-y-auto" aria-label="أقسام الإدارة">
    <Link href={CONTROL_PATH} onClick={() => drawer.current?.close()} aria-current={!current ? 'page' : undefined} className={cn(linkClass(!current), 'flex items-center gap-2')}><Home className="size-4" />الرئيسية</Link>
    {groups.map(group => { const Icon = icons[['institutions','content','marketing','integrations','administration'].indexOf(group.key)]; const isOpen = expanded.includes(group.key); return <div key={group.key}>
      <button type="button" aria-expanded={isOpen} aria-controls={`${prefix}-${group.key}`} onClick={() => setExpanded(old => isOpen ? old.filter(key => key !== group.key) : [...old, group.key])} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start text-sm font-medium hover:bg-white"><Icon className="size-4 text-secondary-foreground" /><span className="flex-1">{group.title}</span><ChevronDown className={cn('size-4 transition-transform', isOpen && 'rotate-180')} /></button>
      <div id={`${prefix}-${group.key}`} hidden={!isOpen} className="ms-5 space-y-1 border-s border-border ps-2">{group.items.map(item => <Link key={item.key} href={`${CONTROL_PATH}/${item.key}`} onClick={() => drawer.current?.close()} aria-current={current === item.key ? 'page' : undefined} className={linkClass(current === item.key)}>{item.title}</Link>)}</div>
    </div>; })}</nav><Button variant="outline" onClick={logout} className="w-full shrink-0 justify-start"><LogOut />تسجيل الخروج</Button></div>; }
  return <AdminContext.Provider value={{ csrf, role }}><header className="border-b border-border bg-white"><div className="mx-auto flex min-h-16 max-w-[1480px] items-center justify-between gap-3 px-4 lg:px-8"><div className="flex items-center gap-2"><BookOpen className="size-6 text-primary" /><span className="text-xl font-medium">eStudy24<span className="text-primary">.</span></span></div><div className="flex items-center gap-3"><span className="max-w-[30vw] truncate text-xs text-secondary-foreground" title={name}>{name} · {administratorRoleLabel(role)}</span><Button size="icon" variant="ghost" className="lg:hidden" aria-label="قائمة الإدارة" aria-haspopup="dialog" aria-controls="admin-drawer" aria-expanded={mobileOpen} onClick={() => { drawer.current?.showModal(); setMobileOpen(true); }}><Menu /></Button></div></div></header>
    {error && <p role="alert" className="p-3 text-center text-sm text-red-700">{error}</p>}
    <div className="mx-auto grid max-w-[1480px] gap-6 px-4 py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8"><aside className="sticky top-6 hidden h-[calc(100dvh-112px)] border-e border-border pe-4 lg:block">{navigation('desktop')}</aside><main className="min-w-0">{universityName && <p className="mb-4 rounded-xl border border-border bg-white p-3 text-sm font-medium text-primary">{universityName}</p>}{children}</main></div>
    <dialog id="admin-drawer" ref={drawer} onClose={() => setMobileOpen(false)} aria-label="قائمة الإدارة" className="m-0 me-auto h-dvh max-h-dvh w-[min(320px,90vw)] max-w-none border-0 bg-background p-4 backdrop:bg-black/30"><div className="flex h-full flex-col gap-4"><div className="flex items-center justify-between"><span className="font-medium">الإدارة</span><Button size="icon" variant="ghost" aria-label="إغلاق القائمة" onClick={() => drawer.current?.close()}><X /></Button></div><div className="min-h-0 flex-1">{navigation('mobile')}</div></div></dialog>
  </AdminContext.Provider>;
}
