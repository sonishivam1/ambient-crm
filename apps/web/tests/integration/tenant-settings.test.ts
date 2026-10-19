import { describe, expect, it } from "vitest";

import { collection } from "@ambient/db";
import { addDays, fromIsoDay, isoDayIn, startOfDay, zonedParts } from "@ambient/db/time";

import { setLens } from "@/app/actions/session";
import { createTask } from "@/app/actions/tasks";
import { accountsQuerySchema, getAccountsPage } from "@/lib/data/accounts";
import { getScope } from "@/lib/data/scope";
import { getTaskOptions, getTasksPage, getTodayTasks, tasksQuerySchema } from "@/lib/data/tasks";

import { cookieJar } from "../support/cookie-jar";
import { USERS, signInAs } from "../support/session";

const AKL = "Pacific/Auckland"; // Harbor's zone
const SYD = "Australia/Sydney"; // Northwind's zone
const aklDay = (n: number) => isoDayIn(addDays(new Date(), n, AKL), AKL);
const accounts = (params: Record<string, string> = {}) => accountsQuerySchema.parse(params);
const tasks = (params: Record<string, string> = {}) => tasksQuerySchema.parse({ view: "all", ...params });

describe("per-tenant divisions and lenses", () => {
  it("gives each tenant its own divisions", async () => {
    signInAs(USERS.harbor.super);
    expect((await getScope()).divisions.map((d) => d.key)).toEqual(["trade", "institutional"]);

    signInAs(USERS.northwind.super);
    expect((await getScope()).divisions.map((d) => d.key)).toEqual(["wholesale", "uniforms", "icw", "other"]);
  });

  it("applies a tenant's own lens to the scope", async () => {
    signInAs(USERS.harbor.super, "institutional");
    const scope = await getScope();
    expect(scope.lens).toBe("institutional");
    expect(scope.filter()).toMatchObject({ tenantId: "harbor", division: { $in: ["institutional"] } });
    expect(scope.divisions).toEqual([{ key: "institutional", label: "Institutional" }]);
    expect((await getAccountsPage(accounts())).rows.map((r) => r.name).sort()).toEqual(["LUMEN SCHOOLS TRUST", "PINECREST HEALTH"]);
  });

  it("ignores another tenant's lens instead of filtering by it", async () => {
    signInAs(USERS.harbor.super, "uniforms");
    const scope = await getScope();
    expect(scope.lens).toBe("all");
    expect(scope.filter()).not.toHaveProperty("division");
    expect((await getAccountsPage(accounts())).summary.total).toBe(4);
  });

  it("filters by a tenant's division, and never widens to one it doesn't have", async () => {
    signInAs(USERS.harbor.super);
    expect((await getAccountsPage(accounts({ div: "trade" }))).rows.map((r) => r.name).sort()).toEqual(["ACME ELECTRICAL NZ", "BLUEWATER MARINE SUPPLY"]);
    expect((await getAccountsPage(accounts({ div: "uniforms" }))).summary.total).toBe(0);
    expect((await getTasksPage(tasks({ div: "uniforms" }))).total).toBe(0);
  });

  it("labels divisions from the tenant", async () => {
    signInAs(USERS.harbor.super);
    const page = await getTasksPage(tasks({ div: "institutional" }));
    expect(page.total).toBeGreaterThan(0);
    expect(page.rows.every((r) => r.divisionLabel === "Institutional")).toBe(true);
    expect((await getTaskOptions()).divisions.map((d) => d.label)).toEqual(["Trade", "Institutional"]);
  });

  it("only saves a lens the user's tenant has", async () => {
    signInAs(USERS.harbor.super);
    await expect(setLens("uniforms")).rejects.toThrow("Lens not available.");
    await setLens("trade");
    expect(cookieJar.get("amb_lens")).toBe("trade");
    await setLens("all");
    expect(cookieJar.get("amb_lens")).toBe("all");

    signInAs(USERS.harbor.rep); // reps have no lens at all
    await expect(setLens("trade")).rejects.toThrow("Lens not available.");
  });
});

describe("tenant time zone", () => {
  it("starts each tenant's day at its own midnight", async () => {
    signInAs(USERS.harbor.rep);
    const harbor = await getScope();
    expect(harbor.timeZone).toBe(AKL);
    expect(harbor.today).toEqual(startOfDay(new Date(), AKL));
    expect(zonedParts(harbor.today, AKL)).toMatchObject({ hour: 0, minute: 0 });

    signInAs(USERS.northwind.rep);
    const northwind = await getScope();
    expect(northwind.timeZone).toBe(SYD);
    // Auckland's day always starts one or two hours before Sydney's.
    expect(northwind.today.getTime() - harbor.today.getTime()).toBeGreaterThan(0);
  });

  it("splits overdue and due today on the tenant's calendar", async () => {
    signInAs(USERS.harbor.rep);
    const { overdue, dueToday } = await getTodayTasks();
    expect(dueToday.map((t) => t.title)).toEqual(["Send updated trade price list"]);
    expect(dueToday.every((t) => isoDayIn(t.dueAt, AKL) === aklDay(0))).toBe(true);
    expect(overdue.every((t) => isoDayIn(t.dueAt, AKL) < aklDay(0))).toBe(true);
  });

  it("filters a due-date range as whole days in the tenant's zone", async () => {
    signInAs(USERS.harbor.rep);
    const today = aklDay(0);
    const page = await getTasksPage(tasks({ from: today, to: today }));
    expect(page.rows.map((r) => r.title)).toEqual(["Send updated trade price list"]);
  });

  it("stores a new task's due date at 17:00 on the tenant's clock", async () => {
    signInAs(USERS.harbor.rep);
    const dueDate = aklDay(3);
    const result = await createTask({ accountId: "harbor:CO-ACME-BT1", title: "Zoned due date", dueDate, priority: "normal", description: "", notes: "" });
    expect(result).toEqual({ ok: true, created: 1 });
    const task = await (await collection("tasks")).findOne({ title: "Zoned due date" });
    expect(task?.dueAt).toEqual(fromIsoDay(dueDate, AKL, 17, 0));
    expect(zonedParts(task!.dueAt, AKL)).toMatchObject({ hour: 17, minute: 0 });
  });

  it("allows today and refuses yesterday, by the tenant's calendar", async () => {
    signInAs(USERS.harbor.rep);
    const base = { accountId: "harbor:CO-ACME-BT1", priority: "normal" as const, description: "", notes: "" };
    expect(await createTask({ ...base, title: "Due today AKL", dueDate: aklDay(0) })).toEqual({ ok: true, created: 1 });
    expect(await createTask({ ...base, title: "Due yesterday AKL", dueDate: aklDay(-1) })).toEqual({
      ok: false,
      error: "The due date can't be in the past.",
    });
  });
});
