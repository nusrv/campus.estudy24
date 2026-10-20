import "server-only";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod/v4";
import { HttpError } from "./security";

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
}
export function failure(error: unknown, requestId = randomUUID()) {
  if (error instanceof HttpError) return json({ error: { code: error.code, message: error.message }, request_id: requestId }, error.status);
  if (error instanceof ZodError) return json({ error: { code: "VALIDATION_ERROR", message: "Invalid input.", fields: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) }, request_id: requestId }, 422);
  const prismaCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (prismaCode === "P2002") return json({ error: { code: "CONFLICT", message: "A record with that unique value already exists." }, request_id: requestId }, 409);
  if (prismaCode === "P2025") return json({ error: { code: "NOT_FOUND", message: "Record not found." }, request_id: requestId }, 404);
  if (prismaCode === "P2003") return json({ error: { code: "INVALID_REFERENCE", message: "A referenced record is invalid or still in use." }, request_id: requestId }, 409);
  // Do not log bodies, credentials, database URLs, or raw exception messages.
  console.error(JSON.stringify({ event: "request_failed", requestId, code: prismaCode || "INTERNAL_ERROR" }));
  return json({ error: { code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable." }, request_id: requestId }, 503);
}
