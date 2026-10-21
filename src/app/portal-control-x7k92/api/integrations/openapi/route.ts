import { requireAdmin } from '@/server/auth';
import { appUrl } from '@/server/config';
import { json, failure } from '@/server/http';
import specification from '../../../../../../docs/api/ingestion.openapi.json';
export async function GET(request: Request) {
  try { await requireAdmin(request); return json({ ...specification, servers: [{ url: appUrl() }] }, 200, { 'Content-Disposition': 'attachment; filename="campus-ingestion.openapi.json"' }); }
  catch (error) { return failure(error); }
}
