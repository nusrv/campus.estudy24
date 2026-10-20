import { constantEqual, tokenDigest } from "./security.ts";

export const VISIT_WINDOW_SECONDS = 1800;
export const VISITOR_COOKIE = "campus_visit";
export const DEFAULT_COUNTER_LABEL = "زيارات مجتمعنا الجامعي";
export function obviousBot(headers: Headers) {
  const ua = headers.get("user-agent") || "";
  return !ua || /bot|crawler|spider|slurp|headless|lighthouse|curl|wget|python-requests|node|undici|preview|facebookexternalhit/i.test(ua) || headers.get("purpose") === "prefetch" || headers.get("sec-purpose")?.includes("prefetch") === true;
}
export function visitorCookie(nonce: string, secret: string, now = Date.now()) {
  const payload = `${nonce}.${now}`;
  return `${payload}.${tokenDigest(`visitor-cookie:${payload}`, secret)}`;
}
export function readVisitorCookie(cookie: string, secret: string, now = Date.now()) {
  const match = cookie.match(/^([a-f0-9-]{36})\.(\d{13})\.([a-f0-9]{64})$/);
  if (!match) return null;
  const issued = Number(match[2]);
  if (issued > now || now - issued >= VISIT_WINDOW_SECONDS * 1000 || !constantEqual(match[3], tokenDigest(`visitor-cookie:${match[1]}.${match[2]}`, secret))) return null;
  return { nonce: match[1], issued };
}
export function publicBaseline(settings: { visitorBaseline: number; visitorBaselineVerified: boolean; visitorBaselineEvidence: string | null; visitorBaselineAsOf: Date | null; trackingStartedAt: Date }) {
  return settings.visitorBaseline > 0 && settings.visitorBaselineVerified && (settings.visitorBaselineEvidence?.trim().length || 0) >= 10 && settings.visitorBaselineAsOf && settings.visitorBaselineAsOf <= settings.trackingStartedAt ? settings.visitorBaseline : 0;
}
