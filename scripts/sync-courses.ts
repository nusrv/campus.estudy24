import { createDatabase } from '../src/server/database-client.ts';
import { syncCourseCatalog } from '../src/server/course-catalog-service.ts';
const db = createDatabase();
try { const result = await syncCourseCatalog(db); console.log(JSON.stringify({ runId: result.id, status: result.status, fetched: result.fetched, mapped: result.mapped, unknown: result.unknown, ambiguous: result.ambiguous, removed: result.removed })); }
catch (error) { const code = error && typeof error === 'object' && 'code' in error ? error.code : 'SYNC_FAILED'; if (['CATALOG_DISABLED', 'SYNC_RUNNING'].includes(String(code))) console.log(JSON.stringify({ event: 'course_catalog_sync_skipped', code })); else { console.error(JSON.stringify({ event: 'course_catalog_sync_failed', code })); process.exitCode = 1; } }
finally { await db.$disconnect(); }
