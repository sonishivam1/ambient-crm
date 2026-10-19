import "server-only";

import { z } from "zod";

import { HEALTH_BANDS, OPEN_TASK_STATUSES, collection, type HealthBand } from "@ambient/db";

import { ownerFilter } from "@/lib/auth/visibility";
import { lensDivisions } from "@/lib/lens";

import { getScope, type Scope } from "./scope";

export const PAGE_SIZE = 25;
export const ACCOUNT_VIEWS = ["group", "bill_to", "sold_to"] as const;
export type AccountView = (typeof ACCOUNT_VIEWS)[number];

/** URL search params for /accounts, parsed leniently: anything invalid falls back to the default. */
export const accountsQuerySchema = z.object({
  view: z.enum(ACCOUNT_VIEWS).catch("group"),
  /** "all" or a division key; checked against the tenant's divisions when the query runs. */
  div: z.string().regex(/^[a-z0-9_-]{1,40}$/).catch("all"),
  health: z.enum(["all", ...HEALTH_BANDS]).catch("all"),
  q: z.string().trim().max(100).catch(""),
  sort: z.enum(["fy", "name", "tasks"]).catch("fy"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type AccountsQuery = z.infer<typeof accountsQuerySchema>;

export type HealthMix = { g: number; a: number; r: number };
export type Summary = { total: number; fyRevenue: number; health: HealthMix };

export type GroupRow = {
  id: string;
  name: string;
  code: string;
  level: "conglomerate" | "corporation" | "standalone";
  hierarchy: { cg1: string; cg2: string; cg3: string };
  billToCount: number;
  soldToCount: number;
  owner: string;
  ownerCode: string;
  health: HealthBand | null;
  fyRevenue: number;
};

export type AccountRow = {
  id: string;
  type: "bill_to" | "sold_to";
  name: string;
  code: string;
  site: string;
  segment: string;
  owner: string;
  health: HealthBand | null;
  fyRevenue: number;
  openTasks: number;
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Base filter: tenant + rep scope, with the lens and the page's division filter intersected. */
function baseFilter(scope: Scope, query: Pick<AccountsQuery, "div" | "health" | "q">) {
  const lensKeys = lensDivisions(scope.lens, scope.user.tenant);
  // A division outside the lens (or another tenant's) matches nothing rather than widening the lens.
  const division =
    query.div === "all" ? (lensKeys ? { $in: lensKeys } : undefined) : { $in: scope.divisions.some((d) => d.key === query.div) ? [query.div] : [] };
  const filter: Record<string, unknown> = { ...scope.tenant(), ...ownerFilter(scope.reps), ...(division ? { division } : {}) };
  if (query.health !== "all") filter.health = query.health;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), "i");
    filter.$or = [{ name: pattern }, { code: pattern }];
  }
  return filter;
}

const summaryStage = {
  $group: {
    _id: null,
    total: { $sum: 1 },
    fyRevenue: { $sum: "$fyRevenue" },
    g: { $sum: { $cond: [{ $eq: ["$health", "g"] }, 1, 0] } },
    a: { $sum: { $cond: [{ $eq: ["$health", "a"] }, 1, 0] } },
    r: { $sum: { $cond: [{ $eq: ["$health", "r"] }, 1, 0] } },
  },
};
type SummaryDoc = { total: number; fyRevenue: number; g: number; a: number; r: number };
const toSummary = (s: SummaryDoc | undefined): Summary => ({
  total: s?.total ?? 0,
  fyRevenue: s?.fyRevenue ?? 0,
  health: { g: s?.g ?? 0, a: s?.a ?? 0, r: s?.r ?? 0 },
});

async function repDirectory(scope: Scope) {
  const reps = await (await collection("reps")).find(scope.tenant(), { projection: { name: 1, code: 1 } }).toArray();
  return new Map(reps.map((r) => [r._id, { name: r.name, code: r.code }]));
}

export async function getAccountsPage(query: AccountsQuery) {
  const scope = await getScope();
  const filter = baseFilter(scope, query);
  const dir = query.dir === "asc" ? 1 : -1;
  const skip = (query.page - 1) * PAGE_SIZE;
  const reps = await repDirectory(scope);
  const showOwner = scope.user.capabilities.manager || scope.reps.all;

  if (query.view === "group") {
    const sortKey = query.sort === "name" ? "name" : "fyRevenue";
    const [result] = await (await collection("customerGroups"))
      .aggregate<{ rows: GroupRowDoc[]; summary: SummaryDoc[] }>([
        { $match: filter },
        {
          $facet: {
            rows: [{ $sort: { [sortKey]: dir, _id: 1 } }, { $skip: skip }, { $limit: PAGE_SIZE }],
            summary: [summaryStage],
          },
        },
      ])
      .toArray();
    const summary = toSummary(result?.summary[0]);
    const rows: GroupRow[] = (result?.rows ?? []).map((g) => ({
      id: g._id,
      name: g.name,
      code: g.code,
      level: g.level,
      hierarchy: g.hierarchy,
      billToCount: g.billToCount,
      soldToCount: g.soldToCount,
      owner: reps.get(g.ownerRepId)?.name ?? "",
      ownerCode: reps.get(g.ownerRepId)?.code ?? "",
      health: g.health,
      fyRevenue: g.fyRevenue,
    }));
    return { kind: "group" as const, rows, summary, query, showOwner, global: scope.reps.all, pages: Math.max(1, Math.ceil(summary.total / PAGE_SIZE)) };
  }

  const sort =
    query.sort === "name" ? { name: dir, _id: 1 } : query.sort === "tasks" ? { openTasks: dir, fyRevenue: -1, _id: 1 } : { fyRevenue: dir, _id: 1 };
  const [result] = await (await collection("accounts"))
    .aggregate<{ rows: AccountRowDoc[]; summary: SummaryDoc[] }>([
      { $match: { ...filter, type: query.view, active: true } },
      {
        $facet: {
          rows: [
            {
              $lookup: {
                from: "tasks",
                let: { accountId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      tenantId: scope.tenantId,
                      deletedAt: null,
                      status: { $in: OPEN_TASK_STATUSES },
                      $expr: { $eq: ["$accountId", "$$accountId"] },
                    },
                  },
                  { $count: "n" },
                ],
                as: "taskCount",
              },
            },
            { $set: { openTasks: { $ifNull: [{ $first: "$taskCount.n" }, 0] } } },
            { $sort: sort },
            { $skip: skip },
            { $limit: PAGE_SIZE },
            { $project: { taskCount: 0 } },
          ],
          summary: [summaryStage],
        },
      },
    ])
    .toArray();
  const summary = toSummary(result?.summary[0]);
  const rows: AccountRow[] = (result?.rows ?? []).map((a) => ({
    id: a._id,
    type: a.type,
    name: a.name,
    code: a.code,
    site: a.site,
    segment: a.segment,
    owner: reps.get(a.ownerRepId)?.name ?? "",
    health: a.health,
    fyRevenue: a.fyRevenue,
    openTasks: a.openTasks,
  }));
  return { kind: "account" as const, rows, summary, query, showOwner, global: scope.reps.all, pages: Math.max(1, Math.ceil(summary.total / PAGE_SIZE)) };
}

