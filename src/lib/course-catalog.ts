import { westernDigits } from './format.ts';
export const VERIFIED_COURSE_MAPPINGS = [{ categoryId: 227, slug: 'uqu' }, { categoryId: 375, slug: 'imamu' }, { categoryId: 173, slug: 'jazanu' }, { categoryId: 118, slug: 'qu' }, { categoryId: 377, slug: 'pnu' }, { categoryId: 376, slug: 'kau' }, { categoryId: 378, slug: 'iau' }] as const;
export function catalogSearch(value: string) { return westernDigits(value).normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase().replace(/\s+/g, ' ').trim(); }
export function trustedCourseUrl(value: unknown, image = false): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try { const u = new URL(value); if (u.protocol !== 'https:' || !['estudy24.com', 'www.estudy24.com'].includes(u.hostname) || u.username || u.password || u.port || u.search || u.hash) return null;
    if (image && (!u.pathname.startsWith('/wp-content/uploads/') || !/\.(png|jpe?g|webp|gif|avif)$/i.test(u.pathname))) return null;
    return u.href;
  } catch { return null; }
}
// Never rendered as HTML: even malformed tags/entities become inert React text.
export function coursePlainText(html: string) {
  const names: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…' };
  return html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|iframe|object|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, entity: string) => {
    if (entity[0] !== '#') return names[entity.toLowerCase()] ?? all;
    const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)); return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ' ';
  }).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function courseDisplayTitle(title: string) { return westernDigits(title).replace(/\b(?:[a-z]{2,}\s*[-–]?\s*\d{2,}[a-z]?|\d{2,}\s*[-–]?\s*[a-z]{2,})\b/gi, '').replace(/(?:\d+[,.]?\d*\s*(?:ريال|ر\.س|SAR|USD|دولار)|[$€£]\s*\d+[,.]?\d*)/gi, '').replace(/\(\s*\)|[-–]\s*[-–]/g, ' ').replace(/\s+/g, ' ').replace(/^\s*[-–]|[-–]\s*$/g, '').trim() || 'شرح مادة جامعية'; }
export function courseSummary(value: string) { return westernDigits(value).split(/[.!؟\n]/).filter(part => !/(?:ريال|ر\.س|SAR|USD|دولار|اشتراك|السعر|تسريب|[$€£]|\b(?:[a-z]{2,}\s*[-–]?\s*\d{2,}|\d{2,}\s*[-–]?\s*[a-z]{2,})\b)/i.test(part)).join('. ').slice(0, 240).trim(); }
export function resolveCourseUniversity(categoryIds: number[], mappings: { categoryId: number; universityId: string; enabled: boolean }[]) {
  const ids = [...new Set(mappings.filter(m => m.enabled && categoryIds.includes(m.categoryId)).map(m => m.universityId))];
  return ids.length === 1 ? { universityId: ids[0], mappingState: 'mapped' } : { universityId: null, mappingState: ids.length ? 'ambiguous' : 'unknown' };
}
