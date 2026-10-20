import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { authSecret } from "./config";
import { tokenDigest } from "./security";
import { adAudience } from "./content-policy";

export function activeAdsWhere(now = new Date()): Prisma.AdvertisementWhereInput {
  return { status: "active", AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] };
}
export function placementWhere(placement: string): Prisma.AdvertisementWhereInput {
  return { OR: [{ placementId: placement }, { placementAssignments: { some: { placementId: placement } } }] };
}
export async function publicAds({ university, placement, skip = 0, take = 20 }: { university?: string; placement?: string; skip?: number; take?: number }) {
  if (university && !await db.university.findFirst({ where: { slug: university, enabled: true }, select: { id: true } })) return { items: [], total: 0 };
  const where: Prisma.AdvertisementWhereInput = { AND: [activeAdsWhere(), adAudience(university), ...(placement ? [placementWhere(placement)] : [])] };
  const [records, total] = await Promise.all([db.advertisement.findMany({ where, skip, take, orderBy: [{ priority: "desc" }, { id: "asc" }], select: { id: true, title: true, description: true, imageUrl: true, destinationUrl: true, buttonText: true, placementId: true, placementAssignments: { select: { placementId: true } } } }), db.advertisement.count({ where })]);
  const day = new Date().toISOString().slice(0, 10);
  const items = records.map(({ placementAssignments, ...ad }) => ({ ...ad, placementIds: [...new Set([ad.placementId, ...placementAssignments.map(p => p.placementId)])], tracking_day: day, tracking_token: tokenDigest(`ad:${ad.id}:${day}`, authSecret()) }));
  return { items, total };
}
