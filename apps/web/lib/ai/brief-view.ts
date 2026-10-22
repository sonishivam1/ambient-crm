import type { AiCardData } from "./cards";
import type { FeedbackVote } from "./feedback-view";

/**
 * What the morning brief page receives: the verified items, the code-computed
 * headline and the cards. Pure types, safe in client components.
 */

export const BRIEF_KINDS = ["overdue_task", "visit_today", "task_due", "renewal", "alert", "quiet_account"] as const;
export const BRIEF_PRIORITIES = ["high", "normal", "low"] as const;

export type BriefItem = {
  kind: (typeof BRIEF_KINDS)[number];
  priority: (typeof BRIEF_PRIORITIES)[number];
  text: string;
  sources: string[];
};

export type BriefAnswerView = {
  /** Worked out by code from the counts when the brief was written. */
  headline: string;
  quiet: boolean;
  items: BriefItem[];
  /** The cited records as they were when the brief was written. */
  cards: AiCardData[];
  generatedAt: Date;
  /** The records have changed since the brief was written. */
  changed: boolean;
  /** The user's own 👍 / 👎 on this brief. */
  vote: FeedbackVote | null;
};

export type BriefState = { state: "unavailable"; message: string } | { state: "none" } | { state: "ready"; answer: BriefAnswerView };

export type BriefActionResult = { ok: true; answer: BriefAnswerView } | { ok: false; reason: string; message: string };
