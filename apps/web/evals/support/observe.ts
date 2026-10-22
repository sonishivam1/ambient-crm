import type { ChatResult } from "@/lib/ai/chat";
import type { AiResult } from "@/lib/ai/engine";
import type { FollowUpsResult } from "@/lib/ai/features/followup-suggestions";

import { emptyObservation, textOf, type Observation } from "./harness";

/** A one-shot feature (summary, brief): its verified output's text, cards and notes. */
export function fromFeature<O>(r: AiResult<O>): Observation {
  if (!r.ok) return emptyObservation(r.reason);
  return { ok: true, reason: null, text: [textOf(r.output), ...r.notes].join("\n"), cards: r.cards, proposals: [], progress: [], notes: r.notes };
}

/** A chat answer, with the tools it used (from the progress lines) and the proposals it prepared. */
export function fromChat(r: ChatResult, progress: string[]): Observation {
  if (!r.ok) return { ...emptyObservation(r.reason), progress };
  const a = r.answer;
  return {
    ok: true,
    reason: null,
    text: [a.text, ...a.bullets, a.followUpQuestion ?? ""].join("\n"),
    cards: a.cards,
    proposals: a.proposals.map((p) => ({ kind: p.kind, title: p.title })),
    progress,
    notes: [],
  };
}

export function fromFollowUps(r: FollowUpsResult): Observation {
  if (!r.ok) return emptyObservation(r.reason);
  return { ok: true, reason: null, text: r.proposals.map((p) => `${p.title}\n${p.lines.join("\n")}`).join("\n"), cards: [], proposals: r.proposals.map((p) => ({ kind: p.kind, title: p.title })), progress: [], notes: [] };
}
