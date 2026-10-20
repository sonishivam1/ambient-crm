/**
 * Read-only look at the target cluster: databases, and what MONGODB_DB already
 * holds. The report itself is plain console output for a person to read; errors
 * go through the logger.
 */
import { createLogger, scrubString } from "@ambient/logger";

import { closeClient, getClient, getDb } from "../src/index";

const log = createLogger("inspect");

async function main() {
  const client = await getClient();
  const host = new URL(process.env.MONGODB_URI!.replace(/^mongodb(\+srv)?:/, "http:")).hostname;
  const { databases } = await client.db().admin().listDatabases({ nameOnly: true });
  console.log(`Connected to ${host}`);
  console.log(`Databases: ${databases.map((d) => d.name).join(", ") || "(none)"}`);
  const db = await getDb();
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  console.log(`${db.databaseName}: ${collections.length ? "" : "(empty)"}`);
  for (const { name } of collections) {
    console.log(`  ${name}: ${await db.collection(name).estimatedDocumentCount()} docs`);
  }
}

main()
  .catch((error) => {
    log.error({ err: error, detail: error instanceof Error ? scrubString(error.message) : undefined }, "Inspecting the database failed.");
    process.exitCode = 1;
  })
  .finally(closeClient);
