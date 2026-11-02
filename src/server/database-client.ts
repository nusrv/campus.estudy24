import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function createDatabase(connectionString = process.env.DATABASE_URL, logErrors = true) {
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const adapter = new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
  return new PrismaClient({ adapter, log: logErrors ? ["error"] : [] });
}
