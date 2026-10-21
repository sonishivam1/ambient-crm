import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { TASK_PRIORITIES, collection, getClient, type ClientSession, type Notification, type Task } from "@ambient/db";
import { fromIsoDay } from "@ambient/db/time";

import { audit } from "@/lib/audit";
import type { Scope } from "@/lib/data/scope";
import { fmtDay } from "@/lib/format";

/**
 * Task rules shared by the task actions and Wren's proposals, so a task
 * accepted from a proposal goes through exactly the same checks as the form.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date.");

/** Tasks are due at the end of the working day they're set for, on the tenant's clock. */
export const dueFromIso = (iso: string, timeZone: string) => fromIsoDay(iso, timeZone, 17, 0);

export const taskFields = {
  title: z.string().trim().min(1, "Add a title.").max(200, "Keep the title under 200 characters."),
  dueDate: isoDate,
  priority: z.enum(TASK_PRIORITIES),
  description: z.string().trim().max(2000, "Keep the description under 2,000 characters.").default(""),
  notes: z.string().trim().max(4000, "Keep the notes under 4,000 characters.").default(""),
};

export const createTaskInput = z.object({
  accountId: z.string().min(1, "Choose an account.").max(200),
  assigneeRepIds: z.array(z.string().min(1).max(200)).max(20).default([]),
  ...taskFields,
});
export type CreateTaskInput = z.infer<typeof createTaskInput>;

/** Reps the user may assign to: active, in the tenant, and inside the user's rep scope. */
export async function assignableRepIds(scope: Scope, requested: string[]) {
  const reps = await (await collection("reps"))
    .find({ ...scope.tenant(), _id: { $in: requested }, active: true }, { projection: { _id: 1 } })
    .toArray();
  const found = new Set(reps.map((r) => r._id));
  const repScope = scope.reps;
  return requested.filter((id) => found.has(id) && (repScope.all || repScope.repIds.includes(id)));
}

/** Tell each assignee who isn't the creator, inside the same transaction. */
export async function notifyAssignees(scope: Scope, tasks: Task[], session: ClientSession) {
  const others = tasks.filter((t) => t.ownerRepId !== scope.user.repId);
  if (!others.length) return;
  const users = await (await collection("users"))
    .find({ ...scope.tenant(), repId: { $in: others.map((t) => t.ownerRepId) }, deletedAt: null }, { projection: { repId: 1 }, session })
    .toArray();
  const now = new Date();
  const notifications: Notification[] = others.flatMap((t) =>
    users
      .filter((u) => u.repId === t.ownerRepId)
      .map((u) => ({
        _id: randomUUID(),
        tenantId: scope.tenantId,
        userId: u._id,
        type: "task_assigned" as const,
        accountId: t.accountId,
        title: `${scope.user.name} assigned you a task`,
        body: `${t.title} · due ${fmtDay(t.dueAt, scope.timeZone)}`,
        readAt: null,
        createdAt: now,
      })),
  );
  if (notifications.length) await (await collection("notifications")).insertMany(notifications, { session });
}

export type CreateTasksResult = { ok: true; ids: string[] } | { ok: false; error: string };

/**
 * Create a task on a bill-to account the user can see. Managers may assign it
 * to one or more reps in their scope (one task each); everyone else creates it
 * for themselves. A task can't be created already overdue. `fromWren` marks a
 * task accepted from one of Wren's proposals (source "ai"); the user is still
 * its creator.
 */
export async function createTasks(scope: Scope, input: CreateTaskInput, opts: { fromWren?: boolean } = {}): Promise<CreateTasksResult> {
  const dueAt = dueFromIso(input.dueDate, scope.timeZone);
  if (dueAt < scope.today) return { ok: false, error: "The due date can't be in the past." };

  const { user } = scope;
  let owners: string[];
  if (input.assigneeRepIds.length && user.capabilities.canAssignTasks) {
    owners = await assignableRepIds(scope, [...new Set(input.assigneeRepIds)]);
    if (owners.length !== new Set(input.assigneeRepIds).size) return { ok: false, error: "You can't assign tasks to one of those people." };
  } else if (user.repId) {
    owners = [user.repId];
  } else {
    return { ok: false, error: "Choose who this task is for." };
  }

  const accounts = await collection("accounts");
  const tasks = await collection("tasks");
  const client = await getClient();
  let result: CreateTasksResult = { ok: false, error: "Account not found." };

  await client.withSession((session) =>
    session.withTransaction(async () => {
      const account = await accounts.findOne({ _id: input.accountId, ...scope.filter(), type: "bill_to", active: true }, { session });
      if (!account) return;
      const now = new Date();
      const docs: Task[] = owners.map((ownerRepId) => ({
        _id: randomUUID(),
        tenantId: scope.tenantId,
        accountId: account._id,
        division: account.division,
        title: input.title,
        description: input.description,
        notes: input.notes,
        ownerRepId,
        dueAt,
        priority: input.priority,
        status: "open",
        source: opts.fromWren ? "ai" : ownerRepId === user.repId ? "manual" : "manager_assigned",
        createdByUserId: user._id,
        completedAt: null,
        cancelReason: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deletedBy: null,
      }));
      await tasks.insertMany(docs, { session });
      for (const t of docs) {
        await audit(
          user,
          {
            action: "task.create",
            entity: "task",
            entityId: t._id,
            before: null,
            after: { accountId: t.accountId, title: t.title, ownerRepId: t.ownerRepId, dueAt: t.dueAt, priority: t.priority, source: t.source },
          },
          session,
        );
      }
      await notifyAssignees(scope, docs, session);
      result = { ok: true, ids: docs.map((t) => t._id) };
    }),
  );
  return result;
}
