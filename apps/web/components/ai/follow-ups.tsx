"use client";

import { Sparkles, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState, useTransition } from "react";

import { suggestVisitFollowUps } from "@/app/actions/ai";
import { ProposalCards, type ProposalContext } from "@/components/ai/proposal-card";
import { Skeleton } from "@/components/ui/primitives";
import type { ProposalView } from "@/lib/ai/proposal-view";

/**
 * "Suggest follow-ups" on one of the user's own visit reports. Wren reads the
 * report and the account's open tasks and offers up to three tasks, each a
 * proposal to accept, edit or dismiss. Asking again shows the same ones.
 */
export function FollowUpsButton({ visitId, accountName, ctx }: { visitId: string; accountName: string; ctx: ProposalContext }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ proposals: ProposalView[] } | { error: string } | null>(null);
  const [pending, start] = useTransition();

  const load = () =>
    start(async () => {
      const r = await suggestVisitFollowUps(visitId);
      setState(r.ok ? { proposals: r.proposals } : { error: r.message });
    });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <Dialog.Trigger className="btn xs soft" title="Suggest follow-up tasks from this report">
        <Sparkles size={13} />
        Follow-ups
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ov" />
        <Dialog.Content className="modal form">
          <div className="flex items-start justify-between gap-3.5 px-[26px] pt-[22px] pb-1.5">
            <div>
              <Dialog.Title className="m-0 text-[20px] font-extrabold">Suggested follow-ups</Dialog.Title>
              <Dialog.Description className="mt-1 text-[13.5px] text-muted">
                {accountName} · from this visit&apos;s report. Nothing is created until you accept.
              </Dialog.Description>
            </div>
            <Dialog.Close className="grid size-9 flex-none place-items-center rounded-full bg-surface2 text-text2" aria-label="Close">
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="px-[26px] pt-3 pb-6">
            {pending || !state ? (
              <div aria-busy="true" aria-label="Reading the report">
                <Skeleton className="mb-2.5 h-[74px] rounded-[14px]" />
                <Skeleton className="h-[74px] rounded-[14px]" />
              </div>
            ) : "error" in state ? (
              <p role="alert" className="m-0 text-[13.5px] font-semibold text-risk">
                {state.error}
              </p>
            ) : state.proposals.length ? (
              <ProposalCards proposals={state.proposals} ctx={ctx} />
            ) : (
              <p className="m-0 text-[13.5px] text-muted">No follow-ups found: the report has no clear commitments that aren&apos;t already a task.</p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
