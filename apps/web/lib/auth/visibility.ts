import "server-only";

import { cache } from "react";

import { collection } from "@ambient/db";

import type { SessionUser } from "./session";

/** Which reps' books the user can see. `{ all: true }` means every rep in the tenant (global roles). */
export type RepScope = { all: true } | { all: false; repIds: string[] };

/**
 * Account visibility, checked on every page and query, always within the
 * user's tenant:
 * - user: their own book
 * - manager: plus direct reports
 * - senior: plus the whole reporting subtree (recursive on managerRepId)
 * - lead / super: everything
 * - admin: nothing on its own (admin is a separate ladder)
 */
export const getRepScope = cache(async (user: SessionUser): Promise<RepScope> => {
  const { visibility } = user.capabilities;
  const { tenantId } = user;
  if (visibility === "all") return { all: true };
  if (visibility === "none" || !user.repId) return { all: false, repIds: [] };
  if (visibility === "own") return { all: false, repIds: [user.repId] };

  const reps = await collection("reps");
  if (visibility === "reports") {
    const direct = await reps
      .find({ tenantId, managerRepId: user.repId, active: true }, { projection: { _id: 1 } })
      .toArray();
    return { all: false, repIds: [user.repId, ...direct.map((r) => r._id)] };
  }

  const [tree] = await reps
    .aggregate<{ subtree: { _id: string }[] }>([
      { $match: { tenantId, _id: user.repId } },
      {
        $graphLookup: {
          from: "reps",
          startWith: "$_id",
          connectFromField: "_id",
          connectToField: "managerRepId",
          as: "subtree",
          restrictSearchWithMatch: { tenantId, active: true },
        },
      },
      { $project: { "subtree._id": 1 } },
    ])
    .toArray();
  return { all: false, repIds: [user.repId, ...(tree?.subtree.map((r) => r._id) ?? [])] };
});

/** A MongoDB filter on an owner field that applies the user's rep scope. */
export function ownerFilter(scope: RepScope, field = "ownerRepId"): Record<string, unknown> {
  return scope.all ? {} : { [field]: { $in: scope.repIds } };
}
