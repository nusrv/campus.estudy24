import { handleAcademicIngestion } from '@/server/academic-ingestion';
export const runtime = 'nodejs';
export async function POST(request: Request) { return handleAcademicIngestion(request); }
