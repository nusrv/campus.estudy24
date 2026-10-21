import 'server-only';
import { db } from './db';
import { clientKey, rateLimit } from './rate-limit';
import { authenticateUniversityKey } from './university-keys';
import { HttpError, enforceApiKey } from './security';
export async function ingestionAuthentication(request: Request, scopedOnly = false) {
  await rateLimit('ingest-auth', clientKey(request.headers), 120, 60);
  const header = request.headers.get('authorization') || '';
  let credential;
  if (header.startsWith('Bearer campus_uak_')) credential = await authenticateUniversityKey(db, header.slice(7));
  else if (!scopedOnly && (process.env.INGEST_API_KEY || '').length >= 32) enforceApiKey(request.headers, process.env.INGEST_API_KEY!);
  else throw new HttpError(401, 'UNIVERSITY_KEY_REQUIRED', 'مفتاح API خاص بالجامعة مطلوب لهذا المسار.');
  await rateLimit('ingest', clientKey(request.headers), 60, 60);
  if (credential) await rateLimit('ingest-key', credential.keyId, 60, 60);
  return credential;
}
