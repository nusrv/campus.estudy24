import { db } from '@/server/db';
import { publicCourseCatalog } from '@/server/course-catalog-service';
import { failure, json } from '@/server/http';
export async function GET(request: Request) { try { return json(await publicCourseCatalog(db, new URL(request.url).searchParams)); } catch (error) { return failure(error); } }
