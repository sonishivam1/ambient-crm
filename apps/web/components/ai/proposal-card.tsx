"use client";

import { CalendarDays, Check, ListChecks, MessageSquareText, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { acceptWrenProposal, dismissWrenProposal, markWrenProposalSaved } from "@/app/actions/ai";
import { InteractionDialog } from "@/components/accounts/log-interaction";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { VisitDialog } from "@/components/visits/visit-dialog";
import type { ProposalView } from "@/lib/ai/proposal-view";
import { cn } from "@/lib/cn";

/**
 * A record Wren prepared. Nothing exists until the user clicks Accept (the
 * form's own code runs) or saves it through the normal form (Edit). Dismiss
 * writes nothing.
 */

export type ProposalContext = { ownRepId: string | null; timeZone: string };

const ICON = { task: ListChecks, visit: CalendarDays, note: MessageSquareText } as const;
const KIND_LABEL = { task: "Task", visit: "Visit", note: "Note" } as const;

export function ProposalCard({ proposal: initial, ctx }: { proposal: ProposalView; ctx: ProposalContext }) {
  const [p, setP] = useState(initial);
  const [error, setError] = useState<string | null>(initial.status === "pending" ? initial.lastError : null);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const Icon = ICON[p.kind];

  const act = (fn: (id: string) => Promise<{ ok: boolean; error?: string; proposal?: ProposalView }>) =>
    start(async () => {
      setError(null);
      const r = await fn(p.id);
      if (r.proposal) setP(r.proposal);
      if (!r.ok) setError(r.error ?? "Couldn't do that. Try again.");
    });

  const saved = () => act(markWrenProposalSaved);
  const account = { id: p.draft.accountId, name: p.draft.accountName, code: "" };

  return (
    <div className={cn("proposal", p.status !== "pending" && "done")}>
      <span className="ic" aria-hidden>
        <Icon size={17} />
      </span>
      <div className="proposal-b">
        <span className="proposal-kind">{p.status === "pending" ? `${KIND_LABEL[p.kind]} · ready to accept` : KIND_LABEL[p.kind]}</span>
        <b>{p.title}</b>
        <span className="proposal-m">{[p.account, ...p.lines].filter(Boolean).join(" · ")}</span>
        {error && (
          <span role="alert" className="proposal-err">
            {error}
          </span>
        )}

        {p.status === "pending" ? (
          <div className="proposal-actions">
            <button type="button" className="btn primary sm" onClick={() => act(acceptWrenProposal)} disabled={pending}>
              <Check size={14} />
              {pending ? "Working…" : "Accept"}
            </button>
            <button type="button" className="btn sm" onClick={() => setEditing(true)} disabled={pending}>
              <Pencil size={13} />
              Edit
            </button>
            <button type="button" className="btn ghost sm" onClick={() => act(dismissWrenProposal)} disabled={pending}>
              <X size={13} />
              Dismiss
            </button>
          </div>
        ) : (
          <span className={cn("proposal-state", p.status)}>
            {p.status === "accepted" ? (
              <>
                <Check size={13} aria-hidden />
                {p.resultHref ? "Created" : "Saved from the form"}
                {p.resultHref && (
                  <Link className="lnk" href={p.resultHref}>
                    Open
                  </Link>
                )}
              </>
            ) : p.status === "dismissed" ? (
              "Dismissed"
            ) : (
              "Expired. Ask Wren again for a fresh one."
            )}
          </span>
        )}
      </div>

      {editing && p.draft.kind === "task" && (
        <TaskDialog
          open
          onOpenChange={setEditing}
          lockedAccount={account}
          canAssign={false}
          assignable={[]}
          ownRepId={ctx.ownRepId}
          timeZone={ctx.timeZone}
          draft={{ title: p.draft.title, dueDate: p.draft.dueDate, priority: p.draft.priority }}
          onSaved={saved}
        />
      )}
      {editing && p.draft.kind === "visit" && (
        <VisitDialog
          open
          onOpenChange={setEditing}
          lockedAccount={account}
          assignable={[]}
          ownRepId={ctx.ownRepId}
          timeZone={ctx.timeZone}
          draft={{ date: p.draft.date, time: p.draft.time, type: p.draft.type, purpose: p.draft.purpose }}
          onSaved={saved}
        />
      )}
      {editing && p.draft.kind === "note" && (
        <InteractionDialog
          open
          onOpenChange={setEditing}
          accountId={p.draft.accountId}
          accountName={p.draft.accountName}
          draft={{ type: p.draft.type, summary: p.draft.summary }}
          onSaved={saved}
        />
      )}
    </div>
  );
}

/** A list of proposals, e.g. under a chat answer or a visit's follow-ups. */
export function ProposalCards({ proposals, ctx }: { proposals: ProposalView[]; ctx: ProposalContext }) {
  if (!proposals.length) return null;
  return (
    <div className="proposals">
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} ctx={ctx} />
      ))}
    </div>
  );
}
