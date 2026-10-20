import { handleIngestion } from "@/server/ingestion";
export const runtime = "nodejs";
export async function POST(request: Request) { return handleIngestion(request, true); }
