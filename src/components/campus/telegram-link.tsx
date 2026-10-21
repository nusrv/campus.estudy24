import { validTelegramUrl } from '@/lib/external-links';
export function TelegramIcon({ className = 'size-5' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}><path d="M21.9 4.6 18.7 20c-.24 1.1-.88 1.37-1.78.85l-4.88-3.6-2.35 2.26c-.26.26-.48.48-.98.48l.35-4.96L18.1 6.6c.4-.35-.1-.55-.62-.2L6.3 13.45l-4.82-1.51c-1.04-.32-1.06-1.04.22-1.54L20.55 3.1c.87-.32 1.62.2 1.35 1.5Z" /></svg>;
}
export function TelegramLink({ url, universityName }: { url: string | null | undefined; universityName?: string }) {
  const href = validTelegramUrl(url);
  if (!href) return null;
  return <div className="space-y-2"><a href={href} target="_blank" rel="noopener noreferrer external" className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-primary hover:bg-accent"><TelegramIcon /><span>{universityName ? `مجتمع طلاب ${universityName} | eStudy24` : 'الدعم الفني لمنصة eStudy24 عبر تيليجرام'}</span></a>{universityName && <p className="text-xs leading-7 text-secondary-foreground">مجتمع طلابي تديره منصة eStudy24، وغير تابع للإدارة الرسمية للجامعة.</p>}</div>;
}
