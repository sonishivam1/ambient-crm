/**
 * Integration test harness. Every test file gets its own freshly seeded
 * database on the test cluster (see test-db.ts) and drops it afterwards.
 * Next.js request APIs (cookies, connection, refresh) are stubbed so the real
 * read models and server actions run unchanged.
 */
import { afterAll, beforeAll, vi } from "vitest";

import { assertTestDb, newTestDbName, testClusterUri } from "./test-db";

const uri = testClusterUri();
const appDb = process.env.MONGODB_DB;
const dbName = newTestDbName();
assertTestDb(dbName, appDb);
process.env.MONGODB_URI = uri;
process.env.MONGODB_DB = dbName;
process.env.AMBIENT_DEV_AUTH = "1";

vi.mock("next/headers", async () => {
  const { cookieJar } = await import("./cookie-jar");
  return {
    cookies: async () => ({
      get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
      set: (name: string, value: string) => void cookieJar.set(name, value),
    }),
  };
});
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/cache", () => ({ refresh: () => {} }));

beforeAll(async () => {
  const { getDb } = await import("@ambient/db");
  const { seedDemoData } = await import("@ambient/db/fixtures");
  const db = await getDb();
  assertTestDb(db.databaseName, appDb);
  await seedDemoData(db);
});

afterAll(async () => {
  const { getDb, closeClient } = await import("@ambient/db");
  const db = await getDb();
  assertTestDb(db.databaseName, appDb);
  // Dropping each collection removes the database even for users without the dropDatabase privilege.
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    await db.collection(name).drop();
  }
  await db.dropDatabase().catch(() => {});
  await closeClient();
});
