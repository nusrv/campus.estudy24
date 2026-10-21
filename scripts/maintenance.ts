import { createDatabase } from "../src/server/database-client.ts";
const db = createDatabase();
try {
  const [sessions, buckets, logs] = await db.$transaction([
    db.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    db.ingestionLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } } }),
  ]);
  const visits = await db.visitDedup.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.adminPasswordReset.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  console.log(JSON.stringify({ expiredSessions: sessions.count, expiredRateBuckets: buckets.count, oldIngestionLogs: logs.count, expiredVisitTokens: visits.count }));
} finally { await db.$disconnect(); }
