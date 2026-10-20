import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/server/auth";
import { db } from "@/server/db";
import { failure } from "@/server/http";
import { HttpError } from "@/server/security";
import { id as idSchema } from "@/server/validation";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(request); const id = idSchema.parse((await context.params).id); const file = await db.uploadedMedia.findUnique({ where: { id } }); if (!file || !/^[a-f0-9-]{36}\.(png|jpg|webp|pdf)$/.test(file.filename)) throw new HttpError(404, "NOT_FOUND", "Media not found."); const data = await readFile(path.join(path.resolve(process.env.UPLOAD_DIR || "storage/uploads"), file.filename)); return new Response(data, { headers: { "Content-Type": file.mimeType, "Content-Disposition": `${file.mimeType === "application/pdf" ? "attachment" : "inline"}; filename="${file.filename}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; sandbox" } }); } catch (error) { return failure(error); }
}
