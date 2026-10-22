/**
 * Where integration tests run: the Atlas cluster from the app's own env file
 * (or TEST_MONGODB_URI), always in a throwaway database named
 * `ambient_test_<epoch seconds>_<random>`. Never the app's database.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

export const TEST_DB_PREFIX = "ambient_test_";
// Vitest and Playwright both run from apps/web. (Not import.meta: Playwright loads this file as CommonJS.)
const ENV_FILE = join(process.cwd(), ".env.local");

/** The cluster URI for tests, loaded from apps/web/.env.local unless TEST_MONGODB_URI is set. */
export function testClusterUri(): string {
  if (!process.env.TEST_MONGODB_URI && !process.env.MONGODB_URI && existsSync(ENV_FILE)) {
    process.loadEnvFile(ENV_FILE);
  }
  const uri = process.env.TEST_MONGODB_URI ?? process.env.MONGODB_URI;
  if (!uri) throw new Error("No MongoDB URI for tests. Put MONGODB_URI in apps/web/.env.local or set TEST_MONGODB_URI.");
  return uri;
}

/** A unique, recognisable database name for one test file. */
export function newTestDbName(): string {
  return `${TEST_DB_PREFIX}${Math.floor(Date.now() / 1000)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Refuse anything that isn't a throwaway test database. */
export function assertTestDb(name: string, appDbName?: string) {
  if (!name.startsWith(TEST_DB_PREFIX) || name === appDbName) {
    throw new Error(`Refusing to use "${name}" for tests: only ${TEST_DB_PREFIX}* databases may be created or dropped.`);
  }
}

/** Seconds since the database was created, from its name; null if the name isn't ours. */
export function testDbAgeSeconds(name: string, now = Date.now()): number | null {
  const match = new RegExp(`^${TEST_DB_PREFIX}(\\d+)_`).exec(name);
  return match ? Math.floor(now / 1000) - Number(match[1]) : null;
}
