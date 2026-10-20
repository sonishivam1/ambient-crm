"use server";

import { randomUUID } from "node:crypto";

import { refresh } from "next/cache";
import { z } from "zod";

import { TASK_PRIORITIES, collection, getClient, type ClientSession, type Notification, type Task } from "@ambient/db";
import { fromIsoDay } from "@ambient/db/time";

import { audit } from "@/lib/audit";
import { getScope, type Scope } from "@/lib/data/scope";
import { fmtDay } from "@/lib/format";
import { loggedAction } from "@/lib/log";

export type TaskActionResult = { ok: true; created?: number } | { ok: false; error: string };

const taskId = z.string().min(1).max(200);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date.");

/** Tasks are due at the end of the working day they're set for, on the tenant's clock. */
const dueFromIso = (iso: string, timeZone: string) => fromIsoDay(iso, timeZone, 17, 0);

const fields = {
  title: z.string().trim().min(1, "Add a title.").max(200, "Keep the title under 200 characters."),
  dueDate: isoDate,
  priority: z.enum(TASK_PRIORITIES),
  description: z.string().trim().max(2000, "Keep the description under 2,000 characters.").default(""),
  notes: z.string().trim().max(4000, "Keep the notes under 4,000 characters.").default(""),
};

const createInput = z.object({
  accountId: z.string().min(1, "Choose an account.").max(200),
  assigneeRepIds: z.array(z.string().min(1).max(200)).max(20).default([]),
  ...fields,
});

const updateInput = z.object({
  id: taskId,
  status: z.enum(["open", "in_progress", "completed"]),
  ownerRepId: z.string().min(1).max(200).optional(),
  ...fields,
});

const cancelInput = z.object({ id: taskId, reason: z.string().trim().max(300).default("") });

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input.";

/** Reps the user may assign to: active, in the tenant, and inside the user's rep scope. */
async function assignableRepIds(scope: Scope, requested: string[]) {
  const reps = await (await collection("reps"))
    .find({ ...scope.tenant(), _id: { $in: requested }, active: true }, { projection: { _id: 1 } })
    .toArray();
  const found = new Set(reps.map((r) => r._id));
  const repScope = scope.reps;
  return requested.filter((id) => found.has(id) && (repScope.all || repScope.repIds.includes(id)));
}

