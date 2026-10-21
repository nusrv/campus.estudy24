export function validExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')) return null;
    return url.href;
  } catch { return null; }
}
export function validTelegramUrl(value: string | null | undefined) {
  const normalized = validExternalUrl(value);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (url.protocol !== 'https:' || !['t.me', 'telegram.me'].includes(url.hostname) || url.port || url.search || url.hash) return null;
  // Public community/support usernames and invite codes only; no share/proxy/login endpoints.
  const path = url.pathname.replace(/\/$/, '');
  if (/^\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(path) && !/^\/(?:share|proxy|login|socks|iv|addstickers|joinchat|addlist|confirmphone|setlanguage)$/i.test(path)) return normalized;
  if (/^\/(?:\+[A-Za-z0-9_-]{10,128}|joinchat\/[A-Za-z0-9_-]{10,128})$/.test(path)) return normalized;
  return null;
}
