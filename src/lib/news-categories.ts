export const NEWS_CATEGORIES = [
  { name: 'أخبار عامة', slug: 'general' },
  { name: 'القبول والتسجيل', slug: 'admissions' },
  { name: 'الشؤون الأكاديمية', slug: 'academic' },
  { name: 'الدورات والتدريب', slug: 'training' },
  { name: 'المنح والفرص', slug: 'opportunities' },
  { name: 'الأنشطة والفعاليات', slug: 'activities' },
  { name: 'البحث والابتكار', slug: 'research' },
  { name: 'الخدمات الطلابية', slug: 'student-services' },
  { name: 'الإعلانات والقرارات', slug: 'announcements' },
] as const;
export function approvedNewsCategory(slug: string) { return NEWS_CATEGORIES.find(category => category.slug === slug); }
export function orderNewsCategories<T extends { slug: string }>(categories: T[]) {
  const rank = (slug: string) => { const index = NEWS_CATEGORIES.findIndex(category => category.slug === slug); return index < 0 ? NEWS_CATEGORIES.length : index; };
  return [...categories].sort((a, b) => rank(a.slug) - rank(b.slug));
}
export function newsCategoryHref(universitySlug: string, category: string | null, query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams({ section: 'news' });
  if (category) params.set('category', category);
  for (const field of ['search', 'from', 'to']) if (typeof query[field] === 'string' && query[field]) params.set(field, query[field]);
  return `/universities/${encodeURIComponent(universitySlug)}?${params}`;
}
