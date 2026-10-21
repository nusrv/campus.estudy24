import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/server/db";
import { activeAdsWhere, publishedArticleWhere } from "@/server/public-data";
import { failure } from "@/server/http";
import { HttpError } from "@/server/security";
import { id as idSchema } from "@/server/validation";
import { platformVisibility } from "@/server/content-policy";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const file = await db.uploadedMedia.findUnique({ where: { id } });
    if (!file || !/^[a-f0-9-]{36}\.(png|jpg|webp|pdf)$/.test(file.filename)) throw new HttpError(404, "NOT_FOUND", "Media not found.");
    const url = `/media/${id}`;
    const [university, article, ad, link, post] = await Promise.all([
      db.university.findFirst({ where: { enabled: true, logoUrl: url }, select: { id: true } }),
      db.article.findFirst({ where: { ...publishedArticleWhere, media: { some: { url } } }, select: { id: true } }),
      db.advertisement.findFirst({ where: { ...activeAdsWhere(), imageUrl: url, OR: [{ global: true }, { universities: { some: { university: { enabled: true } } } }] }, select: { id: true } }),
      db.managedLink.findFirst({ where: { active: true, status: "published", imageUrl: url, OR: [{ universityId: null }, { university: { enabled: true } }] }, select: { id: true } }),
      db.platformPost.findFirst({ where: { ...platformVisibility, coverImageUrl: url }, select: { id: true } }),
    ]);
    // Admin cookie is intentionally scoped to the private path, so unpublished files use the private preview route.
    if (!university && !article && !ad && !link && !post) throw new HttpError(404, "NOT_FOUND", "Media not available.");
    const data = await readFile(path.join(path.resolve(process.env.UPLOAD_DIR || "storage/uploads"), file.filename));
    return new Response(data, { headers: { "Content-Type": file.mimeType, "X-Content-Type-Options": "nosniff", "Content-Disposition": `${file.mimeType === "application/pdf" ? "attachment" : "inline"}; filename="${file.filename}"`, "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return failure(error); }
}
