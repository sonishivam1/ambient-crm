import "server-only";

import { z } from "zod";

import { OPEN_TASK_STATUSES, TASK_PRIORITIES, TASK_SOURCES, collection, type Division, type Task } from "@ambient/db";
import { addDays, fromIsoDay } from "@ambient/db/time";

import { getScope, type Scope } from "./scope";

export const TASK_PAGE_SIZE = 20;
export const STATUS_FILTERS = ["open", "in_progress", "overdue", "completed"] as const;
const PRIORITY_RANK = ["high", "normal", "low"];

/** A comma-separated list param, keeping only known values. */
const listOf = <T extends string>(values: readonly T[]) =>
  z
    .string()
    .transform((s) => s.split(",").filter((v): v is T => (values as readonly string[]).includes(v)))
    .catch([] as T[]);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .catch("");

export const tasksQuerySchema = z.object({
  view: z.enum(["today", "all"]).catch("today"),
  status: listOf(STATUS_FILTERS),
  priority: listOf(TASK_PRIORITIES),
  source: listOf(TASK_SOURCES),
  /** A division key; checked against the tenant's divisions when the query runs. */
  div: z.string().regex(/^[a-z0-9_-]{0,40}$/).catch(""),
  account: z.string().max(200).catch(""),
  assignee: z.string().max(200).catch(""),
  from: isoDate,
  to: isoDate,
  sort: z.enum(["due", "priority", "created"]).catch("due"),
  dir: z.enum(["asc", "desc"]).catch("asc"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type TasksQuery = z.infer<typeof tasksQuerySchema>;

export type TaskRow = {
  id: string;
  accountId: string;
  account: string;
  division: Division;
  divisionLabel: string;
  title: string;
  description: string;
  notes: string;
  ownerRepId: string;
  owner: string;
  dueAt: Date;
  priority: Task["priority"];
  status: Task["status"];
  source: Task["source"];
  createdAt: Date;
  createdBy: string;
  overdue: boolean;
};

export type RepOption = { id: string; name: string; team: string };

function baseTaskFilter(scope: Scope) {
  return { ...scope.filter(), deletedAt: null, status: { $ne: "cancelled" as const } };
}

/** Names for the rows: accounts, reps (owners) and users (creators), in three queries. */
async function decorate(scope: Scope, tasks: Task[]): Promise<TaskRow[]> {
  const { today } = scope;
  const accountIds = [...new Set(tasks.map((t) => t.accountId))];
  const userIds = [...new Set(tasks.map((t) => t.createdByUserId))];
  const [accounts, reps, users] = await Promise.all([
    (await collection("accounts")).find({ ...scope.tenant(), _id: { $in: accountIds } }, { projection: { name: 1 } }).toArray(),
    (await collection("reps")).find(scope.tenant(), { projection: { name: 1 } }).toArray(),
    (await collection("users")).find({ ...scope.tenant(), _id: { $in: userIds } }, { projection: { name: 1 } }).toArray(),
  ]);
  const accountName = new Map(accounts.map((a) => [a._id, a.name]));
  const repName = new Map(reps.map((r) => [r._id, r.name]));
  const userName = new Map(users.map((u) => [u._id, u.name]));
  return tasks.map((t) => ({
    id: t._id,
    accountId: t.accountId,
    account: accountName.get(t.accountId) ?? "",
    division: t.division,
    divisionLabel: scope.divisionLabel(t.division),
    title: t.title,
    description: t.description ?? "",
    notes: t.notes ?? "",
    ownerRepId: t.ownerRepId,
    owner: repName.get(t.ownerRepId) ?? "",
    dueAt: t.dueAt,
    priority: t.priority,
    status: t.status,
    source: t.source,
    createdAt: t.createdAt,
    createdBy: t.createdByUserId === "wren" ? "Wren" : (userName.get(t.createdByUserId) ?? ""),
    overdue: OPEN_TASK_STATUSES.includes(t.status) && t.dueAt < today,
  }));
}

const byDueThenPriority = (a: Task, b: Task) =>
  a.dueAt.getTime() - b.dueAt.getTime() || PRIORITY_RANK.indexOf(a.priority) - PRIORITY_RANK.indexOf(b.priority);

/** The Today view: open tasks already overdue, and open tasks due today. */
export async function getTodayTasks() {
  const scope = await getScope();
  const { today, timeZone } = scope;
  const tomorrow = addDays(today, 1, timeZone);
  const open = { ...scope.filter(), deletedAt: null, status: { $in: OPEN_TASK_STATUSES } };
  const tasks = await collection("tasks");
  const [overdue, dueToday] = await Promise.all([
    tasks.find({ ...open, dueAt: { $lt: today } }).limit(200).toArray(),
    tasks.find({ ...open, dueAt: { $gte: today, $lt: tomorrow } }).limit(200).toArray(),
  ]);
  const rows = await decorate(scope, [...overdue.sort(byDueThenPriority), ...dueToday.sort(byDueThenPriority)]);
  return { overdue: rows.slice(0, overdue.length), dueToday: rows.slice(overdue.length) };
}

/** The All view: filtered, sorted and paged with one aggregation. */
export async function getTasksPage(query: TasksQuery) {
  const scope = await getScope();
  const { today, timeZone } = scope;
  const and: Record<string, unknown>[] = [];

  if (query.status.length) {
    const any: Record<string, unknown>[] = [];
    if (query.status.includes("open")) any.push({ status: "open", dueAt: { $gte: today } });
    if (query.status.includes("in_progress")) any.push({ status: "in_progress", dueAt: { $gte: today } });
    if (query.status.includes("overdue")) any.push({ status: { $in: OPEN_TASK_STATUSES }, dueAt: { $lt: today } });
    if (query.status.includes("completed")) any.push({ status: "completed" });
    and.push({ $or: any });
  }
  if (query.priority.length) and.push({ priority: { $in: query.priority } });
  if (query.source.length) and.push({ source: { $in: query.source } });
  if (query.div) {
    // A division outside the lens (or another tenant's) matches nothing rather than widening the lens.
    and.push({ division: scope.divisions.some((d) => d.key === query.div) ? query.div : { $in: [] } });
  }
  if (query.account) and.push({ accountId: query.account });
  if (query.assignee) and.push({ ownerRepId: query.assignee });
  if (query.from || query.to) {
    and.push({
      dueAt: {
        // Whole days on the tenant's calendar: from its midnight up to (not including) the midnight after "to".
        ...(query.from ? { $gte: fromIsoDay(query.from, timeZone) } : {}),
        ...(query.to ? { $lt: addDays(fromIsoDay(query.to, timeZone), 1, timeZone) } : {}),
      },
    });
  }

  const match = { ...baseTaskFilter(scope), ...(and.length ? { $and: and } : {}) };
  const dir = query.dir === "asc" ? 1 : -1;
  const sort =
    query.sort === "priority"
      ? { priorityRank: dir, dueAt: 1, _id: 1 }
      : query.sort === "created"
        ? { createdAt: dir, _id: 1 }
        : { dueAt: dir, priorityRank: 1, _id: 1 };

  const [result] = await (await collection("tasks"))
    .aggregate<{ rows: Task[]; total: { n: number }[] }>([
      { $match: match },
      {
        $facet: {
          rows: [
            { $set: { priorityRank: { $indexOfArray: [PRIORITY_RANK, "$priority"] } } },
            { $sort: sort },
            { $skip: (query.page - 1) * TASK_PAGE_SIZE },
            { $limit: TASK_PAGE_SIZE },
            { $unset: "priorityRank" },
          ],
          total: [{ $count: "n" }],
        },
      },
    ])
    .toArray();
  const total = result?.total[0]?.n ?? 0;
  return {
    rows: await decorate(scope, result?.rows ?? []),
    total,
    pages: Math.max(1, Math.ceil(total / TASK_PAGE_SIZE)),
  };
}

/** Options for the filter bar and the task dialog, all inside the user's scope. */
export async function getTaskOptions() {
  const scope = await getScope();
  const [accountIds, reps] = await Promise.all([
    (await collection("tasks")).distinct("accountId", baseTaskFilter(scope)),
    (await collection("reps")).find({ ...scope.tenant(), active: true }, { projection: { name: 1, team: 1 } }).sort({ name: 1 }).toArray(),
  ]);
  const accounts = await (await collection("accounts"))
    .find({ ...scope.tenant(), _id: { $in: accountIds } }, { projection: { name: 1 } })
    .sort({ name: 1 })
    .toArray();
  const repScope = scope.reps;
  const visibleReps: RepOption[] = reps
    .filter((r) => repScope.all || repScope.repIds.includes(r._id))
    .map((r) => ({ id: r._id, name: r.name, team: r.team }));
  const caps = scope.user.capabilities;
  return {
    accounts: accounts.map((a) => ({ id: a._id, name: a.name })),
    /** People whose tasks the user can see (assignee filter). */
    assignees: visibleReps,
    /** Who the user may assign tasks to; empty means "only yourself". */
    assignable: caps.canAssignTasks ? visibleReps : [],
    canAssign: caps.canAssignTasks,
    ownRepId: scope.user.repId,
    divisions: scope.divisions,
    timeZone: scope.timeZone,
    showDivision: caps.lens,
    title: caps.canAssignTasks ? "Team tasks" : "Your tasks",
  };
}

export type TaskOptions = Awaited<ReturnType<typeof getTaskOptions>>;
