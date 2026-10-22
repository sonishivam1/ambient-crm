"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { AccountOption } from "@/app/actions/accounts";
import { createVisit, updateVisit } from "@/app/actions/visits";
import { AccountPicker, ChosenAccount, Field } from "@/components/forms/fields";
import { isoDay, isoTime } from "@/lib/format";
import { VISIT_TYPE_LABEL, type VisitRow } from "@/lib/visits";

export type VisitContext = {
  /** Reps a manager may plan for; empty means "only yourself". */
  assignable: { id: string; name: string; team: string }[];
  ownRepId: string | null;
  timeZone: string;
};

type Props = VisitContext & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when rescheduling or editing. */
  visit?: VisitRow;
  lockedAccount?: AccountOption;
  /** Starting values for a new visit (a Wren proposal being edited). */
  draft?: { date: string; time: string; type: VisitRow["type"]; purpose: string };
  /** Called after a successful save. */
  onSaved?: () => void;
};

/** Plan or reschedule a visit. Scope, dates and who may be booked are checked again on the server. */
export function VisitDialog({ open, onOpenChange, visit, lockedAccount, assignable, ownRepId, timeZone, draft, onSaved }: Props) {
  const editing = !!visit;
  const today = isoDay(new Date(), timeZone);
  const [account, setAccount] = useState<AccountOption | null>(
    visit ? { id: visit.accountId, name: visit.account, code: visit.accountCode } : (lockedAccount ?? null),
  );
  const [date, setDate] = useState(visit ? isoDay(visit.at, timeZone) : (draft?.date ?? ""));
  const [time, setTime] = useState(visit ? isoTime(visit.at, timeZone) : (draft?.time ?? "09:00"));
  const [type, setType] = useState<VisitRow["type"] | "">(visit?.type ?? draft?.type ?? "");
  const [purpose, setPurpose] = useState(visit?.purpose ?? draft?.purpose ?? "");
  const [repId, setRepId] = useState(visit?.repId ?? ownRepId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canChoose = assignable.length > 0;

  const submit = () =>
    startTransition(async () => {
      setError(null);
      if (!account) return setError("Choose an account.");
      const fields = { date, time, type, purpose, repId: canChoose ? repId || null : null };
      const result = editing ? await updateVisit({ id: visit.id, ...fields }) : await createVisit({ accountId: account.id, ...fields });
      if (!result.ok) return setError(result.error);
      toast(editing ? "Visit updated" : "Visit planned");
      onSaved?.();
      onOpenChange(false);
    });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ov" />
        <Dialog.Content className="modal form">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex items-start justify-between gap-3.5 px-[26px] pt-[22px] pb-1.5">
              <div>
                <Dialog.Title className="m-0 text-[20px] font-extrabold">{editing ? "Reschedule visit" : "Plan a visit"}</Dialog.Title>
                <Dialog.Description className="mt-1 text-[13.5px] text-muted">A site visit, call or meeting with a bill-to account.</Dialog.Description>
              </div>
              <Dialog.Close className="grid size-9 flex-none place-items-center rounded-full bg-surface2 text-text2" aria-label="Close">
                <X size={16} />
              </Dialog.Close>
            </div>

            <div className="m-body">
              <Field label="Bill-to account" required group>
                {account ? (
                  <ChosenAccount account={account} onChange={editing || lockedAccount ? undefined : () => setAccount(null)} />
                ) : (
                  <AccountPicker onPick={setAccount} />
                )}
              </Field>
              {canChoose && (
                <Field label="Who's going" required={!ownRepId}>
                  <select className="sel" value={repId} onChange={(e) => setRepId(e.target.value)} aria-label="Who's going">
                    {!repId && <option value="">Choose a person</option>}
                    {visit && !assignable.some((r) => r.id === visit.repId) && <option value={visit.repId}>{visit.rep}</option>}
                    {assignable.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.id === ownRepId ? " (you)" : ` · ${r.team}`}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="f2">
                <Field label="Date" required>
                  <input className="inp" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Time">
                  <input className="inp" type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} />
                </Field>
              </div>
              <Field label="Type" required>
                <select className="sel" value={type} onChange={(e) => setType(e.target.value as VisitRow["type"])} aria-label="Visit type">
                  {!type && <option value="">Choose a type</option>}
                  {(Object.keys(VISIT_TYPE_LABEL) as VisitRow["type"][]).map((t) => (
                    <option key={t} value={t}>
                      {VISIT_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Purpose">
                <textarea className="txa" style={{ minHeight: 70 }} value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={500} placeholder="What's this visit for?" />
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
              <button type="submit" className="btn primary" disabled={pending || !account || !date || !type || (canChoose && !repId)}>
                {pending ? "Saving…" : editing ? "Save changes" : "Plan visit"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
