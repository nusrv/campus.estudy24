import { seedNewsCategories } from "./seed-news-categories.ts";
import { createDatabase } from "../src/server/database-client.ts";
const db = createDatabase();
try {
  const university = await db.university.upsert({ where: { slug: "uqu" }, update: {}, create: { slug: "uqu", name: "جامعة أم القرى", description: "جامعة أم القرى في مكة المكرمة", websiteUrl: "https://uqu.edu.sa", city: "مكة المكرمة", region: "مكة المكرمة", enabled: true } });
  await db.ingestionSource.upsert({ where: { key: "uqu-rss" }, update: {}, create: { key: "uqu-rss", name: "أخبار جامعة أم القرى — RSS", url: "https://uqu.edu.sa/App/Rss", universityId: university.id } });
  await db.$transaction(tx => seedNewsCategories(tx));
  for (const [id, name] of [["homepage_banner", "بانر الرئيسية"], ["university_banner", "بانر الجامعة"], ["sidebar", "الشريط الجانبي"], ["between_news", "بين بطاقات الأخبار"], ["article_page", "صفحة الخبر"], ["footer", "التذييل"]]) await db.advertisementPlacement.upsert({ where: { id }, update: {}, create: { id, name } });
  await db.siteSettings.upsert({ where: { id: "main" }, create: { id: "main" }, update: {} });
  console.log("Seed completed. Existing records were preserved; no administrator was created.");
} finally { await db.$disconnect(); }
