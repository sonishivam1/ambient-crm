"use client";

import { Check, CheckCheck } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";

export function MarkReadButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn xs"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (!(await markNotificationRead(id))) toast.error("That notification is no longer available.");
        })
      }
    >
      <Check size={13} />
      {pending ? "Marking…" : "Mark read"}
    </button>
  );
}

export function MarkAllReadButton({ unread }: { unread: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="btn"
      disabled={pending || unread === 0}
      onClick={() =>
        startTransition(async () => {
          const n = await markAllNotificationsRead();
          toast(n ? `Marked ${n} ${n === 1 ? "notification" : "notifications"} read` : "You're all caught up");
        })
      }
    >
      <CheckCheck size={16} />
      Mark all read
    </button>
  );
}
