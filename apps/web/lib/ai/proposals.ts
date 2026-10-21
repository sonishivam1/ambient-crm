import "server-only";

import { randomUUID } from "node:crypto";

import { collection, type AiProposal } from "@ambient/db";

import { createVisit } from "@/app/actions/visits";
import { logInteraction } from "@/app/actions/interactions";
import type { Scope } from "@/lib/data/scope";
import { createTaskInput, createTasks } from "@/lib/writes/tasks";

import type { ProposalDraft, ProposalView } from "./proposal-view";

/**
 * Wren's proposals: records prepared for one user to accept. Nothing is
 * written until they accept, which runs the same code as the normal form, so
 * every rule applies unchanged. Each proposal works once and expires after 7
 * days. Every read and write filters on the user, so another user's proposal
 * is simply not found.
 */

export const PROPOSAL_DAYS = 7;

const mine = (scope: Scope) => ({ ...scope.tenant(), userId: scope.user._id });

type NewProposal = Pick<AiProposal, "kind" | "input" | "display" | "origin" | "sourceId">;

export async function createProposal(scope: Scope, p: NewProposal): Promise<string> {
  const now = new Date();
  const _id = randomUUID();
  await (await collection("aiProposals")).insertOne({
    _id,
    ...mine(scope),
    ...p,
    status: "pending",
    resultId: null,
    resultHref: null,
    lastError: null,
    createdAt: now,
    decidedAt: null,
    expiresAt: new Date(now.getTime() + PROPOSAL_DAYS * 86_400_000),
  });
  return _id;
}

function draftOf(p: AiProposal): ProposalDraft {
  const i = p.input as Record<string, string>;
  const base = { accountId: i.accountId!, accountName: p.display.account };
  if (p.kind === "task") return { kind: "task", ...base, title: i.title!, dueDate: i.dueDate!, priority: i.priority as "high" | "normal" | "low" };
  if (p.kind === "visit") return { kind: "visit", ...base, date: i.date!, time: i.time!, type: i.type as "site" | "call" | "meeting", purpose: i.purpose ?? "" };
  return { kind: "note", ...base, type: i.type as "note" | "call" | "meeting", summary: i.summary! };
}

export function toProposalView(p: AiProposal, now = new Date()): ProposalView {
  const expired = p.status === "pending" && p.expiresAt <= now;
  return {
    id: p._id,
    kind: p.kind,
    title: p.display.title,
    account: p.display.account,
    lines: p.display.lines,
    // "accepting" only lasts while an Accept is running; show it as pending.
    status: expired ? "expired" : p.status === "accepting" ? "pending" : p.status,
    resultHref: p.resultHref,
    lastError: p.lastError,
    draft: draftOf(p),
  };
}

/** The user's own proposals by id, in the order asked for; missing or expired-and-deleted ones are left out. */
export async function proposalViews(scope: Scope, ids: string[]): Promise<ProposalView[]> {
  if (!ids.length) return [];
  const rows = await (await collection("aiProposals")).find({ _id: { $in: ids }, ...mine(scope) }).toArray();
  const byId = new Map(rows.map((r) => [r._id, r]));
  return ids.flatMap((id) => (byId.has(id) ? [toProposalView(byId.get(id)!)] : []));
}

/** The user's live proposals from one source (a visit's follow-ups), oldest first. */
export async function proposalsFrom(scope: Scope, origin: AiProposal["origin"], sourceId: string): Promise<ProposalView[]> {
  const rows = await (await collection("aiProposals"))
    .find({ ...mine(scope), origin, sourceId, status: { $in: ["pending", "accepting", "accepted"] }, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  return rows.map((r) => toProposalView(r));
}

export type AcceptResult = { ok: true; proposal: ProposalView } | { ok: false; error: string; proposal?: ProposalView };

const UNAVAILABLE = "This proposal isn't available any more.";

/** Run the form's own code for a proposal. */
async function runAction(scope: Scope, p: AiProposal): Promise<{ ok: true; id: string | null; href: string } | { ok: false; error: string }> {
  const accountHref = `/accounts/${encodeURIComponent(String(p.input.accountId))}`;
  if (p.kind === "task") {
    const parsed = createTaskInput.safeParse(p.input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const r = await createTasks(scope, { ...parsed.data, assigneeRepIds: [] }, { fromWren: true });
    return r.ok ? { ok: true, id: r.ids[0] ?? null, href: `/tasks?view=all&account=${encodeURIComponent(parsed.data.accountId)}` } : r;
  }
  if (p.kind === "visit") {
    const r = await createVisit({ ...p.input, repId: null });
    return r.ok ? { ok: true, id: r.id, href: "/call-cycle" } : r;
  }
  const r = await logInteraction(p.input);
  return r.ok ? { ok: true, id: null, href: accountHref } : r;
}

/**
 * Accept: claim the proposal (pending → accepting, atomically, so a second
 * click can't run it twice), run the form's code, then record the result. If
 * the action refuses, the proposal goes back to pending with the reason.
 */
export async function acceptProposal(scope: Scope, id: string): Promise<AcceptResult> {
  const proposals = await collection("aiProposals");
  const claimed = await proposals.findOneAndUpdate(
    { _id: id, ...mine(scope), status: "pending", expiresAt: { $gt: new Date() } },
    { $set: { status: "accepting" } },
    { returnDocument: "after" },
  );
  if (!claimed) {
    const row = await proposals.findOne({ _id: id, ...mine(scope) });
    // Already accepted (a double click, or another tab): the same result again.
    if (row?.status === "accepted") return { ok: true, proposal: toProposalView(row) };
    if (row?.status === "accepting") return { ok: false, error: "Already being created. One moment.", proposal: toProposalView(row) };
    return { ok: false, error: UNAVAILABLE, ...(row ? { proposal: toProposalView(row) } : {}) };
  }

  let outcome: Awaited<ReturnType<typeof runAction>>;
  try {
    outcome = await runAction(scope, claimed);
  } catch (err) {
    await proposals.updateOne({ _id: id, ...mine(scope) }, { $set: { status: "pending" } });
    throw err;
  }
  const update = outcome.ok
    ? { status: "accepted" as const, resultId: outcome.id, resultHref: outcome.href, lastError: null, decidedAt: new Date() }
    : { status: "pending" as const, lastError: outcome.error };
  const after = await proposals.findOneAndUpdate({ _id: id, ...mine(scope) }, { $set: update }, { returnDocument: "after" });
  const view = toProposalView(after ?? { ...claimed, ...update });
  return outcome.ok ? { ok: true, proposal: view } : { ok: false, error: outcome.error, proposal: view };
}

/** Dismiss a pending proposal: nothing is written. */
export async function dismissProposal(scope: Scope, id: string): Promise<AcceptResult> {
  const row = await (await collection("aiProposals")).findOneAndUpdate(
    { _id: id, ...mine(scope), status: "pending" },
    { $set: { status: "dismissed", decidedAt: new Date() } },
    { returnDocument: "after" },
  );
  return row ? { ok: true, proposal: toProposalView(row) } : { ok: false, error: UNAVAILABLE };
}

/** The user saved the proposal through the normal form (Edit): mark it done. */
export async function markProposalSaved(scope: Scope, id: string): Promise<AcceptResult> {
  const row = await (await collection("aiProposals")).findOneAndUpdate(
    { _id: id, ...mine(scope), status: "pending" },
    { $set: { status: "accepted", resultHref: null, lastError: null, decidedAt: new Date() } },
    { returnDocument: "after" },
  );
  return row ? { ok: true, proposal: toProposalView(row) } : { ok: false, error: UNAVAILABLE };
}
