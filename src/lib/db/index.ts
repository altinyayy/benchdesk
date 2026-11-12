import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { db?: DB };

// Created on first use so that importing this module during `next build`
// never opens a connection.
export function getDb(): DB {
  if (globalForDb.db) return globalForDb.db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 10 });
  globalForDb.db = drizzle(client, { schema });
  return globalForDb.db;
}

export { schema };
