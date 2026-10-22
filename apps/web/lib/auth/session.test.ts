import { afterEach, describe, expect, it, vi } from "vitest";

import { devAuthEnabled } from "./session";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

describe("devAuthEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  const env = (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  };

  it("is on in development when AMBIENT_DEV_AUTH=1", () => {
    env({ NODE_ENV: "development", AMBIENT_DEV_AUTH: "1" });
    expect(devAuthEnabled()).toBe(true);
  });

  it("is off without AMBIENT_DEV_AUTH=1", () => {
    env({ NODE_ENV: "development", AMBIENT_DEV_AUTH: "0" });
    expect(devAuthEnabled()).toBe(false);
  });

  it("is off in production, even with the flag", () => {
    env({ NODE_ENV: "production", AMBIENT_DEV_AUTH: "1", MONGODB_DB: "ambient_test_1_e2e" });
    expect(devAuthEnabled()).toBe(false);
  });

  it("is off in production with the e2e flag but the real database", () => {
    env({ NODE_ENV: "production", AMBIENT_DEV_AUTH: "1", AMBIENT_E2E: "1", MONGODB_DB: "ambient_crm" });
    expect(devAuthEnabled()).toBe(false);
    env({ MONGODB_DB: undefined });
    expect(devAuthEnabled()).toBe(false);
  });

  it("is on in production only for the e2e run against a test database", () => {
    env({ NODE_ENV: "production", AMBIENT_DEV_AUTH: "1", AMBIENT_E2E: "1", MONGODB_DB: "ambient_test_1_e2e" });
    expect(devAuthEnabled()).toBe(true);
    env({ AMBIENT_DEV_AUTH: "0" });
    expect(devAuthEnabled()).toBe(false);
  });
});
