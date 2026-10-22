"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState, useTransition } from "react";

import { rateWrenAnswer } from "@/app/actions/ai";
import { FEEDBACK_REASONS, type FeedbackReason, type FeedbackTarget, type FeedbackVote } from "@/lib/ai/feedback-view";
import { cn } from "@/lib/cn";

/**
 * 👍 / 👎 on one AI answer. A 👎 offers four fixed reasons; there is no comment
 * box, so no text is ever stored. A later vote replaces the earlier one.
 */
export function AnswerFeedback({ target, initial }: { target: FeedbackTarget; initial: FeedbackVote | null }) {
  const [vote, setVote] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (rating: "up" | "down", reason: FeedbackReason | null = null) =>
    start(async () => {
      setError(null);
      const r = await rateWrenAnswer({ target, rating, reason });
      if (r.ok) setVote(r.vote);
      else setError(r.error);
    });

  return (
    <div className="ai-fb">
      <div className="ai-fb-row">
        <span className="ai-fb-q">{vote ? "Thanks for the feedback" : "Was this helpful?"}</span>
        <button type="button" className={cn("ai-fb-btn", vote?.rating === "up" && "on")} aria-pressed={vote?.rating === "up"} aria-label="Helpful" title="Helpful" onClick={() => send("up")} disabled={pending}>
          <ThumbsUp size={14} />
        </button>
        <button
          type="button"
          className={cn("ai-fb-btn", vote?.rating === "down" && "on")}
          aria-pressed={vote?.rating === "down"}
          aria-label="Not helpful"
          title="Not helpful"
          onClick={() => send("down", vote?.rating === "down" ? vote.reason : null)}
          disabled={pending}
        >
          <ThumbsDown size={14} />
        </button>
      </div>
      {vote?.rating === "down" && (
        <div className="ai-fb-reasons" role="group" aria-label="What was wrong?">
          {FEEDBACK_REASONS.map(([key, label]) => (
            <button key={key} type="button" className={cn("ai-fb-reason", vote.reason === key && "on")} aria-pressed={vote.reason === key} onClick={() => send("down", key)} disabled={pending}>
              {label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <span role="alert" className="ai-fb-err">
          {error}
        </span>
      )}
    </div>
  );
}
