import "server-only";

import { OPEN_TASK_STATUSES, collection, type HealthBand, type Interaction, type Task, type Visit } from "@ambient/db";

import { SENTIMENT_LABEL } from "@/lib/visits";

import { getAccountContacts } from "./contacts";
import { getScope } from "./scope";

export type TimelineItem =
  | { kind: "interaction"; id: string; type: Interaction["type"]; title: string; body: string; by: string; at: Date }
  | { kind: "visit"; id: string; type: Visit["type"]; title: string; body: string; by: string; at: Date }
  | { kind: "task"; id: string; title: string; body: string; by: string; at: Date };

export type ProfileTask = {
  id: string;
  title: string;
  owner: string;
  dueAt: Date;
  priority: Task["priority"];
  status: Task["status"];
  source: Task["source"];
  overdue: boolean;
};

export type RelatedAccount = { id: string; name: string; code: string; type: "bill_to" | "sold_to"; health: HealthBand | null; fyRevenue: number };

const INTERACTION_TITLE: Record<Interaction["type"], string> = { note: "Note", call: "Call", meeting: "Meeting" };
const VISIT_TITLE: Record<Visit["type"], string> = { site: "Site visit", call: "Call", meeting: "Meeting" };

/**
 * Everything the customer profile shows, or null when the account doesn't
 * exist or is outside the user's scope (the page shows "not found" for both,
 * so existence never leaks).
 */
export async function getAccountProfile(id: string) {
  const scope = await getScope();
  const accounts = await collection("accounts");
  const account = await accounts.findOne({ _id: id, ...scope.filter(), active: true });
  if (!account) return null;

  const now = new Date();
  const startOfToday = scope.today;
  const byAccount = { ...scope.tenant(), accountId: account._id };

  const [group, parent, related, reps, users, tasks, visits, interactions, contacts] = await Promise.all([
    (await collection("customerGroups")).findOne({ ...scope.tenant(), _id: account.groupId }),
    account.parentId ? accounts.findOne({ ...scope.filter(), _id: account.parentId, active: true }) : null,
    account.type === "bill_to"
      ? accounts.find({ ...scope.filter(), parentId: account._id, active: true }).sort({ fyRevenue: -1 }).limit(50).toArray()
      : accounts
          .find({ ...scope.filter(), parentId: account.parentId, _id: { $ne: account._id }, active: true })
          .sort({ fyRevenue: -1 })
          .limit(50)
          .toArray(),
    (await collection("reps")).find(scope.tenant(), { projection: { name: 1 } }).toArray(),
    (await collection("users")).find(scope.tenant(), { projection: { name: 1 } }).toArray(),
    (await collection("tasks")).find({ ...byAccount, deletedAt: null }).sort({ dueAt: 1 }).toArray(),
    (await collection("visits")).find({ ...byAccount, deletedAt: null, status: { $ne: "cancelled" } }).sort({ scheduledAt: 1 }).toArray(),
    (await collection("interactions")).find({ ...byAccount, deletedAt: null }).sort({ occurredAt: -1 }).limit(100).toArray(),
    getAccountContacts(scope, account),
  ]);

  const repName = new Map(reps.map((r) => [r._id, r.name]));
  const userName = new Map(users.map((u) => [u._id, u.name]));
  const actorName = (id: string) => (id === "wren" ? "Wren" : (userName.get(id) ?? "Someone"));

  const openTasks = tasks.filter((t) => OPEN_TASK_STATUSES.includes(t.status));
  const overdue = openTasks.filter((t) => t.dueAt < startOfToday).length;
  const nextVisit = visits.find((v) => v.status === "planned" && v.scheduledAt >= startOfToday) ?? null;
  const lastTouch = [
    ...interactions.map((i) => i.occurredAt),
    ...visits.filter((v) => v.status === "completed").map((v) => v.scheduledAt),
  ].sort((a, b) => b.getTime() - a.getTime())[0];

  const timeline: TimelineItem[] = [
    ...interactions.map((i): TimelineItem => ({
      kind: "interaction",
      id: i._id,
      type: i.type,
      title: INTERACTION_TITLE[i.type],
      body: i.summary,
      by: actorName(i.authorUserId),
      at: i.occurredAt,
    })),
    ...visits
      .filter((v) => v.status === "completed")
      .map((v): TimelineItem => ({
        kind: "visit",
        id: v._id,
        type: v.type,
        title: `${VISIT_TITLE[v.type]} completed${v.report ? ` · ${SENTIMENT_LABEL[v.report.sentiment]}` : ""}`,
        body: v.purpose,
        by: repName.get(v.repId) ?? "",
        at: v.scheduledAt,
      })),
    ...tasks
      .filter((t) => t.status === "completed" && t.completedAt)
      .map((t): TimelineItem => ({
        kind: "task",
        id: t._id,
        title: "Task completed",
        body: t.title,
        by: repName.get(t.ownerRepId) ?? "",
        at: t.completedAt!,
      })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const toRelated = (a: typeof account): RelatedAccount => ({
    id: a._id,
    name: a.name,
    code: a.code,
    type: a.type,
    health: a.health,
    fyRevenue: a.fyRevenue,
  });

  return {
    now,
    timeZone: scope.timeZone,
    account: {
      id: account._id,
      name: account.name,
      code: account.code,
      type: account.type,
      site: account.site,
      segment: account.segment,
      division: account.division,
      divisionLabel: scope.divisionLabel(account.division),
      health: account.health,
      fyRevenue: account.fyRevenue,
      owner: repName.get(account.ownerRepId) ?? "",
      syncedAt: account.syncedAt,
    },
    group: group && { id: group._id, name: group.name, level: group.level, health: group.health, fyRevenue: group.fyRevenue },
    parent: parent && toRelated(parent),
    related: related.map(toRelated),
    counts: { openTasks: openTasks.length, overdue, completedTasks: tasks.length - openTasks.length },
    nextVisit: nextVisit && {
      id: nextVisit._id,
      type: nextVisit.type,
      purpose: nextVisit.purpose,
      at: nextVisit.scheduledAt,
      rep: repName.get(nextVisit.repId) ?? "",
    },
    lastTouch: lastTouch ?? null,
    tasks: tasks
      .filter((t) => t.status !== "cancelled")
      .map(
        (t): ProfileTask => ({
          id: t._id,
          title: t.title,
          owner: repName.get(t.ownerRepId) ?? "",
          dueAt: t.dueAt,
          priority: t.priority,
          status: t.status,
          source: t.source,
          overdue: OPEN_TASK_STATUSES.includes(t.status) && t.dueAt < startOfToday,
        }),
      ),
    timeline,
    contacts,
    contactRoles: scope.user.tenant.contactRoles,
  };
}

export type AccountProfile = NonNullable<Awaited<ReturnType<typeof getAccountProfile>>>;
