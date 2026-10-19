import { describe, expect, it } from "vitest";

import { collection } from "@ambient/db";

import { cancelTask, completeTask, createTask, updateTask } from "@/app/actions/tasks";
import { isoDay } from "@/lib/format";
import { getTasksPage, getTodayTasks, tasksQuerySchema } from "@/lib/data/tasks";

import { USERS, signInAs } from "../support/session";

const inDays = (n: number) => isoDay(new Date(Date.now() + n * 86_400_000));
const base = { accountId: "northwind:CO-ACME-BT1", priority: "normal" as const, description: "", notes: "" };
const query = (params: Record<string, string> = {}) => tasksQuerySchema.parse({ view: "all", ...params });

async function auditFor(entityId: string) {
  return (await collection("auditLog")).find({ entityId }).sort({ at: 1 }).toArray();
}

describe("creating tasks", () => {
  it("refuses a due date in the past", async () => {
    signInAs(USERS.northwind.rep);
    const result = await createTask({ ...base, title: "Past", dueDate: inDays(-1) });
    expect(result).toEqual({ ok: false, error: "The due date can't be in the past." });
  });

  it("creates a rep's task for themselves, even if they try to assign it", async () => {
    signInAs(USERS.northwind.rep);
    const result = await createTask({ ...base, title: "Rep self task", dueDate: inDays(2), assigneeRepIds: ["northwind:r2"] });
    expect(result).toEqual({ ok: true, created: 1 });
    const task = await (await collection("tasks")).findOne({ title: "Rep self task" });
    expect(task).toMatchObject({ tenantId: "northwind", ownerRepId: "northwind:r1", source: "manual", status: "open", division: "uniforms" });
  });

  it("refuses accounts outside the user's scope", async () => {
    signInAs(USERS.northwind.rep);
    const result = await createTask({ ...base, accountId: "northwind:CG-BRIGHTWELL-BT1", title: "Not mine", dueDate: inDays(1) });
    expect(result).toEqual({ ok: false, error: "Account not found." });
    expect(await (await collection("tasks")).countDocuments({ title: "Not mine" })).toBe(0);
  });

  it("refuses another tenant's account", async () => {
    signInAs(USERS.harbor.super);
    const result = await createTask({ ...base, title: "Cross tenant", dueDate: inDays(1), assigneeRepIds: ["harbor:r2"] });
    expect(result.ok).toBe(false);
  });

  it("lets a manager assign to several reports: one task each, a notification each, an audit row each", async () => {
    signInAs(USERS.northwind.manager);
    const result = await createTask({
      ...base,
      title: "Team follow-up",
      dueDate: inDays(3),
      notes: "Private checklist text",
      assigneeRepIds: ["northwind:r1", "northwind:r8"],
    });
    expect(result).toEqual({ ok: true, created: 2 });

    const tasks = await (await collection("tasks")).find({ title: "Team follow-up" }).toArray();
    expect(tasks.map((t) => t.ownerRepId).sort()).toEqual(["northwind:r1", "northwind:r8"]);
    expect(tasks.every((t) => t.source === "manager_assigned" && t.createdByUserId === USERS.northwind.manager)).toBe(true);

    const notes = await (await collection("notifications")).find({ type: "task_assigned", body: /^Team follow-up/ }).toArray();
    expect(notes.map((n) => n.userId)).toEqual([USERS.northwind.rep]); // r8 has no user account
    expect(notes[0]!.title).toBe("Liam Carter assigned you a task");

    for (const t of tasks) {
      const [row] = await auditFor(t._id);
      expect(row).toMatchObject({ action: "task.create", tenantId: "northwind", actorUserId: USERS.northwind.manager });
      expect(JSON.stringify(row)).not.toContain("Private checklist text");
    }
  });

  it("refuses to let a manager assign outside their scope", async () => {
    signInAs(USERS.northwind.manager);
    const result = await createTask({ ...base, title: "Up the tree", dueDate: inDays(1), assigneeRepIds: ["northwind:r3"] });
    expect(result).toEqual({ ok: false, error: "You can't assign tasks to one of those people." });
  });

  it("asks a user with no rep of their own to choose an assignee", async () => {
    signInAs(USERS.northwind.super);
    expect(await createTask({ ...base, title: "Nobody", dueDate: inDays(1) })).toEqual({ ok: false, error: "Choose who this task is for." });
  });
});

