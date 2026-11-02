import { createDatabase } from '../src/server/database-client.ts';
import { finalizeDatabaseUrl, finalizeInstitutions, finalizeSummary, finalizeFailure } from '../src/server/institution-finalize.ts';
import { HttpError } from '../src/server/security.ts';

// Invoked only by the explicit npm script. Inherited Plesk variables take
// precedence over the ignored application-root .env loaded by Node's CLI flag.
let db: ReturnType<typeof createDatabase> | undefined;
try {
  if (process.argv.length !== 2) throw new HttpError(400, 'UNEXPECTED_ARGUMENTS', 'الأمر لا يقبل معاملات إضافية أو وضع تجربة. لم تُغيّر أي بيانات.');
  const connection = finalizeDatabaseUrl(process.env.DATABASE_URL);
  db = createDatabase(connection, false); // no raw ORM diagnostics or credentials
  const result = await finalizeInstitutions(db);
  console.log(finalizeSummary(result));
  process.exitCode = result.pendingFiles ? 3 : 0;
} catch (error) {
  const result = finalizeFailure(error); console.error(result.message); process.exitCode = result.exitCode;
} finally { if (db) await db.$disconnect(); }
