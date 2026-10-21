import { createDatabase } from '../src/server/database-client.ts';
import { seedUniversityLogos } from '../prisma/seed-logos.ts';
const db = createDatabase();
try { console.log(JSON.stringify(await seedUniversityLogos(db))); }
finally { await db.$disconnect(); }
