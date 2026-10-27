import { createDatabase } from '../src/server/database-client.ts';
import { seedCourseMappings } from '../src/server/course-catalog-service.ts';
const db = createDatabase();
try { console.log(JSON.stringify(await seedCourseMappings(db))); } finally { await db.$disconnect(); }
