import type { Prisma } from '@prisma/client';
import { NEWS_CATEGORIES } from '../src/lib/news-categories.ts';
// Only known factory defaults may be renamed. Unique slug upserts retain IDs and relations.
export async function seedNewsCategories(db: Pick<Prisma.TransactionClient, 'articleCategory'>) {
  for (const category of NEWS_CATEGORIES) {
    await db.articleCategory.upsert({ where: { slug: category.slug }, create: category, update: {} });
    const factoryNames: string[] = [category.slug];
    if (category.slug === 'general') factoryNames.push('عام');
    if (category.slug === 'training') factoryNames.push('تدريب');
    await db.articleCategory.updateMany({ where: { slug: category.slug, name: { in: factoryNames } }, data: { name: category.name } });
  }
  return { approvedCategories: NEWS_CATEGORIES.length };
}
