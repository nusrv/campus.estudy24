import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "../lib/password-policy.ts";

export const ADMIN_PATH = "/portal-control-x7k92";
export const SESSION_COOKIE = "portal_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_BATCH_SIZE = 50;

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
export function constantEqual(a: string, b: string) {
  const first = createHash("sha256").update(a).digest();
  const second = createHash("sha256").update(b).digest();
  return timingSafeEqual(first, second);
}
export function tokenDigest(token: string, secret: string) { return createHmac("sha256", secret).update(token).digest("hex"); }
export function csrfToken(tokenHash: string, secret: string) { return tokenDigest(`csrf:${tokenHash}`, secret); }
export function newToken() { return randomBytes(32).toString("base64url"); }

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, result) => err ? reject(err) : resolve(result)));
}
export async function hashPassword(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) throw new Error("Password must contain 8–256 characters.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt:32768:8:1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split(":");
  if (password.length > 256 || parts.length !== 6 || parts.slice(0, 4).join(":") !== "scrypt:32768:8:1" || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
  const actual = await derive(password, parts[4]);
  return timingSafeEqual(actual, Buffer.from(parts[5], "hex"));
}

export function enforceOrigin(headers: Headers, appUrl: string) {
  const origin = headers.get("origin");
  const site = headers.get("sec-fetch-site");
  if (!origin || origin !== new URL(appUrl).origin || (site && site !== "same-origin" && site !== "none")) throw new HttpError(403, "CSRF_REJECTED", "Request origin is not permitted.");
}
export function enforceCsrf(headers: Headers, tokenHash: string, secret: string) {
  if (!constantEqual(headers.get("x-csrf-token") || "", csrfToken(tokenHash, secret))) throw new HttpError(403, "CSRF_REJECTED", "Invalid CSRF token.");
}
export function enforceApiKey(headers: Headers, configured: string) {
  if (configured.length < 32) throw new HttpError(503, "NOT_CONFIGURED", "Ingestion is not configured.");
  const authorization = headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ") || !constantEqual(authorization.slice(7), configured)) throw new HttpError(401, "UNAUTHORIZED", "A valid ingestion API key is required.");
}
export function authorizeRole(role: string, allowed: readonly string[]) {
  if (!allowed.includes(role)) throw new HttpError(403, "FORBIDDEN", "Insufficient permissions.");
}

export async function readJson(request: Request, limit = MAX_BODY_BYTES): Promise<unknown> {
  if ((request.headers.get("content-type") || "").split(";")[0].trim() !== "application/json") throw new HttpError(415, "JSON_REQUIRED", "Content-Type must be application/json.");
  const statedLength = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(statedLength) || statedLength > limit) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request exceeds the size limit.");
  if (!request.body) throw new HttpError(400, "INVALID_JSON", "A JSON body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request exceeds the size limit."); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new HttpError(400, "INVALID_JSON", "Malformed JSON body."); }
  } finally { reader.releaseLock(); }
}

export function allowedUpload(filename: string, mime: string, bytes: Uint8Array, maxBytes: number) {
  const lower = filename.toLowerCase();
  const buffer = Buffer.from(bytes);
  const type = mime.toLowerCase();
  if (!bytes.length || bytes.length > maxBytes) throw new HttpError(413, "INVALID_FILE_SIZE", "File is empty or exceeds the upload limit.");
  const png = lower.endsWith(".png") && type === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg = /\.jpe?g$/.test(lower) && type === "image/jpeg" && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp = lower.endsWith(".webp") && type === "image/webp" && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  const pdf = lower.endsWith(".pdf") && type === "application/pdf" && buffer.toString("ascii", 0, 5) === "%PDF-";
  if (!png && !jpg && !webp && !pdf) throw new HttpError(415, "INVALID_FILE_TYPE", "Only verified PNG, JPEG, WebP and PDF files are accepted.");
  return png ? "png" : jpg ? "jpg" : webp ? "webp" : "pdf";
}
