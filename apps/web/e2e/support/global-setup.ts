/**
 * Before the run: remove test databases left by interrupted runs, then seed
 * this run's throwaway database with the demo data through the real seed
 * script. Only ambient_test_* databases are ever touched.
 */
import { execSync } from "node:child_process";
import { join } from "node:path";

import removeStaleTestDatabases from "../../tests/support/global-setup";
import { assertTestDb, testClusterUri } from "../../tests/support/test-db";

const REPO = join(__dirname, "..", "..", "..", "..");

export default async function globalSetup() {
  const name = process.env.E2E_MONGODB_DB ?? "";
  assertTestDb(name, "ambient_crm");
  await removeStaleTestDatabases();
  // A brand-new database, so --allow-remote (the Atlas cluster locally) never wipes anything.
  execSync("pnpm --filter @ambient/db seed --allow-remote", {
    cwd: REPO,
    env: { ...process.env, MONGODB_URI: testClusterUri(), MONGODB_DB: name, LOG_LEVEL: "warn" },
    stdio: "inherit",
  });
}
