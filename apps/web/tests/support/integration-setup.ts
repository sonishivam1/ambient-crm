/**
 * Integration test harness. Every test file gets its own freshly seeded
 * database on a local MongoDB and drops it afterwards. Next.js request APIs
 * (cookies, connection, refresh) are stubbed so the real read models and
 * server actions run unchanged.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, vi } from "vitest";

const uri = process.env.TEST_MONGODB_URI ?? "mongodb://localhost:27017/?directConnection=true";
if (!/\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri)) {
  throw new Error("Integration tests only run against a local MongoDB. Set TEST_MONGODB_URI to a localhost URI.");
}
process.env.MONGODB_URI = uri;
process.env.MONGODB_DB = `ambient_test_${randomUUID().slice(0, 8)}`;
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
  await seedDemoData(await getDb());
});

afterAll(async () => {
  const { getDb, closeClient } = await import("@ambient/db");
  await (await getDb()).dropDatabase();
  await closeClient();
});
