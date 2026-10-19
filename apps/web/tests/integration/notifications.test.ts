import { describe, expect, it } from "vitest";

import { collection } from "@ambient/db";
import { isoDayIn } from "@ambient/db/time";

import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";
import { getDashboard } from "@/lib/data/dashboard";
import { getNotifications, notificationsQuerySchema } from "@/lib/data/notifications";

import { USERS, signInAs } from "../support/session";

const SYD = "Australia/Sydney";
const query = (params: Record<string, string> = {}) => notificationsQuerySchema.parse(params);
const items = (page: Awaited<ReturnType<typeof getNotifications>>) => page.groups.flatMap((g) => g.items);
const readAt = async (id: string) => (await (await collection("notifications")).findOne({ _id: id }))?.readAt ?? null;

// Every seeded user has 10 notifications in Northwind (3 unread) and 3 in Harbor (1 unread).
describe("notification history", () => {
  it("shows only the signed-in user's own notifications, newest first", async () => {
    signInAs(USERS.northwind.rep);
    const page = await getNotifications(query());
    expect(page).toMatchObject({ total: 10, unread: 3, pages: 1 });
    const rows = items(page);
    expect(rows.every((n) => n.id.startsWith(`${USERS.northwind.rep}-`))).toBe(true);
    expect(rows.map((n) => n.createdAt.getTime())).toEqual([...rows.map((n) => n.createdAt.getTime())].sort((a, b) => b - a));
    expect((await getDashboard()).counts.unreadNotifications).toBe(3);
  });

  it("filters to unread and by type, and only offers types the user has", async () => {
    signInAs(USERS.northwind.rep);
    const unread = items(await getNotifications(query({ show: "unread" })));
    expect(unread).toHaveLength(3);
    expect(unread.every((n) => !n.read)).toBe(true);
    expect(items(await getNotifications(query({ type: "contract_renewal" }))).map((n) => n.title)).toEqual([
      "Contract renews in 9 days",
      "Contract renews in 21 days",
    ]);
    const page = await getNotifications(query({ type: "nonsense", show: "everything" }));
    expect(page.total).toBe(10); // bad params fall back to defaults
    expect(page.types).not.toContain("visit_assigned");
  });

  it("links an account only while it is inside the user's scope", async () => {
    signInAs(USERS.northwind.rep);
    const rows = items(await getNotifications(query()));
    expect(rows.find((n) => n.title === "ACME SAFETY moved to At risk")?.account).toEqual({ id: "northwind:CO-ACME-BT1", name: "ACME SAFETY" });
    // Grace's account: the notice stays, the link doesn't.
    expect(rows.find((n) => n.title === "Contract renews in 9 days")?.account).toBeNull();
  });

  it("groups by day on the tenant's calendar", async () => {
    signInAs(USERS.northwind.rep);
    const { groups } = await getNotifications(query());
    const keys = groups.map((g) => g.key);
    expect(keys).toEqual([...new Set(keys)].sort().reverse());
    for (const g of groups) {
      expect(g.items.every((n) => isoDayIn(n.createdAt, SYD) === g.key)).toBe(true);
      if (g.key === isoDayIn(new Date(), SYD)) expect(g.label).toBe("Today");
    }
  });

  it("keeps tenants apart", async () => {
    signInAs(USERS.harbor.rep);
    const page = await getNotifications(query());
    expect(page).toMatchObject({ total: 3, unread: 1 });
    expect(items(page).every((n) => n.id.startsWith("harbor:"))).toBe(true);
  });
});

describe("marking read", () => {
  const mine = `${USERS.northwind.rep}-n1`;
  const managers = `${USERS.northwind.manager}-n1`;

  it("marks your own notification read once, keeping the first time", async () => {
    signInAs(USERS.northwind.rep);
    expect(await markNotificationRead(mine)).toBe(true);
    const first = await readAt(mine);
    expect(first).toBeInstanceOf(Date);
    expect(await markNotificationRead(mine)).toBe(true);
    expect(await readAt(mine)).toEqual(first);
    expect((await getNotifications(query())).unread).toBe(2);
  });

  it("won't touch someone else's notification, in your tenant or another", async () => {
    signInAs(USERS.northwind.rep);
    expect(await markNotificationRead(managers)).toBe(false);
    signInAs(USERS.harbor.super);
    expect(await markNotificationRead(managers)).toBe(false);
    expect(await readAt(managers)).toBeNull();
  });

  it("marks all of yours read and leaves everyone else's alone", async () => {
    signInAs(USERS.northwind.rep);
    expect(await markAllNotificationsRead()).toBe(2);
    expect((await getNotifications(query())).unread).toBe(0);
    expect(await markAllNotificationsRead()).toBe(0);

    signInAs(USERS.northwind.manager);
    expect((await getNotifications(query())).unread).toBe(3);
  });
});
