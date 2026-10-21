import Link from 'next/link';
import { newsCategoryHref } from '@/lib/news-categories';
import { cn } from '@/lib/utils';
import type { Query } from './content';
export function NewsCategoryFilters({ universitySlug, categories, query }: { universitySlug: string; categories: { slug: string; name: string }[]; query: Query }) {
  const selected = typeof query.category === 'string' ? query.category : '';
  return <nav aria-label="تصنيفات أخبار الجامعة" className="mb-5 flex gap-2 overflow-x-auto rounded-[18px] border border-border bg-white p-3">
    {[{ slug: '', name: 'الكل' }, ...categories].map(category => <Link key={category.slug} href={newsCategoryHref(universitySlug, category.slug || null, query)} aria-current={selected === category.slug ? 'page' : undefined} className={cn('shrink-0 rounded-xl px-4 py-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary', selected === category.slug ? 'bg-accent font-medium text-primary' : 'text-secondary-foreground hover:bg-muted')}>{category.name}</Link>)}
  </nav>;
}
