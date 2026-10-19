import { describe, expect, it } from "vitest";

import { ROLES } from "./roles";

describe("role matrix", () => {
  it("widens account visibility up the sales ladder", () => {
    expect(ROLES.user.visibility).toBe("own");
    expect(ROLES.manager.visibility).toBe("reports");
    expect(ROLES.senior.visibility).toBe("subtree");
    expect(ROLES.lead.visibility).toBe("all");
  });

  it("keeps admin a separate ladder with no account visibility of its own", () => {
    expect(ROLES.admin.admin).toBe(true);
    expect(ROLES.admin.visibility).toBe("none");
    expect(ROLES.super.superAdmin).toBe(true);
    expect(ROLES.super.visibility).toBe("all");
  });

  it("only lets managers and above assign tasks", () => {
    expect(ROLES.user.canAssignTasks).toBe(false);
    for (const role of ["manager", "senior", "lead", "admin", "super"] as const) {
      expect(ROLES[role].canAssignTasks).toBe(true);
    }
  });

  it("gives the division lens to senior roles only", () => {
    expect(Object.entries(ROLES).filter(([, r]) => r.lens).map(([k]) => k)).toEqual(["senior", "lead", "super"]);
  });
});
