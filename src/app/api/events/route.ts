import { publicList } from "@/server/public-data";
import { failure, json } from "@/server/http";
export async function GET(request: Request) { try { return json(await publicList("events", new URL(request.url).searchParams)); } catch (error) { return failure(error); } }
