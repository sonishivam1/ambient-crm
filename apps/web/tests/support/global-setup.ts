/**
 * Runs once before the integration suite: removes test databases left behind
 * by interrupted runs (older than two hours), so the cluster's database and
 * collection limits never fill up. Only ambient_test_* databases are touched.
 */
import { MongoClient } from "mongodb";

import { TEST_DB_PREFIX, assertTestDb, testClusterUri, testDbAgeSeconds } from "./test-db";

const STALE_AFTER_SECONDS = 2 * 60 * 60;

export default async function removeStaleTestDatabases() {
  const client = await new MongoClient(testClusterUri(), { appName: "ambient-tests" }).connect();
  try {
    const { databases } = await client.db().admin().listDatabases({ nameOnly: true, authorizedDatabases: true });
    for (const { name } of databases) {
      if (!name.startsWith(TEST_DB_PREFIX)) continue;
      const age = testDbAgeSeconds(name);
      if (age === null || age < STALE_AFTER_SECONDS) continue;
      assertTestDb(name, process.env.MONGODB_DB);
      const db = client.db(name);
      for (const { name: coll } of await db.listCollections({}, { nameOnly: true }).toArray()) {
        await db.collection(coll).drop();
      }
      await db.dropDatabase().catch(() => {});
      console.log(`Removed stale test database ${name}`);
    }
  } finally {
    await client.close();
  }
}
