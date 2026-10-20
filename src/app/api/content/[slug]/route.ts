import { platformDetail } from "@/server/platform-data";
import { slug as slugSchema } from "@/server/validation";
import { HttpError } from "@/server/security";
import { failure, json } from "@/server/http";
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) { try { const post = await platformDetail(slugSchema.parse((await context.params).slug)); if (!post) throw new HttpError(404, "NOT_FOUND", "Content not found."); return json(post); } catch (error) { return failure(error); } }
