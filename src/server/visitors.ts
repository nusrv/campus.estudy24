import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { DEFAULT_COUNTER_LABEL } from "./visitor-policy";
import { displayedVisits } from "../lib/visitor-counter";

export async function visitorSummary() {
  const settings = await db.siteSettings.findUnique({ where: { id: "main" } });
  if (settings && !settings.visitorCounterEnabled) return { enabled: false as const };
  const aggregate = await db.visitorDaily.aggregate({ _sum: { visits: true } });
  const tracked = aggregate._sum.visits || 0;
  const startingValue = settings?.visitorStartingValue || 0;
  return { enabled: true as const, label: settings?.visitorCounterLabel || DEFAULT_COUNTER_LABEL, count: displayedVisits(startingValue, tracked), includes_starting_value: startingValue > 0 };
}

export async function claimVisit(key: string, now: Date) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const settings = await tx.siteSettings.upsert({ where: { id: "main" }, create: { id: "main" }, update: {} });
        if (!settings.visitorCounterEnabled) return false;
        const existing = await tx.visitDedup.findUnique({ where: { key } });
        if (existing && existing.expiresAt > now) return false;
        const expiresAt = new Date(now.getTime() + 1800000);
        await tx.visitDedup.upsert({ where: { key }, create: { key, expiresAt }, update: { expiresAt } });
        const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
        await tx.visitorDaily.upsert({ where: { day }, create: { day, visits: 1 }, update: { visits: { increment: 1 } } });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code) && attempt < 3) continue;
      throw error;
    }
  }
  return false;
}
