import { seedNewsCategories } from './seed-news-categories.ts';
import type { PrismaClient } from '@prisma/client';
import { SAUDI_UNIVERSITIES, demoAdId } from './campus-seed-data.ts';
export async function seedCampus(db: PrismaClient) {
  return db.$transaction(async tx => {
    // Prevent concurrent seeds racing conditional fills/associations.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(214721, 793)`;
    await tx.advertisementPlacement.upsert({ where: { id: 'university_banner' }, update: {}, create: { id: 'university_banner', name: 'بانر الجامعة' } });
    await seedNewsCategories(tx);
    for (const data of SAUDI_UNIVERSITIES) {
      const university = await tx.university.upsert({ where: { slug: data.slug }, create: { ...data, enabled: true }, update: {} });
      // Existing institution fields, including deliberately cleared URLs, are Owner-managed.
      await tx.ingestionSource.upsert({ where: { key: `${data.slug}-rss` }, update: {}, create: { key: `${data.slug}-rss`, name: `تكامل n8n — ${data.name}`, url: data.slug === 'uqu' ? 'https://uqu.edu.sa/App/Rss' : data.websiteUrl, universityId: university.id } });
      await tx.advertisement.upsert({ where: { id: demoAdId(data.slug) }, update: {}, create: {
        id: demoAdId(data.slug), title: `إعلان تجريبي — eStudy24 مع مجتمع ${data.name}`,
        description: 'مساحة إعلانية تجريبية من eStudy24. استكشف بوابة جامعتك وروابطها في مكان واحد. هذا المثال لا يعلن عن دورة أو عرض تجاري.',
        destinationUrl: `https://campus.estudy24.com/universities/${data.slug}`, buttonText: 'استكشف بوابة الجامعة',
        global: false, placementId: 'university_banner', status: 'active', priority: 0,
        placementAssignments: { create: { placementId: 'university_banner' } },
        universities: { create: { universityId: university.id } },
      } });
    }
    return { universities: SAUDI_UNIVERSITIES.length, demoAdvertisements: SAUDI_UNIVERSITIES.length };
  }, { timeout: 30000 });
}
