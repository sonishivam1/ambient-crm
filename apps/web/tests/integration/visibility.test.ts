import { describe, expect, it } from "vitest";

import { getCurrentUser } from "@/lib/auth/session";
import { getRepScope } from "@/lib/auth/visibility";
import { getScope } from "@/lib/data/scope";

import { USERS, signInAs } from "../support/session";

async function repScopeOf(userId: string) {
  signInAs(userId);
  const scope = await getRepScope(await getCurrentUser());
  return scope.all ? "all" : [...scope.repIds].sort();
}

describe("account visibility (two ladders, within a tenant)", () => {
  it("gives a rep only their own book", async () => {
    expect(await repScopeOf(USERS.northwind.rep)).toEqual(["northwind:r1"]);
  });

  it("gives a manager their own book plus direct reports", async () => {
    expect(await repScopeOf(USERS.northwind.manager)).toEqual(
      ["northwind:r1", "northwind:r2", "northwind:r4", "northwind:r7", "northwind:r8"].sort(),
    );
  });

  it("gives a senior manager the whole reporting subtree", async () => {
    const scope = await repScopeOf(USERS.northwind.senior);
    expect(scope).toHaveLength(8); // every Northwind rep sits under Grace
  });

  it("gives leads and super admins everything", async () => {
    expect(await repScopeOf(USERS.northwind.lead)).toBe("all");
    expect(await repScopeOf(USERS.northwind.super)).toBe("all");
  });

  it("gives an admin no accounts on their own", async () => {
    expect(await repScopeOf(USERS.northwind.admin)).toEqual([]);
  });

  it("never walks the hierarchy into another tenant", async () => {
    expect(await repScopeOf(USERS.harbor.manager)).toEqual(["harbor:r1", "harbor:r2", "harbor:r3"]);
  });
});

describe("scope filter", () => {
  it("always carries the user's tenant", async () => {
    signInAs(USERS.harbor.super);
    const scope = await getScope();
    expect(scope.tenantId).toBe("harbor");
    expect(scope.filter()).toMatchObject({ tenantId: "harbor" });
    expect(scope.tenant()).toEqual({ tenantId: "harbor" });
  });

  it("applies the division lens only for roles that have it", async () => {
    signInAs(USERS.northwind.senior, "uniforms");
    expect((await getScope()).filter()).toMatchObject({ division: { $in: ["uniforms", "icw"] } });

    signInAs(USERS.northwind.rep, "uniforms"); // reps can't use the lens; the cookie is ignored
    expect((await getScope()).filter()).not.toHaveProperty("division");
  });
});
