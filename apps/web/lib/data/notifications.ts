import "server-only";

import { z } from "zod";

import { NOTIFICATION_TYPES, collection, type Notification } from "@ambient/db";
import { addDays, isoDayIn, startOfDay } from "@ambient/db/time";

import { fmtLongDay } from "@/lib/format";

import { getScope, type Scope } from "./scope";

export const NOTIFICATION_PAGE_SIZE = 50;

/** URL search params for /notifications, parsed leniently. */
export const notificationsQuerySchema = z.object({
  show: z.enum(["all", "unread"]).catch("all"),
  type: z.enum(["", ...NOTIFICATION_TYPES]).catch(""),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

export type NotificationRow = {
  id: string;
  type: Notification["type"];
  title: string;
  body: string;
  /** Only set when the account is still inside the user's scope, so links never lead to "not found". */
  account: { id: string; name: string } | null;
  read: boolean;
  createdAt: Date;
};

/** Only ever the signed-in user's own notifications, in their tenant. */
const mine = (scope: Scope) => ({ ...scope.tenant(), userId: scope.user._id });

/** "Today", "Yesterday" or "Monday 13 October", on the tenant's calendar. */
function dayLabel(d: Date, scope: Scope) {
  const day = isoDayIn(d, scope.timeZone);
  if (day === isoDayIn(scope.today, scope.timeZone)) return "Today";
  if (day === isoDayIn(addDays(scope.today, -1, scope.timeZone), scope.timeZone)) return "Yesterday";
  return fmtLongDay(d, scope.timeZone);
}

/** The user's notification history, newest first, grouped by day. */
export async function getNotifications(query: NotificationsQuery) {
  const scope = await getScope();
  const notifications = await collection("notifications");
  const filter = {
    ...mine(scope),
    ...(query.show === "unread" ? { readAt: null } : {}),
    ...(query.type ? { type: query.type } : {}),
  };
  const [rows, total, unread, byType] = await Promise.all([
    notifications
      .find(filter)
      .sort({ createdAt: -1, _id: 1 })
      .skip((query.page - 1) * NOTIFICATION_PAGE_SIZE)
      .limit(NOTIFICATION_PAGE_SIZE)
      .toArray(),
    notifications.countDocuments(filter),
    notifications.countDocuments({ ...mine(scope), readAt: null }),
    notifications.aggregate<{ _id: Notification["type"]; n: number }>([{ $match: mine(scope) }, { $group: { _id: "$type", n: { $sum: 1 } } }]).toArray(),
  ]);

  const accountIds = [...new Set(rows.flatMap((n) => (n.accountId ? [n.accountId] : [])))];
  const visible = new Map(
    (await (await collection("accounts")).find({ ...scope.filter(), _id: { $in: accountIds } }, { projection: { name: 1 } }).toArray()).map((a) => [a._id, a.name]),
  );

  const groups: { key: string; label: string; items: NotificationRow[] }[] = [];
  for (const n of rows) {
    const key = isoDayIn(startOfDay(n.createdAt, scope.timeZone), scope.timeZone);
    let group = groups.at(-1);
    if (group?.key !== key) {
      group = { key, label: dayLabel(n.createdAt, scope), items: [] };
      groups.push(group);
    }
    const name = n.accountId ? visible.get(n.accountId) : undefined;
    group.items.push({
      id: n._id,
      type: n.type,
      title: n.title,
      body: n.body,
      account: n.accountId && name ? { id: n.accountId, name } : null,
      read: !!n.readAt,
      createdAt: n.createdAt,
    });
  }

  return {
    groups,
    total,
    unread,
    pages: Math.max(1, Math.ceil(total / NOTIFICATION_PAGE_SIZE)),
    /** Types the user has any notifications of, for the filter chips. */
    types: NOTIFICATION_TYPES.filter((t) => byType.some((r) => r._id === t)),
    now: new Date(),
  };
}

export type NotificationsPage = Awaited<ReturnType<typeof getNotifications>>;
