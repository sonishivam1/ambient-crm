import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

const shared = {
  resolve: {
    alias: [
      { find: /^@\//, replacement: root },
      // `server-only` throws outside a React Server Components build; tests run plain Node.
      { find: /^server-only$/, replacement: `${root}tests/support/empty.ts` },
    ],
  },
};

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          environment: "node",
          include: ["lib/**/*.test.ts", "tests/support/**/*.test.ts"],
        },
      },
      {
        ...shared,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/support/global-setup.ts"],
          setupFiles: ["tests/support/integration-setup.ts"],
          // Each file seeds and drops its own database on the remote test
          // cluster: allow for network latency and keep the load modest.
          testTimeout: 60_000,
          hookTimeout: 180_000,
          maxWorkers: 3,
        },
      },
    ],
  },
});
