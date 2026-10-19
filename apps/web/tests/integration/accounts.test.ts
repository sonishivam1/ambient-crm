import { describe, expect, it } from "vitest";

import { paletteSearch } from "@/app/actions/search";
import { getAccountProfile } from "@/lib/data/account-profile";
import { accountsQuerySchema, getAccountsPage, getChildAccounts } from "@/lib/data/accounts";

import { USERS, signInAs } from "../support/session";

const query = (params: Record<string, string> = {}) => accountsQuerySchema.parse(params);

describe("accounts list", () => {
  it("shows a rep only their own customer groups", async () => {
    signInAs(USERS.northwind.rep);
    const page = await getAccountsPage(query());
    expect(page.summary.total).toBe(3);
    expect(page.rows.map((r) => r.owner)).toEqual(["Priya Nair", "Priya Nair", "Priya Nair"]);
    expect(page.showOwner).toBe(false);
  });

  it("shows a manager their team's groups, with owner columns", async () => {
    signInAs(USERS.northwind.manager);
    const page = await getAccountsPage(query());
    expect(page.summary.total).toBe(10);
    expect(page.showOwner).toBe(true);
  });

  it("filters by health and division together with scope", async () => {
    signInAs(USERS.northwind.super);
    expect((await getAccountsPage(query({ health: "r" }))).rows.map((r) => r.name)).toEqual([
      "ACME SAFETY",
      "SOUTHPORT MARINE SERVICES",
    ]);
    expect((await getAccountsPage(query({ div: "icw" }))).summary.total).toBe(2);
  });

  it("intersects the page's division filter with the lens", async () => {
    signInAs(USERS.northwind.senior, "wholesale");
    expect((await getAccountsPage(query({ div: "uniforms" }))).summary.total).toBe(0);
  });

  it("keeps each tenant's data apart even where source keys collide", async () => {
    signInAs(USERS.harbor.super);
    const page = await getAccountsPage(query({ q: "acme" }));
    expect(page.rows.map((r) => r.name)).toEqual(["ACME ELECTRICAL NZ"]);

    signInAs(USERS.northwind.super);
    expect((await getAccountsPage(query({ q: "acme" }))).rows.map((r) => r.name)).toEqual(["ACME SAFETY"]);
  });

  it("sorts account views by open tasks", async () => {
    signInAs(USERS.northwind.super);
    const page = await getAccountsPage(query({ view: "bill_to", sort: "tasks" }));
    const counts = page.kind === "account" ? page.rows.map((r) => r.openTasks) : [];
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(counts[0]).toBeGreaterThan(0);
  });
});

describe("drill-down and profile", () => {
  it("loads a group's bill-tos only when the group is in scope", async () => {
    signInAs(USERS.northwind.manager);
    expect((await getChildAccounts({ groupId: "northwind:CG-BRIGHTWELL" })).length).toBeGreaterThan(0);

    signInAs(USERS.northwind.rep); // Brightwell belongs to Liam, not Priya
    expect(await getChildAccounts({ groupId: "northwind:CG-BRIGHTWELL" })).toEqual([]);
  });

  it("returns no profile outside scope or tenant", async () => {
    signInAs(USERS.northwind.rep);
    expect(await getAccountProfile("northwind:CO-ACME-BT1")).not.toBeNull();
    expect(await getAccountProfile("northwind:CG-BRIGHTWELL-BT1")).toBeNull();

    signInAs(USERS.harbor.super);
    expect(await getAccountProfile("northwind:CO-ACME-BT1")).toBeNull();
    expect((await getAccountProfile("harbor:CO-ACME-BT1"))?.account.name).toBe("ACME ELECTRICAL NZ");
  });

  it("builds the profile timeline newest first from interactions, visits and tasks", async () => {
    signInAs(USERS.northwind.rep);
    const profile = await getAccountProfile("northwind:CO-ACME-BT1");
    const times = profile!.timeline.map((t) => t.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(new Set(profile!.timeline.map((t) => t.kind))).toContain("interaction");
  });
});

describe("palette search", () => {
  it("never returns accounts outside the user's scope", async () => {
    signInAs(USERS.northwind.rep);
    expect(await paletteSearch("brightwell")).toEqual([]);
    const accounts = (await paletteSearch("acme")).filter((r) => r.kind === "account");
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts.every((r) => r.title.startsWith("ACME SAFETY"))).toBe(true);
  });

  it("ignores queries shorter than two characters", async () => {
    signInAs(USERS.northwind.super);
    expect(await paletteSearch("a")).toEqual([]);
  });
});
