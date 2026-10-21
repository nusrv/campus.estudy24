import { createHash } from 'node:crypto';
import { constantEqual, HttpError } from './security.ts';
export const apiKeyHash = (secret: string) => createHash('sha256').update(secret).digest('hex');
export const keyMatches = (secret: string, digest: string) => constantEqual(apiKeyHash(secret), digest);
export function requireUniversityScope(actualSlug: unknown, expectedSlug: string) {
  if (actualSlug !== expectedSlug) throw new HttpError(403, 'UNIVERSITY_SCOPE_MISMATCH', 'هذا المفتاح مخوّل لجامعة واحدة فقط.');
}
