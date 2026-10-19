import "server-only";

import { OPEN_TASK_STATUSES, collection, type HealthBand } from "@ambient/db";

import { addDays, startOfWeek } from "@ambient/db/time";

import { getScope } from "./scope";

const OPEN = { $in: OPEN_TASK_STATUSES };

export async function getDashboard() {
  const scope = await getScope();
  const { user } = scope;
  const { timeZone, today: startOfToday } = scope;
  const now = new Date();
  const endOfTomorrow = addDays(startOfToday, 2, timeZone);
  const weekStart = startOfWeek(now, timeZone);
  const weekEnd = addDays(weekStart, 7, timeZone);
  // The calendar card can page a few weeks either way without a round trip.
  const calStart = addDays(weekStart, -28, timeZone);
  const calEnd = addDays(weekEnd, 35, timeZone);

  const [tasks, visits, accounts, groups, notifications, sales] = await Promise.all([
    collection("tasks"),
    collection("visits"),
    collection("accounts"),
    collection("customerGroups"),
    collection("notifications"),
    collection("salesSnapshots"),
  ]);

  const taskFilter = { ...scope.filter(), deletedAt: null };
  const visitFilter = { ...scope.filter("repId"), deletedAt: null, status: { $ne: "cancelled" as const } };

  const [openTasks, overdue, todayTasks, calendarVisits, nextVisit, healthMix, atRisk, topAccounts, unreadNotifications, recentNotifications, snapshot] =
    await Promise.all([
      tasks.countDocuments({ ...taskFilter, status: OPEN }),
      tasks.countDocuments({ ...taskFilter, status: OPEN, dueAt: { $lt: startOfToday } }),
      tasks.find({ ...taskFilter, status: OPEN, dueAt: { $lt: endOfTomorrow } }).sort({ dueAt: 1 }).limit(4).toArray(),
      visits.find({ ...visitFilter, scheduledAt: { $gte: calStart, $lt: calEnd } }).sort({ scheduledAt: 1 }).toArray(),
      visits.findOne({ ...visitFilter, status: "planned", scheduledAt: { $gte: startOfToday } }, { sort: { scheduledAt: 1 } }),
      groups.aggregate<{ _id: HealthBand | null; n: number }>([{ $match: scope.filter() }, { $group: { _id: "$health", n: { $sum: 1 } } }]).toArray(),
      accounts.find({ ...scope.filter(), type: "bill_to", health: "r", active: true }).sort({ fyRevenue: -1 }).limit(3).toArray(),
      accounts.find({ ...scope.filter(), type: "bill_to", active: true }).sort({ fyRevenue: -1 }).limit(4).toArray(),
      notifications.countDocuments({ ...scope.tenant(), userId: user._id, readAt: null }),
      notifications.find({ ...scope.tenant(), userId: user._id }).sort({ createdAt: -1 }).limit(3).toArray(),
      sales.findOne({ ...scope.tenant(), scope: scope.reps.all ? "org" : (user.repId ?? "none") }, { sort: { asOf: -1 } }),
    ]);

  const weekVisits = calendarVisits.filter((v) => v.scheduledAt >= weekStart && v.scheduledAt < weekEnd);

  // Names for every account the cards mention, in one query.
  const accountIds = [...new Set([...todayTasks, ...calendarVisits, ...(nextVisit ? [nextVisit] : [])].map((x) => x.accountId))];
  const names = new Map(
    (await accounts.find({ ...scope.tenant(), _id: { $in: accountIds } }, { projection: { name: 1 } }).toArray()).map((a) => [a._id, a.name]),
  );
  const tenantReps = await (await collection("reps")).find({ ...scope.tenant(), active: true }, { projection: { name: 1 } }).toArray();
  const ownerNames = new Map(tenantReps.map((r) => [r._id, r.name]));
  const repScope = scope.reps;
  const visibleReps = repScope.all ? tenantReps : tenantReps.filter((r) => repScope.repIds.includes(r._id));

  const mix = { g: 0, a: 0, r: 0 };
  for (const row of healthMix) if (row._id) mix[row._id] = row.n;

  return {
    user,
    scope: { all: scope.reps.all, lens: scope.lens },
    team: { names: visibleReps.slice(0, 3).map((r) => r.name), total: visibleReps.length },
    now,
    timeZone,
    counts: { openTasks, overdue, visitsLeftThisWeek: weekVisits.filter((v) => v.status === "planned").length, unreadNotifications },
    todayTasks: todayTasks.map((t) => ({ id: t._id, title: t.title, account: names.get(t.accountId) ?? "", accountId: t.accountId, dueAt: t.dueAt, priority: t.priority, status: t.status, overdue: t.dueAt < startOfToday })),
    calendar: calendarVisits.map((v) => ({ id: v._id, accountId: v.accountId, account: names.get(v.accountId) ?? "", purpose: v.purpose, type: v.type, status: v.status, at: v.scheduledAt })),
    nextVisit: nextVisit && { id: nextVisit._id, accountId: nextVisit.accountId, account: names.get(nextVisit.accountId) ?? "", purpose: nextVisit.purpose, at: nextVisit.scheduledAt },
    health: { ...mix, groups: mix.g + mix.a + mix.r },
    atRisk: atRisk.map((a) => ({ id: a._id, name: a.name, owner: ownerNames.get(a.ownerRepId) ?? "", fyRevenue: a.fyRevenue })),
    topAccounts: topAccounts.map((a) => ({ id: a._id, name: a.name, fyRevenue: a.fyRevenue })),
    notifications: recentNotifications.map((n) => ({ id: n._id, type: n.type, title: n.title, body: n.body, accountId: n.accountId, createdAt: n.createdAt })),
    sales: snapshot,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
