import { db } from '@/server/db';
import { appUrl, authSecret } from '@/server/config';
import { clientKey, rateLimit } from '@/server/rate-limit';
import { enforceOrigin, readJson } from '@/server/security';
import { redeemPasswordReset } from '@/server/administrator-service';
import { resetSchema } from '@/server/administrator-validation';
import { failure, json } from '@/server/http';
export async function POST(request: Request) {
  try {
    enforceOrigin(request.headers, appUrl());
    await rateLimit('password-reset', clientKey(request.headers), 5, 900);
    const input = resetSchema.parse(await readJson(request, 4096));
    await redeemPasswordReset(db, input, authSecret());
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
