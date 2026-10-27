import { westernDigits } from './format.ts';
export const COURSE_SEARCH_LIMIT = 2000;
export const COURSE_SUMMARY_FALLBACK = 'شرح المادة متوفر على منصة eStudy24.';
export const VERIFIED_COURSE_MAPPINGS = [{ categoryId: 227, slug: 'uqu' }, { categoryId: 375, slug: 'imamu' }, { categoryId: 173, slug: 'jazanu' }, { categoryId: 118, slug: 'qu' }, { categoryId: 377, slug: 'pnu' }, { categoryId: 376, slug: 'kau' }, { categoryId: 378, slug: 'iau' }] as const;
export function catalogSearch(value: string) { return westernDigits(value).normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase().replace(/\s+/g, ' ').trim(); }
export function trustedCourseUrl(value: unknown, image = false): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try { const u = new URL(value); if (u.protocol !== 'https:' || !['estudy24.com', 'www.estudy24.com'].includes(u.hostname) || u.username || u.password || u.port || u.search || u.hash) return null;
    if (image && (!u.pathname.startsWith('/wp-content/uploads/') || !/\.(png|jpe?g|webp|gif|avif)$/i.test(u.pathname))) return null;
    return u.href;
  } catch { return null; }
}
export function resolveCourseUniversity(categoryIds: number[], mappings: { categoryId: number; universityId: string; enabled: boolean }[]) {
  const ids = [...new Set(mappings.filter(m => m.enabled && categoryIds.includes(m.categoryId)).map(m => m.universityId))];
  return ids.length === 1 ? { universityId: ids[0], mappingState: 'mapped' } : { universityId: null, mappingState: ids.length ? 'ambiguous' : 'unknown' };
}