describe("editing, completing and cancelling", () => {
  it("records changed fields but never description or notes text", async () => {
    signInAs(USERS.northwind.rep);
    await createTask({ ...base, title: "Editable", dueDate: inDays(4) });
    const task = (await (await collection("tasks")).findOne({ title: "Editable" }))!;

    const result = await updateTask({
      id: task._id,
      title: "Editable",
      dueDate: inDays(4),
      priority: "high",
      status: "in_progress",
      description: "Secret description",
      notes: "Secret notes",
    });
    expect(result).toEqual({ ok: true });

    const rows = await auditFor(task._id);
    const update = rows.find((r) => r.action === "task.update")!;
    expect(update.before).toEqual({ priority: "normal", status: "open" });
    expect(update.after).toEqual({ priority: "high", status: "in_progress", descriptionChanged: true, notesChanged: true });
    expect(JSON.stringify(rows)).not.toMatch(/Secret/);
  });

  it("does not let a rep reassign a task", async () => {
    signInAs(USERS.northwind.rep);
    const task = (await (await collection("tasks")).findOne({ title: "Editable" }))!;
    await updateTask({ id: task._id, title: "Editable", dueDate: inDays(4), priority: "high", status: "open", ownerRepId: "northwind:r2" });
    expect((await (await collection("tasks")).findOne({ _id: task._id }))!.ownerRepId).toBe("northwind:r1");
  });

  it("cancels with a reason and drops the task from lists", async () => {
    signInAs(USERS.northwind.rep);
    const task = (await (await collection("tasks")).findOne({ title: "Editable" }))!;
    expect(await cancelTask({ id: task._id, reason: "Duplicate" })).toEqual({ ok: true });
    expect(await (await collection("tasks")).findOne({ _id: task._id })).toMatchObject({ status: "cancelled", cancelReason: "Duplicate" });
    const page = await getTasksPage(query());
    expect(page.rows.some((r) => r.id === task._id)).toBe(false);
  });

  it("will not complete a task in another tenant", async () => {
    signInAs(USERS.harbor.super);
    await expect(completeTask("northwind:t3")).rejects.toThrow("Task not found.");
    expect((await (await collection("tasks")).findOne({ _id: "northwind:t3" }))!.status).toBe("open");
  });
});

describe("task lists", () => {
  it("splits today's work into overdue and due today", async () => {
    signInAs(USERS.northwind.rep);
    const { overdue, dueToday } = await getTodayTasks();
    expect(overdue.every((t) => t.overdue)).toBe(true);
    expect(dueToday.every((t) => !t.overdue)).toBe(true);
    expect(overdue.map((t) => t.title)).toContain("Follow up on delivery delay complaint");
  });

  it("filters overdue tasks and sorts by priority", async () => {
    signInAs(USERS.northwind.manager);
    const overdue = await getTasksPage(query({ status: "overdue" }));
    expect(overdue.rows.length).toBeGreaterThan(0);
    expect(overdue.rows.every((r) => r.overdue)).toBe(true);

    const byPriority = await getTasksPage(query({ sort: "priority" }));
    const ranks = byPriority.rows.map((r) => ["high", "normal", "low"].indexOf(r.priority));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("only shows tasks inside the user's scope and tenant", async () => {
    signInAs(USERS.harbor.rep);
    const page = await getTasksPage(query());
    expect(page.rows.every((r) => r.id.startsWith("harbor:") || r.ownerRepId.startsWith("harbor:"))).toBe(true);
    expect(page.rows.every((r) => r.ownerRepId === "harbor:r2")).toBe(true);
  });
});
