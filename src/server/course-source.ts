import { z } from 'zod/v4';
import { coursePlainText, courseDisplayTitle, courseSummary, catalogSearch, trustedCourseUrl } from '../lib/course-catalog.ts';
export class CatalogSourceError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } }
const rendered = z.object({ rendered: z.string().max(500000), protected: z.boolean().optional() });
const wpId = z.number().int().positive().max(2147483647);
const courseSchema = z.object({ id: wpId, status: z.literal('publish'), title: rendered, content: rendered.optional(), excerpt: rendered.optional(), link: z.string(), slug: z.string().max(1000), modified_gmt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/), featured_media: z.number().int().nonnegative().max(2147483647).optional(), 'course-category': z.array(wpId).max(100), _embedded: z.record(z.string(), z.unknown()).optional() });
const categorySchema = z.object({ id: wpId, name: z.string().max(1000), slug: z.string().max(1000), parent: z.number().int().nonnegative().max(2147483647), count: z.number().int().nonnegative() });
export function parseCourse(value: unknown) {
  const c = courseSchema.parse(value), sourceTitle = coursePlainText(c.title.rendered).slice(0, 500), destinationUrl = trustedCourseUrl(c.link);
  const sourceModifiedAt = new Date(c.modified_gmt.endsWith('Z') ? c.modified_gmt : c.modified_gmt + 'Z');
  if (!sourceTitle || !destinationUrl || Number.isNaN(sourceModifiedAt.getTime()) || c.title.protected || c.content?.protected || c.excerpt?.protected) throw new CatalogSourceError('INVALID_COURSE');
  const media = z.array(z.object({ id: z.number().optional(), source_url: z.string().optional(), media_details: z.object({ sizes: z.record(z.string(), z.object({ source_url: z.string().optional() })).optional() }).optional() })).safeParse(c._embedded?.['wp:featuredmedia']);
  const featured = media.success ? media.data.find(m => !c.featured_media || m.id === c.featured_media) : undefined;
  const imageUrl = trustedCourseUrl(featured?.media_details?.sizes?.medium_large?.source_url, true) || trustedCourseUrl(featured?.media_details?.sizes?.medium?.source_url, true) || trustedCourseUrl(featured?.source_url, true);
  const description = courseSummary(coursePlainText(c.excerpt?.rendered || c.content?.rendered || ''));
  return { wordpressId: c.id, sourceTitle, title: courseDisplayTitle(sourceTitle), description, searchText: catalogSearch(sourceTitle), destinationUrl, imageUrl, categoryIds: [...new Set(c['course-category'])].sort((a,b) => a-b), sourceModifiedAt };
}
export type SourceCourse = ReturnType<typeof parseCourse>;
export type CatalogInventory = { courses: SourceCourse[]; categories: z.infer<typeof categorySchema>[] };
const FIELDS = 'id,title,excerpt,content,link,status,slug,modified_gmt,featured_media,course-category,_embedded,_links';
export async function fetchCatalogInventory(options: { fetcher?: typeof fetch; pause?: (ms: number) => Promise<void>; timeoutMs?: number; maxDurationMs?: number } = {}): Promise<CatalogInventory> {
  const fetcher = options.fetcher || fetch, pause = options.pause || (ms => new Promise(r => setTimeout(r, ms))), deadline = Date.now() + (options.maxDurationMs || 180000);
  async function page(resource: string, number: number) {
    const url = new URL(`https://estudy24.com/wp-json/wp/v2/${resource}`); url.search = new URLSearchParams({ per_page: '100', page: String(number), orderby: 'id', order: 'asc', ...(resource === 'courses' ? { status: 'publish', _embed: 'wp:featuredmedia', _fields: FIELDS } : { hide_empty: 'false', _fields: 'id,name,slug,parent,count' }) }).toString();
    for (let attempt = 0; attempt < 4; attempt++) {
      if (Date.now() >= deadline) throw new CatalogSourceError('SOURCE_DEADLINE');
      try {
        const r = await fetcher(url, { redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json', 'User-Agent': 'Campus-eStudy24-Catalog/1.0' }, signal: AbortSignal.timeout(Math.max(1, Math.min(options.timeoutMs || 20000, deadline - Date.now()))) });
        if ([429, 500, 502, 503, 504].includes(r.status)) { await r.body?.cancel(); if (attempt === 3) throw new CatalogSourceError('SOURCE_TEMPORARY'); const retry = Number(r.headers.get('retry-after')); await pause(Math.min(30000, Math.max(1000 * 2 ** attempt, Number.isFinite(retry) ? retry * 1000 : 0))); continue; }
        if (!r.ok) { await r.body?.cancel(); throw new CatalogSourceError(`SOURCE_HTTP_${r.status}`); }
        const pagesText = r.headers.get('x-wp-totalpages'), totalText = r.headers.get('x-wp-total');
        if (!pagesText || !totalText || !/^\d+$/.test(pagesText) || !/^\d+$/.test(totalText)) throw new CatalogSourceError('SOURCE_PAGINATION');
        const pages = Number(pagesText), total = Number(totalText); if (pages > 100 || total > 10000 || pages !== Math.ceil(total / 100)) throw new CatalogSourceError('SOURCE_LIMIT');
        const reader = r.body?.getReader(); if (!reader) throw new CatalogSourceError('SOURCE_EMPTY_BODY'); const chunks: Uint8Array[] = []; let size = 0;
        while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new CatalogSourceError('SOURCE_BODY_LIMIT'); } chunks.push(chunk.value); }
        let data: unknown; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new CatalogSourceError('SOURCE_JSON'); }
        if (!Array.isArray(data) || data.length !== (number < pages ? 100 : total - (number - 1) * 100)) throw new CatalogSourceError('SOURCE_INCOMPLETE');
        return { pages, total, data };
      } catch (error) { if (error instanceof CatalogSourceError) throw error; if (attempt === 3) throw new CatalogSourceError('SOURCE_NETWORK'); await pause(1000 * 2 ** attempt); }
    }
    throw new CatalogSourceError('SOURCE_NETWORK');
  }
  async function inventory(resource: string) {
    const first = await page(resource, 1), rows = [...first.data];
    // Sequential requests intentionally bound concurrency to one and keep source load low.
    for (let n = 2; n <= first.pages; n++) { await pause(200); const next = await page(resource, n); if (next.total !== first.total || next.pages !== first.pages) throw new CatalogSourceError('SOURCE_CHANGED'); rows.push(...next.data); }
    const ids = rows.map(r => z.object({ id: z.number().int().positive() }).parse(r).id);
    if (new Set(ids).size !== ids.length || rows.length !== first.total) throw new CatalogSourceError('SOURCE_DUPLICATES');
    // Recheck inventory boundaries after traversal: changed totals invalidate the whole stage.
    if (first.pages > 1) { const last = await page(resource, 1); if (last.total !== first.total || JSON.stringify(last.data) !== JSON.stringify(first.data)) throw new CatalogSourceError('SOURCE_CHANGED'); }
    return rows;
  }
  const categories = (await inventory('course-category')).map(v => categorySchema.parse(v));
  const courses = (await inventory('courses')).map(parseCourse);
  const known = new Set(categories.map(c => c.id)); if (courses.some(c => c.categoryIds.some(id => !known.has(id)))) throw new CatalogSourceError('SOURCE_CATEGORY_MISSING');
  return { categories, courses };
}
