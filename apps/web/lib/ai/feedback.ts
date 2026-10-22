import "server-only";

import { collection } from "@ambient/db";

import type { Scope } from "@/lib/data/scope";

import { latestOutput } from "./cache";
import { getConversation } from "./conversations";
import type { FeedbackResult, FeedbackTarget, FeedbackVote } from "./feedback-view";

/**
 * Users' ratings of AI answers: 👍 or 👎 with an optional fixed reason. One
 * row per user per answer; a later vote replaces it. Metadata only: the row
 * says which answer and what produced it (prompt, policy, model), never its
 * text. A vote is taken only for the user's own answer, and only while it is
 * still the one shown.
 */

const CHANGED = "This answer has changed since. Rate the new one.";
const GONE = "This answer isn't available any more.";

/** The answer's key within its feature: the subject and the moment it was generated, or the chat turn. */
const answerKey = (t: FeedbackTarget) => (t.kind === "output" ? `${t.subjectId}@${new Date(t.generatedAt).getTime()}` : t.turnId);
const featureOf = (t: FeedbackTarget) => (t.kind === "output" ? t.feature : "wren-chat");
const idFor = (scope: Scope, feature: string, key: string) => `${scope.tenantId}:${scope.user._id}:${feature}:${key}`;

/** What produced the answer, or why it can't be rated. */
async function producedBy(scope: Scope, t: FeedbackTarget): Promise<{ promptVersion: number; policyVersion: number; model: string } | { error: string }> {
  if (t.kind === "output") {
    const row = await latestOutput(scope, t.feature, t.subjectId);
    if (!row) return { error: GONE };
    if (row.createdAt.getTime() !== new Date(t.generatedAt).getTime()) return { error: CHANGED };
    return { promptVersion: row.promptVersion, policyVersion: row.policyVersion, model: row.model };
  }
  const conversation = await getConversation(scope, t.conversationId);
  const turn = conversation?.turns.find((x) => x._id === t.turnId && x.role === "assistant");
  if (!turn) return { error: GONE };
  return { promptVersion: turn.promptVersion ?? 0, policyVersion: turn.policyVersion ?? 0, model: turn.model ?? "unknown" };
}

export async function rateAnswer(scope: Scope, target: FeedbackTarget, vote: FeedbackVote): Promise<FeedbackResult> {
  const made = await producedBy(scope, target);
  if ("error" in made) return { ok: false, error: made.error };
  const feature = featureOf(target);
  const key = answerKey(target);
  // A reason only explains a 👎.
  const reason = vote.rating === "down" ? vote.reason : null;
  const now = new Date();
  await (await collection("aiFeedback")).updateOne(
    { _id: idFor(scope, feature, key) },
    {
      $set: { tenantId: scope.tenantId, userId: scope.user._id, feature, answerKey: key, rating: vote.rating, reason, ...made, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return { ok: true, vote: { rating: vote.rating, reason } };
}

/** The user's own votes on these answers, by target position. */
export async function votesFor(scope: Scope, targets: FeedbackTarget[]): Promise<(FeedbackVote | null)[]> {
  if (!targets.length) return [];
  const ids = targets.map((t) => idFor(scope, featureOf(t), answerKey(t)));
  const rows = await (await collection("aiFeedback")).find({ _id: { $in: ids }, ...scope.tenant(), userId: scope.user._id }).toArray();
  const byId = new Map(rows.map((r) => [r._id, { rating: r.rating, reason: r.reason }]));
  return ids.map((id) => byId.get(id) ?? null);
}

export async function voteFor(scope: Scope, target: FeedbackTarget): Promise<FeedbackVote | null> {
  return (await votesFor(scope, [target]))[0] ?? null;
}
