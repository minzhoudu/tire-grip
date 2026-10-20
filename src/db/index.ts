import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb(client: ReturnType<typeof postgres>) {
  return drizzle(client, { schema });
}
export type DB = ReturnType<typeof createDb>;
/** A transaction handle has the same query API as the db itself. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

// One pool per process, reused across hot reloads in development.
// Created lazily so `next build` and imports don't need DATABASE_URL.
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres>; db?: DB };

export function getDb(): DB {
  if (globalForDb.db) return globalForDb.db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  globalForDb.pg = postgres(url, { max: 10 });
  globalForDb.db = createDb(globalForDb.pg);
  return globalForDb.db;
}

/** Close the pool (scripts and tests). */
export async function closeDb(): Promise<void> {
  await globalForDb.pg?.end({ timeout: 5 });
  globalForDb.pg = undefined;
  globalForDb.db = undefined;
}

export { schema };
