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
          include: ["lib/**/*.test.ts"],
        },
      },
      {
        ...shared,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/support/integration-setup.ts"],
          // Each file seeds and drops its own database.
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
