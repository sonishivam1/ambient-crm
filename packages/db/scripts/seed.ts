/**
 * Seeds MONGODB_DB with the fictional demo data in src/fixtures.ts.
 *
 * Destructive: drops every collection in MONGODB_DB first.
 * - Local servers seed freely.
 * - Any other server needs --allow-remote, and --reset as well if the
 *   database already holds data.
 */
import { closeClient, getDb } from "../src/index";
import { seedDemoData } from "../src/fixtures";

const uri = process.env.MONGODB_URI ?? "";
const isLocal = /\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri);
const args = new Set(process.argv.slice(2));
if (!isLocal && !args.has("--allow-remote")) {
  console.error("Refusing to seed a remote database. Re-run with --allow-remote if that is intended.");
  process.exit(1);
}

async function main() {
  const db = await getDb();
  const existing = await db.listCollections({}, { nameOnly: true }).toArray();
  if (!isLocal && existing.length && !args.has("--reset")) {
    console.error(`Refusing to wipe ${db.databaseName}: it already holds ${existing.length} collections. Add --reset to replace them.`);
    process.exitCode = 1;
    return;
  }
  for (const { tenantId, counts } of await seedDemoData(db)) {
    const parts = Object.entries(counts).map(([name, n]) => `${n} ${name}`);
    console.log(`Seeded ${db.databaseName} / ${tenantId}: ${parts.join(", ")}.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeClient);
