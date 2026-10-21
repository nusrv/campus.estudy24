import { createDatabase } from '../src/server/database-client.ts';
import { seedCampus } from '../prisma/seed-campus.ts';
const db = createDatabase();
try { console.log(JSON.stringify(await seedCampus(db))); }
finally { await db.$disconnect(); }
