import { describe, expect, it } from "vitest";

import { zonedParts } from "@ambient/db/time";

import { getAccountProfile } from "@/lib/data/account-profile";
import { contractsQuerySchema, getContractsPage } from "@/lib/data/contracts";

import { USERS, signInAs } from "../support/session";

const query = (params: Record<string, string> = {}) => contractsQuerySchema.parse(params);
const names = async (params: Record<string, string> = {}) => (await getContractsPage(query(params))).rows.map((k) => k.name);

// Priya (rep r1) has three current contracts; a fourth ended 140 days ago and stays out of view.
describe("contracts and renewals", () => {
  it("shows a rep only contracts on their own accounts, soonest renewal first", async () => {
    signInAs(USERS.northwind.rep);
    const page = await getContractsPage(query());
    expect(page.rows.map((k) => [k.name, k.daysLeft, k.band])).toEqual([
      ["National Safety Program", 21, "30"],
      ["Hardware Retail Agreement", 180, "later"],
      ["Mining Site Supply", 233, "later"],
    ]);
    expect(page.showOwner).toBe(false);
  });

  it("counts a manager's team contracts per renewal band, keeping a recent lapse in view", async () => {
    signInAs(USERS.northwind.manager);
    const page = await getContractsPage(query());
    expect(page.total).toBe(10);
    expect(page.counts).toEqual({ expired: 1, "30": 2, "60": 3, "90": 0, later: 4 });
    expect(await names({ band: "expired" })).toEqual(["Marine Services Supply"]);
    expect((await getContractsPage(query({ band: "expired" }))).rows[0]).toMatchObject({ daysLeft: -12, owner: "Jordan Reyes" });
    expect(await names({ band: "60" })).toEqual(["Retail Uniform Program WA", "Uniform Services", "Civil PPE Panel"]);
    // Filtering by band leaves the cards' counts alone.
    expect((await getContractsPage(query({ band: "60" }))).counts.later).toBe(4);
  });

  it("searches names, numbers and accounts, filters by account, and sorts by value", async () => {
    signInAs(USERS.northwind.rep);
    expect(await names({ q: "acme" })).toEqual(["National Safety Program"]);
    expect(await names({ q: "CT-2402" })).toEqual(["National Safety Program"]);
    expect(await names({ account: "northwind:CG-HARROW-BT1" })).toEqual(["Hardware Retail Agreement"]);
    expect(await names({ account: "northwind:CO-NORTHERN-BT1" })).toEqual([]); // Grace's account

    signInAs(USERS.northwind.manager);
    expect((await names({ sort: "value" }))[0]).toBe("National Wholesale Terms");
  });

  it("applies the division lens and keeps tenants apart", async () => {
    signInAs(USERS.northwind.senior, "wholesale");
    expect((await names()).sort()).toEqual(
      ["Hardware Retail Agreement", "Menswear Range Agreement", "NZ Safety Distribution", "National Wholesale Terms", "Retail Uniform Program WA", "Trade Counter Terms"].sort(),
    );

    signInAs(USERS.harbor.rep);
    const harbor = await getContractsPage(query());
    expect(harbor.rows.map((k) => [k.name, k.daysLeft])).toEqual([["Marine Trade Terms", 66]]);
    // Days are counted between local midnights in Auckland.
    expect(zonedParts(harbor.rows[0]!.endDate, "Pacific/Auckland")).toMatchObject({ hour: 0, minute: 0 });
    expect(harbor.timeZone).toBe("Pacific/Auckland");

    signInAs(USERS.northwind.admin); // no accounts, so no contracts
    expect((await getContractsPage(query())).total).toBe(0);
  });

  it("shows a bill-to's contracts on its profile, and on its sold-tos", async () => {
    signInAs(USERS.northwind.rep);
    expect((await getAccountProfile("northwind:CO-ACME-BT1"))!.contracts.map((k) => k.name)).toEqual(["National Safety Program"]);
    expect((await getAccountProfile("northwind:CO-ACME-BT1-ST1"))!.contracts.map((k) => k.name)).toEqual(["National Safety Program"]);
    expect((await getAccountProfile("northwind:SA-DELTA-BT1"))!.contracts.map((k) => k.band)).toEqual(["later"]);
  });

  it("falls back to defaults for bad parameters", async () => {
    signInAs(USERS.northwind.rep);
    expect(query({ band: "soon", sort: "random", page: "-3" })).toMatchObject({ band: "", sort: "end", page: 1 });
  });
});
