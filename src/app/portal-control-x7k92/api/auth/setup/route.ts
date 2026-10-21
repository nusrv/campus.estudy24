import { db } from '@/server/db';
import { appUrl, authSecret } from '@/server/config';
import { clientKey, rateLimit } from '@/server/rate-limit';
import { enforceOrigin, readJson } from '@/server/security';
import { authorizeBootstrap, createInitialOwner } from '@/server/administrator-service';
import { setupSchema } from '@/server/administrator-validation';
import { failure, json } from '@/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    enforceOrigin(request.headers, appUrl()); authSecret();
    await rateLimit('initial-setup', clientKey(request.headers), 5, 900);
    const input = setupSchema.parse(await readJson(request, 4096));
    authorizeBootstrap(input.bootstrapToken);
    await createInitialOwner(db, input);
    return json({ ok: true }, 201);
  } catch (error) { return failure(error); }
}
