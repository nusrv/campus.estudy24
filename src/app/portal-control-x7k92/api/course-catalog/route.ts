import { requireAdmin } from '@/server/auth';
import { db } from '@/server/db';
import { failure, json } from '@/server/http';
import { readJson } from '@/server/security';
import { rateLimit } from '@/server/rate-limit';
import { manageCatalog } from '@/server/course-catalog-service';
export async function POST(request: Request) {
  try { const auth = await requireAdmin(request, ['owner']); await rateLimit('course-catalog-management', auth.administratorId, 15, 60);
    return json(await manageCatalog(db, { id: auth.administratorId, sessionId: auth.id }, await readJson(request)));
  } catch (error) { return failure(error); }
}
