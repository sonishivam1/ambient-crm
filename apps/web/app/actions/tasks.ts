"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { collection, getClient } from "@ambient/db";

import { audit } from "@/lib/audit";
import { getScope } from "@/lib/data/scope";

const taskId = z.string().min(1).max(100);

/** Mark a visible task complete, writing the change and its audit row in one transaction. */
export async function completeTask(rawId: string) {
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
}
