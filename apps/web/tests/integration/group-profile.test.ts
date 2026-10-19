import { describe, expect, it } from "vitest";

import { getGroupProfile } from "@/lib/data/group-profile";

import { USERS, signInAs } from "../support/session";

describe("customer group page", () => {
  it("shows a group in scope with its bill-tos, sold-to counts and health mix", async () => {
    signInAs(USERS.northwind.rep);
    const profile = await getGroupProfile("northwind:CO-ACME");
    expect(profile).not.toBeNull();
    const p = profile!;

    expect(p.group).toMatchObject({ name: "ACME SAFETY", owner: "Priya Nair", level: "corporation" });
    expect(p.counts.billTos).toBe(p.billTos.length);
    expect(p.billTos.reduce((n, b) => n + b.children, 0)).toBe(p.counts.soldTos);

    const healthTotal = p.health.g + p.health.a + p.health.r + p.health.none;
    expect(healthTotal).toBe(p.counts.billTos + p.counts.soldTos);

    const revenue = p.billTos.map((b) => b.fyRevenue);
    expect(revenue).toEqual([...revenue].sort((a, b) => b - a));
  });

  it("counts open and overdue tasks across the whole group", async () => {
    signInAs(USERS.northwind.rep);
    const p = (await getGroupProfile("northwind:CO-ACME"))!;
    expect(p.counts.openTasks).toBeGreaterThanOrEqual(2);
    expect(p.counts.overdueTasks).toBeGreaterThanOrEqual(1);
  });

  it("lists recent activity from every account in the group, newest first", async () => {
    signInAs(USERS.northwind.rep);
    const p = (await getGroupProfile("northwind:CO-ACME"))!;
    expect(p.activity.length).toBeGreaterThan(0);
    const times = p.activity.map((a) => a.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(p.activity.every((a) => a.account.startsWith("ACME SAFETY"))).toBe(true);
  });

  it("is not found outside the user's scope or tenant", async () => {
    signInAs(USERS.northwind.rep);
    expect(await getGroupProfile("northwind:CG-BRIGHTWELL")).toBeNull();

    signInAs(USERS.harbor.super);
    expect(await getGroupProfile("northwind:CO-ACME")).toBeNull();
    expect((await getGroupProfile("harbor:CO-ACME"))?.group.name).toBe("ACME ELECTRICAL NZ");
  });

  it("hides owner columns from reps and shows them to managers", async () => {
    signInAs(USERS.northwind.rep);
    expect((await getGroupProfile("northwind:CO-ACME"))!.showOwner).toBe(false);
    signInAs(USERS.northwind.manager);
    expect((await getGroupProfile("northwind:CO-ACME"))!.showOwner).toBe(true);
  });
});
