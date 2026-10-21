import { requireAdmin } from '@/server/auth';
import { json, failure } from '@/server/http';
import workflow from '../../../../../../docs/examples/n8n-uqu-workflow.json';
import links from '../../../../../../docs/examples/n8n-links-workflow.json';
import events from '../../../../../../docs/examples/n8n-events-workflow.json';
import calendar from '../../../../../../docs/examples/n8n-calendar-workflow.json';
import programs from '../../../../../../docs/examples/n8n-programs-workflow.json';
const examples = { articles: workflow, links, events, calendar, programs };
export async function GET(request: Request) {
  try { await requireAdmin(request, ["owner", "editor"]); const type = new URL(request.url).searchParams.get('type') || 'articles'; if (!Object.hasOwn(examples, type)) return json({ error: { code: 'UNKNOWN_CONTENT_TYPE', message: 'نوع المحتوى غير معروف.' } }, 422); return json(examples[type as keyof typeof examples], 200, { 'Content-Disposition': `attachment; filename="campus-${type}-n8n.json"` }); }
  catch (error) { return failure(error); }
}
