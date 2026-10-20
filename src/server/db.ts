import "server-only";
import type { PrismaClient } from "@prisma/client";
import { createDatabase } from "./database-client";

const globalDb = globalThis as unknown as { portalDb?: PrismaClient };
// Defer connection configuration until the first database operation, allowing builds without runtime secrets.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = globalDb.portalDb ??= createDatabase();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
