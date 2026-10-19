import "server-only";

import { OPEN_TASK_STATUSES, collection, type HealthBand, type Interaction } from "@ambient/db";

import type { ChildAccount } from "./accounts";
import { getScope } from "./scope";

export type GroupActivity = {
  id: string;
  type: Interaction["type"];
  summary: string;
  accountId: string;
  account: string;
  by: string;
  at: Date;
};

/**
 * Everything the customer group page shows, or null when the group doesn't
 * exist or is outside the user's scope (shown as "not found" either way).
 */
export async function getGroupProfile(id: string) {
  const scope = await getScope();
  const group = await (await collection("customerGroups")).findOne({ _id: id, ...scope.filter() });
  if (!group) return null;

  const accounts = await collection("accounts");
  const inGroup = { ...scope.filter(), groupId: group._id, active: true };
  const groupAccounts = await accounts
    .find(inGroup, { projection: { _id: 1, type: 1, name: 1, code: 1, parentId: 1, ownerRepId: 1, health: 1, fyRevenue: 1 } })
    .toArray();
  const accountIds = groupAccounts.map((a) => a._id);

  const [reps, openTasks, overdueTasks, interactions] = await Promise.all([
    (await collection("reps")).find(scope.tenant(), { projection: { name: 1, code: 1 } }).toArray(),
    (await collection("tasks")).countDocuments({ ...scope.tenant(), accountId: { $in: accountIds }, deletedAt: null, status: { $in: OPEN_TASK_STATUSES } }),
    (await collection("tasks")).countDocuments({
      ...scope.tenant(),
      accountId: { $in: accountIds },
      deletedAt: null,
      status: { $in: OPEN_TASK_STATUSES },
      dueAt: { $lt: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
    (await collection("interactions"))
      .find({ ...scope.tenant(), accountId: { $in: accountIds }, deletedAt: null })
      .sort({ occurredAt: -1 })
      .limit(5)
      .toArray(),
  ]);

  const repById = new Map(reps.map((r) => [r._id, r]));
  const authorIds = [...new Set(interactions.map((i) => i.authorUserId))];
  const authors = new Map(
    (await (await collection("users")).find({ ...scope.tenant(), _id: { $in: authorIds } }, { projection: { name: 1 } }).toArray()).map((u) => [
      u._id,
      u.name,
    ]),
  );
  const accountName = new Map(groupAccounts.map((a) => [a._id, a.name]));

  const health: Record<HealthBand | "none", number> = { g: 0, a: 0, r: 0, none: 0 };
  for (const a of groupAccounts) health[a.health ?? "none"] += 1;

  const soldToCount = new Map<string, number>();
  for (const a of groupAccounts) if (a.type === "sold_to" && a.parentId) soldToCount.set(a.parentId, (soldToCount.get(a.parentId) ?? 0) + 1);

  const billTos: ChildAccount[] = groupAccounts
    .filter((a) => a.type === "bill_to")
    .sort((a, b) => b.fyRevenue - a.fyRevenue || a._id.localeCompare(b._id))
    .map((a) => ({
      id: a._id,
      name: a.name,
      code: a.code,
      owner: repById.get(a.ownerRepId)?.name ?? "",
      health: a.health,
      fyRevenue: a.fyRevenue,
      children: soldToCount.get(a._id) ?? 0,
    }));

  const owner = repById.get(group.ownerRepId);
  return {
    group: {
      id: group._id,
      name: group.name,
      code: group.code,
      level: group.level,
      division: group.division,
      health: group.health,
      fyRevenue: group.fyRevenue,
      hierarchy: group.hierarchy,
      owner: owner?.name ?? "",
      ownerCode: owner?.code ?? "",
      /** Counts from the customer's systems, which can exceed what Ambient holds. */
      reported: { billTos: group.billToCount, soldTos: group.soldToCount },
      syncedAt: group.syncedAt,
    },
    counts: {
      billTos: billTos.length,
      soldTos: groupAccounts.length - billTos.length,
      openTasks,
      overdueTasks,
    },
    health,
    billTos,
    activity: interactions.map(
      (i): GroupActivity => ({
        id: i._id,
        type: i.type,
        summary: i.summary,
        accountId: i.accountId,
        account: accountName.get(i.accountId) ?? "",
        by: i.authorUserId === "wren" ? "Wren" : (authors.get(i.authorUserId) ?? "Someone"),
        at: i.occurredAt,
      }),
    ),
    showOwner: scope.user.capabilities.manager || scope.reps.all,
  };
}

export type GroupProfile = NonNullable<Awaited<ReturnType<typeof getGroupProfile>>>;
