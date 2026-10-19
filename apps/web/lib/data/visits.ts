import "server-only";

import { z } from "zod";

import { collection, type Visit } from "@ambient/db";
import { addDays, startOfWeek } from "@ambient/db/time";

import { CALL_CYCLE_WEEKS, HISTORY_WEEKS, type VisitRow } from "@/lib/visits";

import { getScope, type Scope } from "./scope";

/** URL search params for /call-cycle, parsed leniently. */
export const callCycleQuerySchema = z.object({
  view: z.enum(["list", "week"]).catch("list"),
  wk: z.coerce.number().int().min(0).max(CALL_CYCLE_WEEKS - 1).catch(0),
  /** Narrow to one rep; ignored unless that rep is inside the user's scope. */
  rep: z.string().max(200).catch(""),
});
export type CallCycleQuery = z.infer<typeof callCycleQuerySchema>;

export type RepOption = { id: string; name: string; team: string };

/** Active reps inside the user's rep scope, by name. */
export async function visibleReps(scope: Scope): Promise<RepOption[]> {
  const reps = await (await collection("reps")).find({ ...scope.tenant(), active: true }, { projection: { name: 1, team: 1 } }).sort({ name: 1 }).toArray();
  return reps.filter((r) => scope.reps.all || scope.reps.repIds.includes(r._id)).map((r) => ({ id: r._id, name: r.name, team: r.team }));
}

/** Names for a list of visits: accounts, reps and report authors, in three queries. */
export async function decorateVisits(scope: Scope, visits: Visit[]): Promise<VisitRow[]> {
  const accountIds = [...new Set(visits.map((v) => v.accountId))];
  const authorIds = [...new Set(visits.flatMap((v) => (v.report ? [v.report.capturedByUserId] : [])))];
  const [accounts, reps, users] = await Promise.all([
    (await collection("accounts")).find({ ...scope.tenant(), _id: { $in: accountIds } }, { projection: { name: 1, code: 1 } }).toArray(),
    (await collection("reps")).find(scope.tenant(), { projection: { name: 1 } }).toArray(),
    (await collection("users")).find({ ...scope.tenant(), _id: { $in: authorIds } }, { projection: { name: 1 } }).toArray(),
  ]);
  const account = new Map(accounts.map((a) => [a._id, a]));
  const repName = new Map(reps.map((r) => [r._id, r.name]));
  const userName = new Map(users.map((u) => [u._id, u.name]));
  const tomorrow = addDays(scope.today, 1, scope.timeZone);
  return visits.map((v) => ({
    id: v._id,
    accountId: v.accountId,
    account: account.get(v.accountId)?.name ?? "",
    accountCode: account.get(v.accountId)?.code ?? "",
    repId: v.repId,
    rep: repName.get(v.repId) ?? "",
    type: v.type,
    status: v.status,
    purpose: v.purpose,
    at: v.scheduledAt,
    overdue: v.status === "planned" && v.scheduledAt < scope.today,
    due: v.scheduledAt < tomorrow,
    report: v.report && {
      sentiment: v.report.sentiment,
      relationship: v.report.relationship,
      commercial: v.report.commercial,
      service: v.report.service,
      keyPoints: v.report.keyPoints,
      followUps: v.report.followUps,
      capturedAt: v.report.capturedAt,
      capturedBy: userName.get(v.report.capturedByUserId) ?? "",
    },
  }));
}

/**
 * The call cycle: six weeks from this Monday (on the tenant's calendar), the
 * four weeks before as history, and every planned visit whose day has passed
 * so it can be closed off.
 */
export async function getCallCycle(query: CallCycleQuery) {
  const scope = await getScope();
  const { timeZone } = scope;
  const caps = scope.user.capabilities;
  const reps = await visibleReps(scope);
  const rep = reps.some((r) => r.id === query.rep) ? query.rep : "";

  const weekStart = startOfWeek(new Date(), timeZone);
  const from = addDays(weekStart, -7 * HISTORY_WEEKS, timeZone);
  const to = addDays(weekStart, 7 * CALL_CYCLE_WEEKS, timeZone);
  const base = { ...scope.filter("repId"), deletedAt: null, status: { $ne: "cancelled" as const }, ...(rep ? { repId: rep } : {}) };

  const visits = await collection("visits");
  const [inRange, overdueOlder] = await Promise.all([
    visits.find({ ...base, scheduledAt: { $gte: from, $lt: to } }).sort({ scheduledAt: 1, _id: 1 }).limit(1000).toArray(),
    // Planned visits from before the history window still need closing.
    visits.find({ ...base, status: "planned", scheduledAt: { $lt: from } }).sort({ scheduledAt: 1 }).limit(50).toArray(),
  ]);
  const rows = await decorateVisits(scope, [...overdueOlder, ...inRange]);

  const weeks = Array.from({ length: CALL_CYCLE_WEEKS }, (_, i) => {
    const start = addDays(weekStart, i * 7, timeZone);
    const end = addDays(start, 7, timeZone);
    return { start, visits: rows.filter((v) => v.at >= start && v.at < end) };
  });
  return {
    weeks,
    history: rows.filter((v) => v.at >= from && v.at < weekStart).reverse(),
    overdue: rows.filter((v) => v.overdue),
    reps: caps.manager || scope.reps.all ? reps : [],
    rep,
    /** Managers may plan visits for anyone in their scope. */
    assignable: caps.canAssignTasks ? reps : [],
    ownRepId: scope.user.repId,
    timeZone,
    today: scope.today,
    title: caps.manager || scope.reps.all ? "Team call cycle" : "Your call cycle",
  };
}

export type CallCycle = Awaited<ReturnType<typeof getCallCycle>>;
