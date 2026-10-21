import { ArrowUpLeft } from 'lucide-react';
import { validExternalUrl } from '@/lib/external-links';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
export function OfficialWebsiteLink({ url, compact = false }: { url: string | null; compact?: boolean }) {
  const href = validExternalUrl(url);
  if (!href) return null;
  // A native anchor is its own hit target; no nested control or JavaScript popup handler.
  return <a data-official-website href={href} target="_blank" rel="noopener noreferrer external" aria-label="الموقع الرسمي للجامعة — يفتح في علامة تبويب جديدة" className={cn('relative z-10 inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4', compact ? 'px-2 py-2 text-xs text-secondary-foreground hover:text-primary' : buttonVariants({ variant: 'outline', size: 'sm' }))}>الموقع الرسمي<ArrowUpLeft aria-hidden="true" className="pointer-events-none size-3.5" /></a>;
}
