/**
 * Feedback on AI answers, as the thumbs component sees it. Safe in client
 * components.
 */

export const FEEDBACK_REASONS = [
  ["wrong", "Wrong"],
  ["missing", "Missing something"],
  ["not_useful", "Not useful"],
  ["unclear", "Unclear"],
] as const;

export type FeedbackReason = (typeof FEEDBACK_REASONS)[number][0];
export type FeedbackVote = { rating: "up" | "down"; reason: FeedbackReason | null };

/** Which answer a vote is about: a cached feature answer (summary, brief), or one chat turn. */
export type FeedbackTarget =
  | { kind: "output"; feature: "account-summary" | "morning-brief"; subjectId: string; generatedAt: string }
  | { kind: "turn"; conversationId: string; turnId: string };

export type FeedbackResult = { ok: true; vote: FeedbackVote } | { ok: false; error: string };
