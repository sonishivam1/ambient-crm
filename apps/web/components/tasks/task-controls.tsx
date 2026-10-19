"use client";

import { Check, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DropdownMenu } from "radix-ui";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { cancelTask, completeTask, type AccountOption } from "@/app/actions/tasks";

import { TaskDialog, type DialogRep, type EditableTask } from "./task-dialog";

type AssignProps = { canAssign: boolean; assignable: DialogRep[]; ownRepId: string | null; timeZone: string };

/**
 * "Add task". With `openFromUrl`, it is open whenever the URL carries
 * ?new=task (the dashboard's quick add); closing drops the param, so a refresh
 * doesn't reopen it. Open state is derived from the URL rather than copied
 * into state once, because Next keeps this component alive across navigations.
 */
export function AddTaskButton({ lockedAccount, openFromUrl = false, ...assign }: AssignProps & { lockedAccount?: AccountOption; openFromUrl?: boolean }) {
  const [manualOpen, setManualOpen] = useState(false);
  const [session, setSession] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = openFromUrl && params.get("new") === "task";
  const open = manualOpen || requested;

  const onOpenChange = (next: boolean) => {
    setManualOpen(next);
    if (next) setSession((s) => s + 1);
    if (!next && requested) {
      const rest = new URLSearchParams(params);
      rest.delete("new");
      const qs = rest.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  };

  return (
    <>
      <button className="btn primary" onClick={() => onOpenChange(true)}>
        <Plus size={16} />
        Add task
      </button>
      {/* A fresh dialog each time it opens, so fields start empty. */}
      <TaskDialog key={`${session}-${requested}`} open={open} onOpenChange={onOpenChange} lockedAccount={lockedAccount} {...assign} />
    </>
  );
}

/** The ⋯ menu on a task row: edit, complete, cancel. */
export function TaskRowMenu({ task, ...assign }: AssignProps & { task: EditableTask }) {
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const done = task.status === "completed";

  const complete = () =>
    startTransition(async () => {
      try {
        await completeTask(task.id);
        toast("Task completed");
      } catch {
        toast.error("Could not complete the task.");
      }
    });

  const confirmCancel = () =>
    startTransition(async () => {
      const result = await cancelTask({ id: task.id, reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast("Task cancelled");
      setCancelling(false);
    });

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="btn icon sm ghost" aria-label={`Actions for ${task.title}`} disabled={pending}>
          <MoreHorizontal size={18} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="pop" align="end" sideOffset={6}>
            <DropdownMenu.Item className="mi" onSelect={() => setEditing(true)}>
              <Pencil size={16} />
              Edit
            </DropdownMenu.Item>
            {!done && (
              <DropdownMenu.Item className="mi" onSelect={complete}>
                <Check size={16} />
                Mark complete
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item className="mi" style={{ color: "var(--risk)" }} onSelect={() => setCancelling(true)}>
              <Trash2 size={16} />
              Cancel task
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {editing && <TaskDialog open={editing} onOpenChange={setEditing} task={task} {...assign} />}

      <Dialog.Root open={cancelling} onOpenChange={setCancelling}>
        <Dialog.Portal>
          <Dialog.Overlay className="ov" />
          <Dialog.Content className="modal form" style={{ width: "min(440px, calc(100% - 32px))" }}>
            <div className="flex items-start justify-between gap-3.5 px-[26px] pt-[22px] pb-1.5">
              <div>
                <Dialog.Title className="m-0 text-[20px] font-extrabold">Cancel task</Dialog.Title>
                <Dialog.Description className="mt-1 text-[13.5px] text-muted">“{task.title}” will be removed from every list.</Dialog.Description>
              </div>
              <Dialog.Close className="grid size-9 flex-none place-items-center rounded-full bg-surface2 text-text2" aria-label="Close">
                <X size={16} />
              </Dialog.Close>
            </div>
            <div className="px-[26px] pt-3.5 pb-2">
              <label className="fld">
                <span className="lbl">Reason (optional)</span>
                <input
                  className="inp"
                  value={reason}
                  maxLength={300}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Duplicate, customer cancelled…"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2.5 px-[26px] pt-4 pb-6">
              <Dialog.Close className="btn">Back</Dialog.Close>
              <button className="btn danger" onClick={confirmCancel} disabled={pending}>
                {pending ? "Cancelling…" : "Confirm cancel"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
