"use client";

import { Check } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { completeTask } from "@/app/actions/tasks";
import { cn } from "@/lib/cn";

export function TaskCheck({ id, done, title }: { id: string; done: boolean; title: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className={cn("check", (done || pending) && "on")}
      aria-label={`Mark "${title}" complete`}
      disabled={done || pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await completeTask(id);
            toast("Task completed");
          } catch {
            toast.error("Could not complete the task.");
          }
        })
      }
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}
