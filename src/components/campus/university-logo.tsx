"use client";
import { useState } from 'react';
import { University } from 'lucide-react';
export function UniversityLogo({ url, name, className = 'h-16 w-28' }: { url: string | null; name: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border p-2 ${url === '/university-logos/uqu.png' ? 'bg-primary' : 'bg-white'} ${className}`}>{url && failedUrl !== url ? <img src={url} onError={() => setFailedUrl(url)} alt={`شعار ${name}`} referrerPolicy="no-referrer" className="size-full object-contain" loading="lazy" /> : <University className="size-8 text-primary" strokeWidth={1.4} aria-label={`شعار ${name} غير متاح`} />}</span>;
}
