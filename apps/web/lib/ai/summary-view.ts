import type { AiCardData } from "./cards";
import type { FeedbackVote } from "./feedback-view";

/**
 * What the account summary card receives: the verified answer, its cards and
 * notes, nothing else (no facts, no handles' meaning). Pure types, safe in
 * client components.
 */

export type SummaryPoint = { section: "status" | "attention" | "activity"; text: string; sources: string[] };

export type SummaryAnswerView = {
  points: SummaryPoint[];
  nextStep: { text: string; sources: string[] } | null;
  cards: AiCardData[];
  /** "Not on record": worked out by code from the records. */
  notes: string[];
  generatedAt: Date;
  cached: boolean;
  /** The user's own 👍 / 👎 on this answer. */
  vote: FeedbackVote | null;
};

/** What the profile shows when it opens, before anyone presses Generate. */
export type SummaryState =
  | { state: "unavailable"; message: string }
  | { state: "none" }
  | { state: "stale" }
  | { state: "ready"; answer: SummaryAnswerView };

export type SummaryActionResult = { ok: true; answer: SummaryAnswerView } | { ok: false; reason: string; message: string };
