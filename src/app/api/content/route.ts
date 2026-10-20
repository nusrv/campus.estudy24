import { platformPage } from "@/server/platform-data";
import { failure, json } from "@/server/http";
export async function GET(request: Request) { try { return json(await platformPage(new URL(request.url).searchParams)); } catch (error) { return failure(error); } }
