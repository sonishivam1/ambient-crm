import "server-only";

import { collection } from "@ambient/db";
import { addDays } from "@ambient/db/time";

import { getContractsPage } from "@/lib/data/contracts";
import { getNotifications } from "@/lib/data/notifications";
import type { Scope } from "@/lib/data/scope";
import { getTodayTasks } from "@/lib/data/tasks";
import { decorateVisits } from "@/lib/data/visits";

import { factsBuilder, type FactPacket } from "../facts";

import { factDate } from "./format";
import { addAccount, addContract, addNotification, addTask, addVisit } from "./records";

/** How many of each item "my day" holds; the counts give the full totals. */
export const MY_DAY_CAPS = { overdueTasks: 10, dueToday: 10, visitsToday: 10, renewals: 10, alerts: 10, quietAccounts: 5 } as const;

/** An account is quiet when nothing was logged or completed on it for this many days. */
export const QUIET_DAYS = 30;

/** Bill-tos checked for quiet accounts: the largest by revenue. */
const QUIET_CHECKED = 200;

type QuietAccount = { id: string; name: string; type: "bill_to"; health: "g" | "a" | "r" | null; owner: string; fyRevenue: number; lastTouch: Date | null };

/**
 * The user's bill-tos (largest first) with no interaction or completed visit,
 * on it or any of its sold-tos, in the last QUIET_DAYS days.
 */
async function quietAccounts(scope: Scope): Promise<{ total: number; rows: QuietAccount[] }> {
  const accounts = await collection("accounts");
  const billTos = await accounts
    .find({ ...scope.filter(), type: "bill_to", active: true }, { projection: { name: 1, ownerRepId: 1, health: 1, fyRevenue: 1 } })
    .sort({ fyRevenue: -1, _id: 1 })
    .limit(QUIET_CHECKED)
    .toArray();
  if (!billTos.length) return { total: 0, rows: [] };

  const ids = billTos.map((a) => a._id);
  const children = await accounts.find({ ...scope.tenant(), parentId: { $in: ids } }, { projection: { parentId: 1 } }).toArray();
  const billToOf = new Map<string, string>([...ids.map((id) => [id, id] as const), ...children.map((c) => [c._id, c.parentId ?? ""] as const)]);
  const family = [...billToOf.keys()];

  // The latest touch per account, across interactions and completed visits.
  const [interactions, visits, reps] = await Promise.all([
    (await collection("interactions"))
      .aggregate<{ _id: string; at: Date }>([
        { $match: { ...scope.tenant(), accountId: { $in: family }, deletedAt: null } },
        { $group: { _id: "$accountId", at: { $max: "$occurredAt" } } },
      ])
      .toArray(),
    (await collection("visits"))
      .aggregate<{ _id: string; at: Date }>([
        { $match: { ...scope.tenant(), accountId: { $in: family }, deletedAt: null, status: "completed" } },
        { $group: { _id: "$accountId", at: { $max: "$scheduledAt" } } },
      ])
      .toArray(),
    (await collection("reps")).find(scope.tenant(), { projection: { name: 1 } }).toArray(),
  ]);
  const last = new Map<string, Date>();
  for (const row of [...interactions, ...visits]) {
    const billTo = billToOf.get(row._id);
    if (billTo && (!last.has(billTo) || row.at > last.get(billTo)!)) last.set(billTo, row.at);
  }
  const since = addDays(scope.today, -QUIET_DAYS, scope.timeZone);
  const repName = new Map(reps.map((r) => [r._id, r.name]));
  const quiet = billTos.filter((a) => {
    const at = last.get(a._id);
    return !at || at < since;
  });
  return {
    total: quiet.length,
    rows: quiet.slice(0, MY_DAY_CAPS.quietAccounts).map((a) => ({
      id: a._id,
      name: a.name,
      type: "bill_to",
      health: a.health,
      owner: repName.get(a.ownerRepId) ?? "",
      fyRevenue: a.fyRevenue,
      lastTouch: last.get(a._id) ?? null,
    })),
  };
}

/**
 * Facts for the morning brief (step 4): what needs the user today. Built on
 * the same read models as the dashboard, tasks, call cycle, contracts and
 * notifications pages, so a manager sees their team's items (as on the
 * dashboard) and everyone sees only their own notifications.
 */
export async function myDayFacts(scope: Scope): Promise<FactPacket> {
  const tz = scope.timeZone;
  const team = scope.user.capabilities.manager || scope.reps.all;
  const tomorrow = addDays(scope.today, 1, tz);

  const [tasks, renewals, alerts, visitDocs, quiet] = await Promise.all([
    getTodayTasks(),
    getContractsPage({ band: "30", q: "", account: "", sort: "end", page: 1 }),
    getNotifications({ show: "unread", type: "", page: 1 }),
    (await collection("visits"))
      .find({ ...scope.filter("repId"), deletedAt: null, status: "planned", scheduledAt: { $gte: scope.today, $lt: tomorrow } })
      .sort({ scheduledAt: 1, _id: 1 })
      .limit(50)
      .toArray(),
    quietAccounts(scope),
  ]);
  const visits = await decorateVisits(scope, visitDocs.slice(0, MY_DAY_CAPS.visitsToday));
  const unread = alerts.groups.flatMap((g) => g.items);

  const f = factsBuilder();
  const facts = {
    view: team ? "Your team's items" : "Your items",
    today: factDate(scope.today, tz),
    counts: {
      overdueTasks: tasks.overdue.length,
      tasksDueToday: tasks.dueToday.length,
      visitsToday: visitDocs.length,
      renewalsWithin30Days: renewals.total,
      unreadNotifications: alerts.unread,
      quietAccounts: quiet.total,
    },
    overdueTasks: tasks.overdue.slice(0, MY_DAY_CAPS.overdueTasks).map((t) => addTask(f, t, tz, { withAccount: true, withOwner: team })),
    tasksDueToday: tasks.dueToday.slice(0, MY_DAY_CAPS.dueToday).map((t) => addTask(f, t, tz, { withAccount: true, withOwner: team })),
    visitsToday: visits.map((v) => addVisit(f, v, tz, { withAccount: true })),
    renewals: renewals.rows.slice(0, MY_DAY_CAPS.renewals).map((k) => addContract(f, k, tz, { withAccount: true })),
    notifications: unread.slice(0, MY_DAY_CAPS.alerts).map((n) => addNotification(f, n, tz)),
    quietAccounts: quiet.rows.map((a) =>
      addAccount(f, a, { lastTouch: a.lastTouch ? factDate(a.lastTouch, tz) : "No contact logged" }),
    ),
  };
  return f.build(facts);
}