type GroupRowDoc = {
  _id: string;
  name: string;
  code: string;
  level: GroupRow["level"];
  hierarchy: GroupRow["hierarchy"];
  billToCount: number;
  soldToCount: number;
  ownerRepId: string;
  health: HealthBand | null;
  fyRevenue: number;
};
type AccountRowDoc = {
  _id: string;
  type: AccountRow["type"];
  name: string;
  code: string;
  site: string;
  segment: string;
  ownerRepId: string;
  health: HealthBand | null;
  fyRevenue: number;
  openTasks: number;
};

export type ChildAccount = { id: string; name: string; code: string; owner: string; health: HealthBand | null; fyRevenue: number; children: number };

/** Bill-tos in a group, or sold-tos under a bill-to, within the user's scope. */
export async function getChildAccounts(parent: { groupId: string } | { billToId: string }): Promise<ChildAccount[]> {
  const scope = await getScope();
  const reps = await repDirectory(scope);
  const accounts = await collection("accounts");
  const match =
    "groupId" in parent
      ? { ...scope.filter(), groupId: parent.groupId, type: "bill_to" as const, active: true }
      : { ...scope.filter(), parentId: parent.billToId, type: "sold_to" as const, active: true };
  const rows = await accounts.find(match).sort({ fyRevenue: -1, _id: 1 }).limit(200).toArray();
  const childCounts =
    "groupId" in parent
      ? new Map(
          (
            await accounts
              .aggregate<{ _id: string; n: number }>([
                { $match: { ...scope.filter(), parentId: { $in: rows.map((r) => r._id) }, active: true } },
                { $group: { _id: "$parentId", n: { $sum: 1 } } },
              ])
              .toArray()
          ).map((c) => [c._id, c.n]),
        )
      : new Map<string, number>();
  return rows.map((a) => ({
    id: a._id,
    name: a.name,
    code: a.code,
    owner: reps.get(a.ownerRepId)?.name ?? "",
    health: a.health,
    fyRevenue: a.fyRevenue,
    children: childCounts.get(a._id) ?? 0,
  }));
}

export type AccountsPage = Awaited<ReturnType<typeof getAccountsPage>>;
