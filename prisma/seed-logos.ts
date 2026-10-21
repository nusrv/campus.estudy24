import type { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
type Logo = { slug: string; localUrl: string };
const logos = JSON.parse(readFileSync(new URL('../docs/university-logos.json', import.meta.url), 'utf8')) as Logo[];
export async function seedUniversityLogos(db: PrismaClient) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(214721, 794)`;
    let filled = 0;
    for (const logo of logos) {
      const result = await tx.university.updateMany({ where: { slug: logo.slug, OR: [{ logoUrl: null }, { logoUrl: '' }] }, data: { logoUrl: logo.localUrl } });
      filled += result.count;
    }
    return { verifiedAssets: logos.length, filled, preservedOrMissing: logos.length - filled };
  });
}
