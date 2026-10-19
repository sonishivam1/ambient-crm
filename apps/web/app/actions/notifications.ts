"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { collection } from "@ambient/db";

import { getScope } from "@/lib/data/scope";

/*
 * Read state is the user's own view of their inbox, not business data, so these
 * actions write no audit rows. Both only ever touch the signed-in user's own
 * notifications in their tenant.
 */

/** Mark one of your notifications read. Returns false when it isn't yours (or doesn't exist). */
export async function markNotificationRead(rawId: string): Promise<boolean> {
  const id = z.string().min(1).max(200).parse(rawId);
  const scope = await getScope();
  const result = await (await collection("notifications")).updateOne(
    { _id: id, ...scope.tenant(), userId: scope.user._id },
    [{ $set: { readAt: { $ifNull: ["$readAt", "$$NOW"] } } }],
  );
  if (result.matchedCount) refresh();
  return result.matchedCount === 1;
}

/** Mark all your unread notifications read; returns how many changed. */
export async function markAllNotificationsRead(): Promise<number> {
  const scope = await getScope();
  const result = await (await collection("notifications")).updateMany(
    { ...scope.tenant(), userId: scope.user._id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  if (result.modifiedCount) refresh();
  return result.modifiedCount;
}
