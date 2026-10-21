"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { collection, getClient } from "@ambient/db";

import { audit } from "@/lib/audit";
import { getScope } from "@/lib/data/scope";
import { loggedAction } from "@/lib/log";
import { assignableRepIds, createTaskInput, createTasks, dueFromIso, notifyAssignees, taskFields } from "@/lib/writes/tasks";

export type TaskActionResult = { ok: true; created?: number } | { ok: false; error: string };

const taskId = z.string().min(1).max(200);

const updateInput = z.object({
  id: taskId,
  status: z.enum(["open", "in_progress", "completed"]),
  ownerRepId: z.string().min(1).max(200).optional(),
  ...taskFields,
});

const cancelInput = z.object({ id: taskId, reason: z.string().trim().max(300).default("") });

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input.";

/**
 * Create a task on a bill-to account the user can see (rules in
 * lib/writes/tasks.ts, shared with Wren's proposals).
 */
export const createTask = loggedAction("tasks.create", async function createTask(raw: unknown): Promise<TaskActionResult> {
  const parsed = createTaskInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await createTasks(await getScope(), parsed.data);
  if (!result.ok) return result;
  refresh();
  return { ok: true, created: result.ids.length };
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
