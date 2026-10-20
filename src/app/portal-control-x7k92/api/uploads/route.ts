import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/server/auth";
import { db } from "@/server/db";
import { failure, json } from "@/server/http";
import { allowedUpload, HttpError } from "@/server/security";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    const max = Math.min(Number(process.env.MAX_UPLOAD_BYTES) || 5242880, 20 * 1024 * 1024);
    // Read a bounded stream before invoking multipart parsing (Content-Length is not trusted).
    if (!request.body) throw new HttpError(400, "FILE_REQUIRED", "A file is required.");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let count = 0;
    try { while (true) { const result = await reader.read(); if (result.done) break; count += result.value.byteLength; if (count > max + 16384) { await reader.cancel(); throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Upload exceeds the limit."); } chunks.push(result.value); } } finally { reader.releaseLock(); }
    const bounded = new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type") || "" }, body: Buffer.concat(chunks) });
    const form = await bounded.formData();
    const file = form.get("file");
    if (!(file instanceof File) || [...form.keys()].some(key => key !== "file") || form.getAll("file").length !== 1) throw new HttpError(400, "FILE_REQUIRED", "Upload exactly one file field.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = allowedUpload(file.name, file.type, bytes, max);
    const filename = `${randomUUID()}.${extension}`;
    const dir = path.resolve(process.env.UPLOAD_DIR || "storage/uploads");
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, filename);
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    try {
      const media = await db.$transaction(async tx => {
        const item = await tx.uploadedMedia.create({ data: { filename, originalName: file.name.replace(/[\u0000-\u001f]/g, "").slice(0, 200), mimeType: file.type, size: bytes.length } });
        await tx.auditLog.create({ data: { administratorId: auth.administratorId, action: "upload", entity: "media", entityId: item.id } });
        return item;
      });
      return json({ id: media.id, url: `/media/${media.id}`, mime_type: media.mimeType, size: media.size }, 201);
    } catch (error) { await unlink(target); throw error; }
  } catch (error) { return failure(error); }
}
