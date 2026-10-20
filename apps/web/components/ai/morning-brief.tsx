"use client";

import { RefreshCw, Sparkles, Sun } from "lucide-react";
import { useState, useTransition } from "react";

import { generateMorningBrief } from "@/app/actions/ai";
import { AiCards } from "@/components/ai/cards";
import { Badge, Skeleton, type Tone } from "@/components/ui/primitives";
import type { BriefAnswerView, BriefItem, BriefState } from "@/lib/ai/brief-view";
import { fmtTime } from "@/lib/format";

/**
 * The morning brief page's body. Generated on request (the 7am job comes with
 * hosting) and kept all day with the cards it was written with. The headline
 * is computed by code from the counts; the items are verified model text.
 */

const KIND_LABEL: Record<BriefItem["kind"], string> = {
  overdue_task: "Overdue task",
  visit_today: "Visit today",
  task_due: "Due today",
  renewal: "Renewal",
  alert: "Notification",
  quiet_account: "Quiet account",
};
const PRIORITY: Record<BriefItem["priority"], [string, Tone]> = { high: ["High", "risk"], normal: ["Medium", "warn"], low: ["Low", "out"] };

/** Refusals that pressing the button again won't fix. */
const FINAL = new Set(["not_configured", "ai_disabled", "feature_disabled", "role_not_allowed", "budget_exhausted"]);

export function MorningBriefPanel({ initial, timeZone }: { initial: BriefState; timeZone: string }) {
  const [state, setState] = useState<BriefState>(initial);
  const [error, setError] = useState<{ message: string; final: boolean } | null>(null);
  const [pending, start] = useTransition();

  const run = (refresh: boolean) =>
    start(async () => {
      setError(null);
      const result = await generateMorningBrief({ refresh });
      if (result.ok) setState({ state: "ready", answer: result.answer });
      else setError({ message: result.message, final: FINAL.has(result.reason) });
    });

  if (state.state === "unavailable") {
    return (
      <div className="card pad">
        <p className="mt-0 mb-3.5 text-[13.5px] text-muted">{state.message}</p>
        <button className="btn sm" disabled>
          <Sparkles size={15} />
          Generate
        </button>
      </div>
    );
  }

  if (pending) return <Loading />;

  const alert = error && (
    <p role="alert" className="mt-0 mb-3 text-[13px] font-semibold text-risk">
      {error.message}
    </p>
  );

  if (state.state === "none") {
    return (
      <div className="card pad">
        <p className="mt-0 mb-3.5 max-w-[60ch] text-[13.5px] text-muted">
          Wren reads your overdue and due tasks, today&apos;s visits, renewals, unread notifications and quiet accounts, and picks what needs
          you first. It&apos;s kept for the rest of the day.
        </p>
        {alert}
        <button className="btn primary sm" onClick={() => run(false)} disabled={error?.final}>
          <Sparkles size={15} />
          {error && !error.final ? "Try again" : "Generate today's brief"}
        </button>
      </div>
    );
  }

  return <Brief answer={state.answer} timeZone={timeZone} onRefresh={() => run(true)} alert={alert} refreshDisabled={error?.final ?? false} />;
}

function Loading() {
  return (
    <div className="card pad" aria-busy="true" aria-label="Writing your brief">
      <Skeleton className="mb-4 h-6 w-[60%]" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="mb-3 h-[64px] rounded-[14px]" />
      ))}
    </div>
  );
}

/** A written brief: the headline, when it was written, then the items with their records. */
export function Brief({
  answer,
  timeZone,
  onRefresh,
  alert,
  refreshDisabled,
}: {
  answer: BriefAnswerView;
  timeZone: string;
  onRefresh?: () => void;
  alert?: React.ReactNode;
  refreshDisabled?: boolean;
}) {
  const byHandle = new Map(answer.cards.map((c) => [c.handle, c]));
  return (
    <div className="card pad">
      <div className="brief-head">
        <span className="ic" aria-hidden>
          <Sun size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2>{answer.headline}</h2>
          <p className="brief-asof">
            As of {fmtTime(new Date(answer.generatedAt), timeZone)}
            {answer.changed && " · some items may have changed since"}
          </p>
        </div>
        {onRefresh && (
          <button className="btn ghost sm" onClick={onRefresh} disabled={refreshDisabled}>
            <RefreshCw size={14} />
            Refresh
          </button>
        )}
      </div>
      {alert}

      {answer.items.length ? (
        <ol className="brief-items">
          {answer.items.map((item, i) => {
            const [label, tone] = PRIORITY[item.priority];
            const cards = item.sources.flatMap((h) => byHandle.get(h) ?? []);
            return (
              <li key={i}>
                <div className="brief-meta">
                  <span className="brief-kind">{KIND_LABEL[item.kind]}</span>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <p>{item.text}</p>
                <AiCards cards={cards} />
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="my-2 text-[13.5px] text-muted">{answer.quiet ? "A quiet day: nothing is overdue, due or waiting on you." : "Nothing stood out today."}</p>
      )}

      <p className="ai-disclaimer mt-4">Written by Wren from your records; the headline is counted from them directly. Check the records before acting.</p>
    </div>
  );
}
