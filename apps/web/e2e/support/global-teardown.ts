/** After the run: drop this run's throwaway database. */
import { MongoClient } from "mongodb";

import { assertTestDb, testClusterUri } from "../../tests/support/test-db";

export default async function globalTeardown() {
  const name = process.env.E2E_MONGODB_DB ?? "";
  assertTestDb(name, "ambient_crm");
  const client = await new MongoClient(testClusterUri(), { appName: "ambient-e2e" }).connect();
  try {
    const db = client.db(name);
    for (const { name: coll } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      await db.collection(coll).drop();
    }
    await db.dropDatabase().catch(() => {});
  } finally {
    await client.close();
  }
}
