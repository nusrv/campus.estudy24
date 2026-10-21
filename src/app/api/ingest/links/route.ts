import { handleContentIngestion } from '@/server/content-ingestion';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handleContentIngestion(request, 'links'); }
