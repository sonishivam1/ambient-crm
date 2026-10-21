"use client";

import { CalendarClock, Check, FileText, MoreHorizontal, Plus, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DropdownMenu } from "radix-ui";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import type { AccountOption } from "@/app/actions/accounts";
import { cancelVisit } from "@/app/actions/visits";
import { FollowUpsButton } from "@/components/ai/follow-ups";
import { cn } from "@/lib/cn";
import type { VisitRow } from "@/lib/visits";

import { ReportDialog } from "./report-dialog";
import { VisitDialog, type VisitContext } from "./visit-dialog";

/**
 * "Add visit". With `openFromUrl`, it is open whenever the URL carries
 * ?new=visit (the dashboard's quick add); closing drops the param.
 */
export function AddVisitButton({ lockedAccount, openFromUrl = false, small = false, ...ctx }: VisitContext & { lockedAccount?: AccountOption; openFromUrl?: boolean; small?: boolean }) {
  const [manualOpen, setManualOpen] = useState(false);
  const [session, setSession] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = openFromUrl && params.get("new") === "visit";
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
      <button className={small ? "btn sm" : "btn primary"} onClick={() => onOpenChange(true)}>
        <Plus size={small ? 14 : 16} />
        Plan visit
      </button>
      {/* A fresh dialog each time it opens, so fields start empty. */}
      <VisitDialog key={`${session}-${requested}`} open={open} onOpenChange={onOpenChange} lockedAccount={lockedAccount} {...ctx} />
    </>
  );
}

type Opened = "edit" | "report" | "cancel" | null;

/** The dialogs a visit can open, shared by the row menu and the week-grid tile. */
function VisitDialogs({ visit, ctx, opened, setOpened }: { visit: VisitRow; ctx: VisitContext; opened: Opened; setOpened: (o: Opened) => void }) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const close = (open: boolean) => !open && setOpened(null);

  const confirmCancel = () =>
    startTransition(async () => {
      const result = await cancelVisit({ id: visit.id, reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast("Visit cancelled");
      setOpened(null);
    });

  return (
    <>
      {opened === "edit" && <VisitDialog open onOpenChange={close} visit={visit} {...ctx} />}
      {opened === "report" && <ReportDialog open onOpenChange={close} visit={visit} timeZone={ctx.timeZone} />}
      <Dialog.Root open={opened === "cancel"} onOpenChange={close}>
        <Dialog.Portal>
          <Dialog.Overlay className="ov" />
          <Dialog.Content className="modal form" style={{ width: "min(440px, calc(100% - 32px))" }}>
            <div className="flex items-start justify-between gap-3.5 px-[26px] pt-[22px] pb-1.5">
              <div>
                <Dialog.Title className="m-0 text-[20px] font-extrabold">Cancel visit</Dialog.Title>
                <Dialog.Description className="mt-1 text-[13.5px] text-muted">{visit.account} drops out of the call cycle.</Dialog.Description>
              </div>
              <Dialog.Close className="grid size-9 flex-none place-items-center rounded-full bg-surface2 text-text2" aria-label="Close">
                <X size={16} />
              </Dialog.Close>
            </div>
            <div className="m-body">
              <label className="fld">
                <span className="lbl">Reason (optional)</span>
                <input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Customer rescheduled to next month" />
              </label>
            </div>
            <div className="flex justify-end gap-2.5 px-[26px] pt-4 pb-6">
              <Dialog.Close className="btn">Keep visit</Dialog.Close>
              <button className="btn primary" onClick={confirmCancel} disabled={pending}>
                {pending ? "Cancelling…" : "Cancel visit"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/** What a visit row offers: complete (once its day has come), reschedule, cancel; or its report. */
export function VisitActions({ visit, ...ctx }: VisitContext & { visit: VisitRow }) {
  const [opened, setOpened] = useState<Opened>(null);
  const planned = visit.status === "planned";

  let primary: ReactNode = null;
  if (visit.status === "completed") {
    primary = (
      <button className={cn("btn xs", !visit.report && "soft")} onClick={() => setOpened("report")}>
        <FileText size={13} />
        {visit.report ? "Report" : "Add report"}
      </button>
    );
  } else if (planned && visit.due) {
    primary = (
      <button className="btn xs soft" onClick={() => setOpened("report")}>
        <Check size={13} />
        Complete
      </button>
    );
  }

  // Follow-up tasks are for the user, so only on their own visits with a report.
  const followUps = visit.status === "completed" && visit.report && visit.repId === ctx.ownRepId;

  return (
    <div className="flex items-center justify-end gap-1.5">
      {followUps && <FollowUpsButton visitId={visit.id} accountName={visit.account} ctx={{ ownRepId: ctx.ownRepId, timeZone: ctx.timeZone }} />}
      {primary}
      {planned && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="btn icon sm ghost" aria-label={`Actions for the visit to ${visit.account}`}>
            <MoreHorizontal size={18} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="pop" align="end" sideOffset={6}>
              <DropdownMenu.Item className="mi" onSelect={() => setOpened("edit")}>
                <CalendarClock size={16} />
                Reschedule or edit
              </DropdownMenu.Item>
              <DropdownMenu.Item className="mi" style={{ color: "var(--risk)" }} onSelect={() => setOpened("cancel")}>
                <X size={16} />
                Cancel visit
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
      <VisitDialogs visit={visit} ctx={ctx} opened={opened} setOpened={setOpened} />
    </div>
  );
}

/** A visit in the week grid: planned ones open the reschedule dialog, completed ones the report. */
export function VisitTile({ visit, ...ctx }: VisitContext & { visit: VisitRow }) {
  const [opened, setOpened] = useState<Opened>(null);
  return (
    <>
      <button
        type="button"
        className={cn("vt", visit.status === "completed" && "done", visit.overdue && "od")}
        title={`${visit.account} · ${visit.status}${visit.overdue ? " · overdue" : ""}`}
        onClick={() => setOpened(visit.status === "planned" && !visit.due ? "edit" : "report")}
      >
        {visit.account}
      </button>
      <VisitDialogs visit={visit} ctx={ctx} opened={opened} setOpened={setOpened} />
    </>
  );
}
