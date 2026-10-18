import "server-only";

import { OPEN_TASK_STATUSES, collection } from "@ambient/db";

import { ROLES } from "@/lib/auth/roles";
import { devAuthEnabled } from "@/lib/auth/session";
import { getScope } from "@/lib/data/scope";
import { Skeleton } from "@/components/ui/primitives";

import { Sidebar } from "./sidebar";
import { Topbar, type DevUser } from "./topbar";

async function unreadCount(userId: string) {
  return (await collection("notifications")).countDocuments({ userId, readAt: null });
}

export async function SidebarSlot() {
  const scope = await getScope();
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
  const [overdueTasks, unreadNotifications] = await Promise.all([
    (await collection("tasks")).countDocuments({
      ...scope.filter(),
      deletedAt: null,
      status: { $in: OPEN_TASK_STATUSES },
      dueAt: { $lt: startOfToday },
    }),
    unreadCount(scope.user._id),
  ]);
  return <Sidebar capabilities={scope.user.capabilities} counts={{ overdueTasks, unreadNotifications }} />;
}

export async function TopbarSlot() {
  const { user, lens } = await getScope();
  const [unread, devUsers] = await Promise.all([
    unreadCount(user._id),
    devAuthEnabled()
      ? (await collection("users"))
          .find({ deletedAt: null }, { projection: { name: 1, role: 1 } })
          .toArray()
          .then((rows): DevUser[] => rows.map((u) => ({ id: u._id, name: u.name, roleLabel: ROLES[u.role].label })))
      : Promise.resolve(null),
  ]);
  return (
    <Topbar
      me={{ name: user.name, email: user.email, roleLabel: user.capabilities.label }}
      capabilities={user.capabilities}
      lens={lens}
      unread={unread}
      devUsers={devUsers}
      currentUserId={user._id}
    />
  );
}

export function SidebarFallback() {
  return (
    <aside className="sidebar">
      <div className="side-body" />
      <svg className="side-wave" viewBox="0 0 100 1000" preserveAspectRatio="none" aria-hidden>
        <path d="M0,0 L34,0 C88,120 92,240 50,380 C8,520 6,640 46,760 C74,850 78,930 40,1000 L0,1000 Z" />
      </svg>
    </aside>
  );
}

export function TopbarFallback() {
  return (
    <header className="topbar">
      <Skeleton className="h-11 max-w-[460px] flex-1 rounded-full" />
      <div className="flex-1" />
      <Skeleton className="h-11 w-44 rounded-full" />
    </header>
  );
}
