import "server-only";

import { collection } from "@ambient/db";

import type { Scope } from "@/lib/data/scope";
import { getTasksPage, tasksQuerySchema } from "@/lib/data/tasks";
import { decorateVisits } from "@/lib/data/visits";

import { factsBuilder, type FactPacket } from "../facts";

import { factDate } from "./format";
import { addTask, addVisit } from "./records";

/** At most this many of the account's open tasks, to check suggestions against. */
export const VISIT_OPEN_TASKS = 15;

/**
 * Facts for follow-up suggestions: one of the user's own completed visits with
 * its report (key points and follow-ups fenced), and the account's open tasks.
 * Null when the visit isn't the user's own, isn't completed, or has no report.
 */
export async function visitFacts(scope: Scope, input: { visitId: string }): Promise<FactPacket | null> {
  if (!scope.user.repId) return null;
  const visit = await (await collection("visits")).findOne({
    _id: input.visitId,
    ...scope.filter("repId"),
    repId: scope.user.repId,
    deletedAt: null,
    status: "completed",
    report: { $ne: null },
  });
  if (!visit) return null;
  const tz = scope.timeZone;
  const [[row], tasks] = await Promise.all([
    decorateVisits(scope, [visit]),
    getTasksPage(tasksQuerySchema.parse({ view: "all", status: "overdue,open,in_progress", account: visit.accountId, sort: "due" })),
  ]);
  const f = factsBuilder();
  return f.build({
    today: factDate(scope.today, tz),
    visitDate: factDate(visit.scheduledAt, tz),
    visit: addVisit(f, row!, tz, { withAccount: true }),
    openTasks: tasks.rows.slice(0, VISIT_OPEN_TASKS).map((t) => addTask(f, t, tz)),
  });
}
