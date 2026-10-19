"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { AccountOption } from "@/app/actions/accounts";
import { createTask, updateTask } from "@/app/actions/tasks";
import { AccountPicker, ChosenAccount, Field } from "@/components/forms/fields";
import { isoDay } from "@/lib/format";

export type DialogRep = { id: string; name: string; team: string };

export type EditableTask = {
  id: string;
  accountId: string;
  account: string;
  title: string;
  description: string;
  notes: string;
  ownerRepId: string;
  dueAt: Date;
  priority: "high" | "normal" | "low";
  status: "open" | "in_progress" | "completed" | "cancelled";
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  task?: EditableTask;
  /** Fixes the account (opened from a customer profile). */
  lockedAccount?: AccountOption;
  canAssign: boolean;
  assignable: DialogRep[];
  ownRepId: string | null;
  /** The tenant's zone: due dates are calendar days there. */
  timeZone: string;
};

/** Create or edit a task. All rules (scope, past due dates, who can be assigned) are enforced again on the server. */
export function TaskDialog({ open, onOpenChange, task, lockedAccount, canAssign, assignable, ownRepId, timeZone }: Props) {
  const editing = !!task;
  const today = isoDay(new Date(), timeZone);
  const [account, setAccount] = useState<AccountOption | null>(
    task ? { id: task.accountId, name: task.account, code: "" } : (lockedAccount ?? null),
  );
  const [title, setTitle] = useState(task?.title ?? "");
  const [dueDate, setDueDate] = useState(task ? isoDay(task.dueAt, timeZone) : "");
  const [priority, setPriority] = useState<EditableTask["priority"]>(task?.priority ?? "normal");
  const [description, setDescription] = useState(task?.description ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [status, setStatus] = useState<"open" | "in_progress" | "completed">(
    task && task.status !== "cancelled" ? task.status : "open",
  );
  const [ownerRepId, setOwnerRepId] = useState(task?.ownerRepId ?? "");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mustChooseAssignee = !editing && !ownRepId;

  const submit = () =>
    startTransition(async () => {
      setError(null);
      if (!account) return setError("Choose an account.");
      const result = editing
        ? await updateTask({ id: task.id, title, dueDate, priority, description, notes, status, ownerRepId: canAssign ? ownerRepId : undefined })
        : await createTask({ accountId: account.id, title, dueDate, priority, description, notes, assigneeRepIds: canAssign ? assignees : [] });
      if (!result.ok) return setError(result.error);
      toast(editing ? "Task updated" : result.created && result.created > 1 ? `${result.created} tasks created` : "Task created");
      onOpenChange(false);
    });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ov" />
        <Dialog.Content className="modal form wide">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex items-start justify-between gap-3.5 px-[26px] pt-[22px] pb-1.5">
              <div>
                <Dialog.Title className="m-0 text-[20px] font-extrabold">{editing ? "Edit task" : "New task"}</Dialog.Title>
                <Dialog.Description className="mt-1 text-[13.5px] text-muted">
                  {editing ? "Change details, status or who it's for." : "Tasks belong to a bill-to account."}
                </Dialog.Description>
              </div>
              <Dialog.Close className="grid size-9 flex-none place-items-center rounded-full bg-surface2 text-text2" aria-label="Close">
                <X size={16} />
              </Dialog.Close>
            </div>

            <div className="m-body">
              <Field label="Bill-to account" required>
                {account ? (
                  <ChosenAccount account={account} onChange={!editing && !lockedAccount ? () => setAccount(null) : undefined} />
                ) : (
                  <AccountPicker onPick={setAccount} />
                )}
              </Field>

              {!editing && canAssign && assignable.length > 0 && (
                <Field label={mustChooseAssignee ? "Assign to" : "Assign to (optional, defaults to you)"} required={mustChooseAssignee}>
                  <div className="max-h-[150px] overflow-y-auto rounded-[14px] border border-line p-1.5">
                    {assignable.map((r) => (
                      <label key={r.id} className="check-row">
                        <input
                          type="checkbox"
                          checked={assignees.includes(r.id)}
                          onChange={(e) => setAssignees((a) => (e.target.checked ? [...a, r.id] : a.filter((x) => x !== r.id)))}
                        />
                        <span>
                          {r.name}
                          <span className="text-muted"> · {r.team}</span>
                          {r.id === ownRepId && <span className="text-muted"> (you)</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                  {assignees.length > 1 && <span className="text-[12px] text-muted">Creates one task for each person.</span>}
                </Field>
              )}

              {editing && (
                <div className="f2">
                  <Field label="Status">
                    <select className="sel" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </Field>
                  {canAssign && (
                    <Field label="Assigned to">
                      <select className="sel" value={ownerRepId} onChange={(e) => setOwnerRepId(e.target.value)}>
                        {!assignable.some((r) => r.id === ownerRepId) && <option value={ownerRepId}>Current owner</option>}
                        {assignable.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
              )}

              <Field label="Title" required>
                <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="What needs to be done?" />
              </Field>

              <div className="f2">
                <Field label="Due date" required>
                  <input className="inp" type="date" value={dueDate} min={editing ? undefined : today} onChange={(e) => setDueDate(e.target.value)} />
                </Field>
                <Field label="Priority">
                  <select className="sel" value={priority} onChange={(e) => setPriority(e.target.value as EditableTask["priority"])}>
                    <option value="low">Low</option>
                    <option value="normal">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  className="txa"
                  style={{ minHeight: 70 }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  placeholder="Context or customer requirements…"
                />
              </Field>
              <Field label="Notes">
                <textarea
                  className="txa"
                  style={{ minHeight: 80 }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={4000}
                  placeholder="Execution notes, checklist, or internal instructions…"
                />
              </Field>

              {error && (
                <p className="m-0 text-[13px] font-semibold text-risk" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2.5 px-[26px] pt-4 pb-6">
              <Dialog.Close type="button" className="btn">
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                className="btn primary"
                disabled={pending || !account || !title.trim() || !dueDate || (mustChooseAssignee && !assignees.length)}
              >
                {pending ? "Saving…" : editing ? "Save changes" : "Create task"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
