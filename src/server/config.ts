import "server-only";
import { HttpError } from "./security";

export function authSecret() {
  const value = process.env.AUTH_SECRET || "";
  if (value.length < 32) throw new HttpError(503, "NOT_CONFIGURED", "Administration is not configured.");
  return value;
}
export function appUrl() {
  const value = process.env.APP_URL;
  if (!value) throw new HttpError(503, "NOT_CONFIGURED", "Application URL is not configured.");
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new HttpError(503, "NOT_CONFIGURED", "Production requires HTTPS.");
  return url.origin;
}
