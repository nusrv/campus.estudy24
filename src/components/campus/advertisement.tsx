"use client";
import { useEffect, useRef } from "react";
import { ArrowUpLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type PublicAdvertisement = { id: string; title: string; description: string; imageUrl: string | null; destinationUrl: string; buttonText: string; tracking_day: string; tracking_token: string };
export function Advertisement({ ad }: { ad: PublicAdvertisement }) {
  const container = useRef<HTMLDivElement>(null);
  const recorded = useRef(false);
  function track(type: "impression" | "click") { void fetch(`/api/ads/${ad.id}/track`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, day: ad.tracking_day, token: ad.tracking_token }), keepalive: true }).catch(() => {}); }
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting) && !recorded.current) { recorded.current = true; void fetch(`/api/ads/${ad.id}/track`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "impression", day: ad.tracking_day, token: ad.tracking_token }), keepalive: true }).catch(() => {}); } }, { threshold: 0.5 });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [ad.id, ad.tracking_day, ad.tracking_token]);
  return <div ref={container}><Card className="my-6 flex flex-wrap items-center gap-5 border-[#cfe7dd] bg-[#f1f8f5] p-6">{ad.imageUrl && <img src={ad.imageUrl} referrerPolicy="no-referrer" alt="" className="h-24 w-32 rounded-xl object-cover" loading="lazy" />}<div className="min-w-48 flex-1"><Badge variant="outline" className="mb-2">إعلان · eStudy24</Badge><h2 className="text-lg font-medium leading-8">{ad.title}</h2><p className="mt-2 text-sm leading-[1.9] text-secondary-foreground">{ad.description}</p></div><Button asChild size="sm"><a href={ad.destinationUrl} target="_blank" rel="sponsored noopener noreferrer" onClick={() => track("click")}>{ad.buttonText}<ArrowUpLeft /></a></Button></Card></div>;
}
