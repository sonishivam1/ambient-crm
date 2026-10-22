"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { generateAccountSummary } from "@/app/actions/ai";
import { AiCards } from "@/components/ai/cards";
import { AnswerFeedback } from "@/components/ai/feedback";
import { Skeleton } from "@/components/ui/primitives";
import type { SummaryAnswerView, SummaryPoint, SummaryState } from "@/lib/ai/summary-view";
import { timeAgo } from "@/lib/format";

/**
 * The Wren summary card on a customer profile. Generated only on request; a
 * cached answer for unchanged records shows straight away. Everything shown
 * was verified by the engine, and the figures are on the cards.
 */

const SECTIONS: [SummaryPoint["section"], string][] = [
  ["status", "Status"],
  ["attention", "Needs attention"],
  ["activity", "Recent activity"],
];

const ago = (at: Date) => {
  const t = timeAgo(new Date(at));
  return t === "just now" ? t : `${t} ago`;
};

/** Refusals that pressing the button again won't fix. */
const FINAL = new Set(["not_configured", "ai_disabled", "feature_disabled", "role_not_allowed", "not_found", "budget_exhausted"]);

export function AccountSummaryPanel({ accountId, initial }: { accountId: string; initial: SummaryState }) {
  const [state, setState] = useState<SummaryState>(initial);
  const [error, setError] = useState<{ message: string; final: boolean } | null>(null);
  const [pending, start] = useTransition();

  const run = (refresh: boolean) =>
    start(async () => {
      setError(null);
      const result = await generateAccountSummary({ accountId, refresh });
      if (result.ok) setState({ state: "ready", answer: result.answer });
      else setError({ message: result.message, final: FINAL.has(result.reason) });
    });

  if (state.state === "unavailable") {
    return (
      <>
        <p className="mt-0 mb-3.5 text-[13.5px] text-muted">{state.message}</p>
        <button className="btn sm" disabled>
          <Sparkles size={15} />
          Generate
        </button>
      </>
    );
  }

  if (pending) return <Loading />;

  const stopped = error?.final ?? false;
  return (
    <>
      {state.state === "ready" ? (
        <Answer answer={state.answer} />
      ) : (
        <p className="mt-0 mb-3.5 text-[13.5px] text-muted">
          {state.state === "stale"
            ? "This account has changed since the last summary. Generate a fresh one."
            : "A short read on this account from its tasks, visits, notes and contracts, with the records it used."}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-0 mb-3 text-[13px] font-semibold text-risk">
          {error.message}
        </p>
      )}

      {state.state === "ready" ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <span suppressHydrationWarning>Generated {ago(state.answer.generatedAt)}</span>
          <span aria-hidden>·</span>
          <button className="btn ghost xs" onClick={() => run(true)} disabled={stopped}>
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      ) : null}
      {state.state === "ready" && (
        <AnswerFeedback
          key={String(state.answer.generatedAt)}
          target={{ kind: "output", feature: "account-summary", subjectId: accountId, generatedAt: new Date(state.answer.generatedAt).toISOString() }}
          initial={state.answer.vote}
        />
      )}
      {state.state !== "ready" && (
        <button className="btn sm" onClick={() => run(false)} disabled={stopped}>
          <Sparkles size={15} />
          {error && !stopped ? "Try again" : "Generate"}
        </button>
      )}
    </>
  );
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Generating the summary">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-1.5 h-3.5 w-full" />
      <Skeleton className="mb-1.5 h-3.5 w-[85%]" />
      <Skeleton className="mb-4 h-3.5 w-[70%]" />
      <Skeleton className="h-14 rounded-[14px]" />
    </div>
  );
}

/** A verified summary: points by section, the next step, what's not on record, and the records used. */
export function Answer({ answer }: { answer: SummaryAnswerView }) {
  return (
    <div className="ai-summary">
      {SECTIONS.map(([key, label]) => {
        const points = answer.points.filter((p) => p.section === key);
        if (!points.length) return null;
        return (
          <section key={key}>
            <h4>{label}</h4>
            <ul>
              {points.map((p, i) => (
                <li key={i}>{p.text}</li>
              ))}
            </ul>
          </section>
        );
      })}

      {answer.nextStep && (
        <div className="ai-next">
          <b>Next step</b>
          <p>{answer.nextStep.text}</p>
        </div>
      )}

      {answer.notes.length > 0 && (
        <section>
          <h4>Not on record</h4>
          <ul className="ai-gaps">
            {answer.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      {answer.cards.length > 0 && (
        <section>
          <h4>Records used</h4>
          <AiCards cards={answer.cards} className="one-col" />
        </section>
      )}

      <p className="ai-disclaimer">Written by Wren from the records above. Check the records before acting.</p>
    </div>
  );
}
