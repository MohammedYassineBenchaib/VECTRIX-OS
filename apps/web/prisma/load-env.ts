import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Prisma CLI loads `.env`; a plain `tsx` script does not. The seed script sets
 * the same local development URL before the Prisma client connects.
 */
if (!process.env.DATABASE_URL) {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (!key || rawValue === undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}