/** Tell each assignee who isn't the creator, inside the same transaction. */
async function notifyAssignees(scope: Scope, tasks: Task[], session: ClientSession) {
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

/**
 * Create a task on a bill-to account the user can see. Managers may assign it
 * to one or more reps in their scope (one task each); everyone else creates it
 * for themselves. A task can't be created already overdue.
 */
export const createTask = loggedAction("tasks.create", async function createTask(raw: unknown): Promise<TaskActionResult> {
  const parsed = createInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;
  const scope = await getScope();
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
  let result: TaskActionResult = { ok: true, created: owners.length };

  await client.withSession((session) =>
    session.withTransaction(async () => {
      const account = await accounts.findOne({ _id: input.accountId, ...scope.filter(), type: "bill_to", active: true }, { session });
      if (!account) {
        result = { ok: false, error: "Account not found." };
        return;
      }
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
        source: ownerRepId === user.repId ? "manual" : "manager_assigned",
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
    }),
  );
  if (result.ok) refresh();
  return result;
});

/** Edit a task in scope. Reassigning needs the assign capability; description and notes text never reach the audit log. */
export const updateTask = loggedAction("tasks.update", async function updateTask(raw: unknown): Promise<TaskActionResult> {
  const parsed = updateInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;
  const scope = await getScope();
  const { user } = scope;
  const tasks = await collection("tasks");
  const client = await getClient();
  let result: TaskActionResult = { ok: true };

  if (input.ownerRepId && user.capabilities.canAssignTasks) {
    const allowed = await assignableRepIds(scope, [input.ownerRepId]);
    if (!allowed.length) return { ok: false, error: "You can't assign tasks to that person." };
  }

  await client.withSession((session) =>
    session.withTransaction(async () => {
      const before = await tasks.findOne({ _id: input.id, ...scope.filter(), deletedAt: null, status: { $ne: "cancelled" } }, { session });
      if (!before) {
        result = { ok: false, error: "Task not found." };
        return;
      }
      const dueAt = dueFromIso(input.dueDate, scope.timeZone);
      const dueChanged = dueAt.getTime() !== before.dueAt.getTime();
      if (dueChanged && dueAt < scope.today) {
        result = { ok: false, error: "The due date can't be in the past." };
        return;
      }
      const ownerRepId = input.ownerRepId && user.capabilities.canAssignTasks ? input.ownerRepId : before.ownerRepId;
      const now = new Date();
      const next = {
        title: input.title,
        description: input.description,
        notes: input.notes,
        dueAt: dueChanged ? dueAt : before.dueAt,
        priority: input.priority,
        status: input.status,
        ownerRepId,
        completedAt: input.status === "completed" ? (before.completedAt ?? now) : null,
        updatedAt: now,
      };
      await tasks.updateOne({ _id: before._id }, { $set: next }, { session });

      const tracked = ["title", "dueAt", "priority", "status", "ownerRepId"] as const;
      const changedBefore: Record<string, unknown> = {};
      const changedAfter: Record<string, unknown> = {};
      for (const key of tracked) {
        const a = before[key];
        const b = next[key];
        if ((a instanceof Date && b instanceof Date ? a.getTime() !== b.getTime() : a !== b)) {
          changedBefore[key] = a;
          changedAfter[key] = b;
        }
      }
      if ((before.description ?? "") !== next.description) changedAfter.descriptionChanged = true;
      if ((before.notes ?? "") !== next.notes) changedAfter.notesChanged = true;
      if (Object.keys(changedAfter).length) {
        await audit(user, { action: "task.update", entity: "task", entityId: before._id, before: changedBefore, after: changedAfter }, session);
      }
      if (ownerRepId !== before.ownerRepId) await notifyAssignees(scope, [{ ...before, ...next }], session);
    }),
  );
  if (result.ok) refresh();
  return result;
});

/** Cancel a task in scope with an optional short reason. */
export const cancelTask = loggedAction("tasks.cancel", async function cancelTask(raw: unknown): Promise<TaskActionResult> {
  const parsed = cancelInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id, reason } = parsed.data;
  const scope = await getScope();
  const tasks = await collection("tasks");
  const client = await getClient();
  let result: TaskActionResult = { ok: true };

  await client.withSession((session) =>
    session.withTransaction(async () => {
      const before = await tasks.findOne({ _id: id, ...scope.filter(), deletedAt: null }, { session });
      if (!before || before.status === "cancelled") {
        result = { ok: false, error: "Task not found." };
        return;
      }
      await tasks.updateOne(
        { _id: id },
        { $set: { status: "cancelled", cancelReason: reason || null, updatedAt: new Date() } },
        { session },
      );
      await audit(
        scope.user,
        { action: "task.cancel", entity: "task", entityId: id, before: { status: before.status }, after: { status: "cancelled", reason: reason || null } },
        session,
      );
    }),
  );
  if (result.ok) refresh();
  return result;
});

/** Mark a visible task complete, writing the change and its audit row in one transaction. */
export const completeTask = loggedAction("tasks.complete", async function completeTask(rawId: string) {
  const id = taskId.parse(rawId);
  const scope = await getScope();
  const tasks = await collection("tasks");
  const client = await getClient();

  await client.withSession((session) =>
    session.withTransaction(async () => {
      const before = await tasks.findOne({ _id: id, ...scope.filter(), deletedAt: null }, { session });
      if (!before) throw new Error("Task not found.");
      if (before.status === "completed") return;
      const at = new Date();
      await tasks.updateOne({ _id: id }, { $set: { status: "completed", completedAt: at, updatedAt: at } }, { session });
      await audit(
        scope.user,
        { action: "task.complete", entity: "task", entityId: id, before: { status: before.status }, after: { status: "completed" } },
        session,
      );
    }),
  );
  refresh();
});
