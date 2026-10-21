import { createDatabase } from '../src/server/database-client.ts';
import { seedNewsCategories } from '../prisma/seed-news-categories.ts';
const db = createDatabase();
try { console.log(JSON.stringify(await db.$transaction(tx => seedNewsCategories(tx)))); }
finally { await db.$disconnect(); }
