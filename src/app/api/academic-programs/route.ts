import { academicList } from '@/server/academic-programs';
import { db } from '@/server/db';
import { failure, json } from '@/server/http';
export async function GET(request: Request) {
  try { return json(await academicList(db, new URL(request.url).searchParams)); } catch (error) { return failure(error); }
}
