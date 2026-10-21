"use client";
import { formatNumber } from "../../lib/format.ts";

import Link from "next/link";
import { TelegramLink } from "./telegram-link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpen, Menu, X, ArrowUpLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CampusHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = [{ href: "/", label: "الرئيسية" }, { href: "/universities", label: "دليل الجامعات" }, { href: "/articles?type=platform_news", label: "أخبار المنصة" }, { href: "/articles", label: "المعرفة والأدلة" }];
  return <header className="sticky top-0 z-40 border-b border-border bg-white"><div className="mx-auto flex min-h-20 max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-4 sm:px-8"><Link href="/" className="flex items-center gap-3" aria-label="eStudy24 Campus — الرئيسية"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white"><BookOpen className="size-6" strokeWidth={1.6} /></span><span><span dir="ltr" className="block text-[23px] font-medium leading-7">eStudy24<span className="text-primary">.</span></span><span className="block text-[10px] text-secondary-foreground">بوابتك للحياة الجامعية</span></span></Link><nav aria-label="التنقل الرئيسي" className="hidden items-center gap-1 md:flex">{links.map(link => <Link href={link.href} key={link.href} className={cn("rounded-xl px-4 py-2.5 text-[13px] transition-colors hover:bg-muted", pathname === link.href || link.href === "/universities" && pathname.startsWith("/universities/") ? "bg-accent text-primary" : "text-secondary-foreground")}>{link.label}</Link>)}</nav><Button asChild variant="outline" size="sm" className="hidden lg:inline-flex"><a href="https://estudy24.com" target="_blank" rel="noopener noreferrer">منصة eStudy24<ArrowUpLeft /></a></Button><Button size="icon" variant="ghost" className="md:hidden" aria-label="قائمة التنقل" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</Button>{open && <nav aria-label="التنقل على الجوال" className="flex w-full flex-col gap-1 border-t border-border pt-3 md:hidden">{links.map(link => <Link href={link.href} key={link.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm hover:bg-accent">{link.label}</Link>)}</nav>}</div></header>;
}

export function CampusFooter({ supportUrl }: { supportUrl?: string | null }) {
  return <footer className="mt-14 border-t border-border bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-8 sm:px-8"><div><Link href="/" dir="ltr" className="inline-block text-xl font-medium">eStudy24<span className="text-primary">.</span></Link><p className="mt-2 text-xs leading-7 text-secondary-foreground">معرفة أقرب، وحياة جامعية أوضح.</p></div><TelegramLink url={supportUrl} /><nav aria-label="روابط التذييل" className="flex flex-wrap gap-5 text-xs text-secondary-foreground"><Link href="/universities" className="hover:text-primary">الجامعات</Link><Link href="/articles" className="hover:text-primary">المقالات والأدلة</Link><a href="https://estudy24.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary">منصة eStudy24</a></nav><p className="text-[11px] text-secondary-foreground">© {formatNumber(new Date().getFullYear(), { useGrouping: false })} eStudy24</p></div></footer>;
}
