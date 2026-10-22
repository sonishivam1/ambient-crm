/**
 * End-to-end tests (`pnpm test:e2e`): the production build in Chromium,
 * against a throwaway `ambient_test_*` database seeded with the demo data for
 * this run and dropped after it. Never part of `pnpm test`.
 */
import { defineConfig, devices } from "@playwright/test";

import { newTestDbName, testClusterUri } from "./tests/support/test-db";

// The config is loaded again in every worker; they inherit the first name.
process.env.E2E_MONGODB_DB ??= newTestDbName();
const PORT = 3100;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",
  // Tests share one seeded database: each one writes only to records it creates or its own user's.
  workers: CI ? 2 : 3,
  retries: 0,
  forbidOnly: CI,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  outputDir: "e2e/results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "en-AU",
    timezoneId: "Australia/Sydney",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /phone\.spec\.ts/ },
    {
      name: "phone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      testMatch: /phone\.spec\.ts/,
    },
  ],
  webServer: {
    // E2E_SKIP_BUILD=1 reuses the last build (quicker while writing tests; CI always builds).
    command: process.env.E2E_SKIP_BUILD === "1" ? "pnpm start --port 3100" : "pnpm build && pnpm start --port 3100",
    // A plain API read: answers (401 before seeding, 200 after) once the server is up.
    url: `http://127.0.0.1:${PORT}/api/v1/me`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      MONGODB_URI: testClusterUri(),
      MONGODB_DB: process.env.E2E_MONGODB_DB,
      AMBIENT_DEV_AUTH: "1",
      // Development sign-in in a production build, for an ambient_test_* database only.
      AMBIENT_E2E: "1",
      // No AI: the AI screens show their "not set up" state, and no call leaves the machine.
      OPENAI_API_KEY: "",
      LOG_LEVEL: "warn",
    },
  },
});
