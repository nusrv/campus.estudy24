import { requireAdmin } from '@/server/auth';
import { json, failure } from '@/server/http';
import workflow from '../../../../../../docs/examples/n8n-uqu-workflow.json';
export async function GET(request: Request) {
  try { await requireAdmin(request); return json(workflow, 200, { 'Content-Disposition': 'attachment; filename="campus-uqu-n8n.json"' }); }
  catch (error) { return failure(error); }
}
