"use client";
import { useEffect, useRef, useState } from "react";
import { UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";

type Summary = { enabled: boolean; count?: number; label?: string; includes_verified_baseline?: boolean };
export function VisitorCounter() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [display, setDisplay] = useState(0);
  const [error, setError] = useState(false);
  const once = useRef(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/visitors", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const initial = await response.json() as Summary;
        if (cancelled) return;
        setSummary(initial);
        if (!initial.enabled || once.current) return;
        once.current = true;
        let nonce = crypto.randomUUID();
        try { const stored = JSON.parse(sessionStorage.getItem("campus_visit_nonce") || "null"); if (stored && stored.expires > Date.now() && typeof stored.value === "string") nonce = stored.value; else sessionStorage.setItem("campus_visit_nonce", JSON.stringify({ value: nonce, expires: Date.now() + 1800000 })); } catch { /* HTTP-only server cookie still reduces duplicates when storage is disabled. */ }
        const tracked = await fetch("/api/visitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nonce }) });
        if (tracked.ok && !cancelled) { const result = await tracked.json() as Summary; if (typeof result.enabled === "boolean") setSummary(result); }
      } catch { if (!cancelled) setError(true); }
    }
    void load();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (summary?.count === undefined) return;
    const target = summary.count;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { const timer = setTimeout(() => setDisplay(target), 0); return () => clearTimeout(timer); }
    let frame: number;
    const started = performance.now();
    function tick(now: number) { const progress = Math.min(1, (now - started) / 900); setDisplay(Math.round(target * (1 - (1 - progress) ** 3))); if (progress < 1) frame = requestAnimationFrame(tick); }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [summary?.count]);
  if (summary && !summary.enabled) return null;
  return <Card className="mt-10 flex flex-wrap items-center justify-between gap-5 p-6"><div className="flex items-center gap-4"><span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary"><UsersRound className="size-5" /></span><div><h2 className="text-base font-medium">{summary?.label || "زيارات مجتمعنا الجامعي"}</h2><p className="mt-1 text-xs leading-7 text-secondary-foreground">{summary?.includes_verified_baseline ? "زيارات مسجّلة مع رصيد تاريخي موثّق." : "نموّ نعتز به، وزيارات تُسجّل باحترام الخصوصية."}</p></div></div><div>{error ? <span className="text-xs text-secondary-foreground">يتعذّر عرض العدد حاليًا</span> : summary?.count !== undefined ? <span dir="ltr" aria-label={`${summary.count.toLocaleString("ar-SA")} زيارة`} className="text-3xl font-medium tabular-nums text-primary">{display.toLocaleString("ar-SA")}</span> : <span className="block h-9 w-24 animate-pulse rounded-lg bg-muted" aria-label="جارٍ تحميل عدد الزيارات" />}</div></Card>;
}
