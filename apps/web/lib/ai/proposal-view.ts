/**
 * What a proposal card receives. Safe in client components.
 */

export type ProposalKind = "task" | "visit" | "note";
export type ProposalStatus = "pending" | "accepted" | "dismissed" | "expired";

/** The proposal's values, to open the normal form filled in (Edit). */
export type ProposalDraft =
  | { kind: "task"; accountId: string; accountName: string; title: string; dueDate: string; priority: "high" | "normal" | "low" }
  | { kind: "visit"; accountId: string; accountName: string; date: string; time: string; type: "site" | "call" | "meeting"; purpose: string }
  | { kind: "note"; accountId: string; accountName: string; type: "note" | "call" | "meeting"; summary: string };

export type ProposalView = {
  id: string;
  kind: ProposalKind;
  title: string;
  account: string;
  lines: string[];
  status: ProposalStatus;
  /** Where the created record lives, once accepted (null when saved from the form). */
  resultHref: string | null;
  /** Why the last Accept was refused, if it was. */
  lastError: string | null;
  draft: ProposalDraft;
};

export type ProposalActionResult = { ok: true; proposal: ProposalView } | { ok: false; error: string; proposal?: ProposalView };
