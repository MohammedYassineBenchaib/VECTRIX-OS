import { PrismaClient } from "@prisma/client";

/**
 * A single Prisma client per Node process. Next.js development hot-reloads
 * modules; without the global cache each reload would open a new connection
 * pool and eventually exhaust SQLite/Postgres.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
