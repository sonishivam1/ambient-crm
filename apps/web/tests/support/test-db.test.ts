import { describe, expect, it } from "vitest";

import { assertTestDb, newTestDbName, testDbAgeSeconds } from "./test-db";

describe("test database guard", () => {
  it("only allows throwaway ambient_test_* databases", () => {
    expect(() => assertTestDb(newTestDbName(), "ambient_crm")).not.toThrow();
    expect(() => assertTestDb("ambient_crm", "ambient_crm")).toThrow(/Refusing/);
    expect(() => assertTestDb("admin")).toThrow(/Refusing/);
    expect(() => assertTestDb("my_ambient_test_db")).toThrow(/Refusing/);
  });

  it("never allows the app's own database, even if it carries the prefix", () => {
    expect(() => assertTestDb("ambient_test_1_x", "ambient_test_1_x")).toThrow(/Refusing/);
  });

  it("reads a database's age from its name", () => {
    const now = Date.UTC(2026, 9, 19, 12, 0, 0);
    const created = Math.floor(now / 1000) - 3 * 3600;
    expect(testDbAgeSeconds(`ambient_test_${created}_abc123`, now)).toBe(3 * 3600);
    expect(testDbAgeSeconds("ambient_crm", now)).toBeNull();
  });
});
