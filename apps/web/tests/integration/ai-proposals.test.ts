import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { collection } from "@ambient/db";
import { addDays, isoDayIn } from "@ambient/db/time";

import { acceptWrenProposal, dismissWrenProposal, markWrenProposalSaved, suggestVisitFollowUps } from "@/app/actions/ai";
import { runChatTurn } from "@/lib/ai/chat";
import { getConversation, turnViews } from "@/lib/ai/conversations";
import { factsBuilder } from "@/lib/ai/facts";
import { createProposal } from "@/lib/ai/proposals";
import type { ToolContext, ToolResult } from "@/lib/ai/tools/define";
import { proposeNote, proposeTask, proposeVisit } from "@/lib/ai/tools/propose";
import { getScope } from "@/lib/data/scope";

import { standIn } from "../support/ai-stand-in";
import { USERS, signInAs } from "../support/session";

vi.mock("@/lib/ai/client", async () => {
  const { standIn } = await import("../support/ai-stand-in");
  return { modelFor: () => ({ model: standIn.model, modelId: "stand-in-model" }) };
});

const ACME = "northwind:CO-ACME-BT1";
const HARROW_VISIT = "northwind:v18"; // Priya's completed site visit with a report, 9 days ago

async function ctxFor(user: string): Promise<ToolContext> {
  signInAs(user);
  const scope = await getScope();
  return { scope, f: factsBuilder(), team: false, proposals: [] };
}
const day = async (offset: number) => {
  const scope = await getScope();
  return isoDayIn(addDays(scope.today, offset, scope.timeZone), scope.timeZone);
};
const ok = (r: ToolResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}: ${r.ask}`);
  return r as Extract<ToolResult, { ok: true }> & { proposalId: string };
};
const count = async (name: "tasks" | "visits" | "interactions") => (await collection(name)).countDocuments({ tenantId: "northwind" });

beforeAll(() => {
  process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
  process.env.OPENAI_MODEL = "stand-in-model";
});
afterAll(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
});
beforeEach(async () => {
  standIn.reset();
  await (await collection("aiProposals")).deleteMany({});
  await (await collection("aiInvocations")).deleteMany({});
});

describe("propose tools", () => {
  it("prepare a task without creating it", async () => {
    const ctx = await ctxFor(USERS.northwind.rep);
    const before = await count("tasks");
    const r = ok(await proposeTask.run(ctx, { accountName: "ACME SAFETY", title: "Send the updated quote", dueDate: await day(3), priority: "high" }));
    expect(r.note).toContain("Nothing has been created");
    expect(ctx.proposals).toEqual([r.proposalId]);
    expect(await count("tasks")).toBe(before);
    const row = (await (await collection("aiProposals")).findOne({ _id: r.proposalId }))!;
    expect(row).toMatchObject({ kind: "task", status: "pending", origin: "chat", userId: USERS.northwind.rep });
    expect(row.input).toMatchObject({ accountId: ACME, title: "Send the updated quote", priority: "high", assigneeRepIds: [] });
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(7 * 86_400_000);
  });

  it("refuse what isn't ready, with the question to ask", async () => {
    const ctx = await ctxFor(USERS.northwind.rep);
    const due = await day(3);
    expect(await proposeTask.run(ctx, { accountName: "ACME SAFETY", title: "Follow up", dueDate: due, priority: "normal" })).toMatchObject({ ok: false, ask: expect.stringContaining("What exactly") });
    expect(await proposeTask.run(ctx, { accountName: "ACME SAFETY", title: "Send the quote", dueDate: await day(-1), priority: "normal" })).toMatchObject({ ok: false, ask: expect.stringContaining("has passed") });
    expect(await proposeTask.run(ctx, { accountName: "ACME SAFETY", title: "Send the quote", dueDate: "Friday", priority: "normal" })).toMatchObject({ ok: false, reason: "invalid" });
    // Another rep's account.
    expect(await proposeTask.run(ctx, { accountName: "Northern Industrial", title: "Send the quote", dueDate: due, priority: "normal" })).toMatchObject({ ok: false, reason: "not_found" });
    expect(await proposeNote.run(ctx, { accountName: "ACME SAFETY", type: "note", summary: " " })).toMatchObject({ ok: false });
    expect(await (await collection("aiProposals")).countDocuments({})).toBe(0);
  });

  it("stop at 3 per question", async () => {
    const ctx = await ctxFor(USERS.northwind.rep);
    const due = await day(2);
    for (const t of ["Send the quote", "Book the fitting", "Confirm the order"]) ok(await proposeTask.run(ctx, { accountName: "ACME SAFETY", title: t, dueDate: due, priority: "normal" }));
    expect(await proposeTask.run(ctx, { accountName: "ACME SAFETY", title: "Ring the buyer", dueDate: due, priority: "normal" })).toMatchObject({ ok: false, reason: "limit" });
  });
});

describe("accepting a proposal", () => {
  it("creates the task through createTask's rules, marked as from Wren, once", async () => {
    const ctx = await ctxFor(USERS.northwind.rep);
    const { proposalId } = ok(await proposeTask.run(ctx, { accountName: "ACME SAFETY", title: "Send the updated quote", dueDate: await day(3), priority: "high" }));
    const before = await count("tasks");

    const [a, b] = await Promise.all([acceptWrenProposal(proposalId), acceptWrenProposal(proposalId)]);
    const results = [a, b];
    expect(await count("tasks")).toBe(before + 1);
    // One click created it; the other got the same result or was told it's in progress.
    expect(results.some((r) => r.ok && r.proposal.status === "accepted")).toBe(true);
    const again = await acceptWrenProposal(proposalId);
    expect(again).toMatchObject({ ok: true, proposal: { status: "accepted", resultHref: expect.stringContaining("/tasks?") } });
    expect(await count("tasks")).toBe(before + 1);

    const task = (await (await collection("tasks")).findOne({ title: "Send the updated quote" }))!;
    expect(task).toMatchObject({ accountId: ACME, source: "ai", createdByUserId: USERS.northwind.rep, ownerRepId: "northwind:r1", priority: "high", status: "open" });
    expect(await (await collection("auditLog")).findOne({ entityId: task._id, action: "task.create" })).toMatchObject({ after: expect.objectContaining({ source: "ai" }) });
  });

  it("books a visit and logs a note through their own actions", async () => {
    const ctx = await ctxFor(USERS.northwind.rep);
    const visit = ok(await proposeVisit.run(ctx, { accountName: "ACME SAFETY", date: await day(4), time: "10:30", type: "site", purpose: "Fit-test the winter range" }));
    const note = ok(await proposeNote.run(ctx, { accountName: "ACME SAFETY", type: "call", summary: "Buyer confirmed the winter order." }));
    const [visits, notes] = [await count("visits"), await count("interactions")];
    expect(await acceptWrenProposal(visit.proposalId)).toMatchObject({ ok: true, proposal: { status: "accepted", resultHref: "/call-cycle" } });
    expect(await acceptWrenProposal(note.proposalId)).toMatchObject({ ok: true, proposal: { status: "accepted" } });
    expect(await count("visits")).toBe(visits + 1);
    expect(await count("interactions")).toBe(notes + 1);
    expect(await (await collection("visits")).findOne({ purpose: "Fit-test the winter range" })).toMatchObject({ accountId: ACME, repId: "northwind:r1", status: "planned" });
  });

  it("is refused when the action refuses, and the proposal stays pending with the reason", async () => {
    signInAs(USERS.northwind.rep);
    const scope = await getScope();
    const id = await createProposal(scope, {
      kind: "task",
      origin: "chat",
      sourceId: null,
      input: { accountId: ACME, title: "Send the quote", dueDate: await day(-1), priority: "normal", description: "", notes: "", assigneeRepIds: [] },
      display: { title: "Send the quote", account: "ACME SAFETY", lines: [] },
    });
    const before = await count("tasks");
    expect(await acceptWrenProposal(id)).toMatchObject({ ok: false, error: "The due date can't be in the past.", proposal: { status: "pending", lastError: "The due date can't be in the past." } });
    expect(await count("tasks")).toBe(before);
  });

  it("works only for its own user, and not once dismissed or expired", async () => {
    const ctx = await ctxFor(USERS.northwind.rep);
    const due = await day(3);
    const a = ok(await proposeTask.run(ctx, { accountName: "ACME SAFETY", title: "Send the quote", dueDate: due, priority: "normal" }));
    const b = ok(await proposeTask.run(ctx, { accountName: "ACME SAFETY", title: "Book the fitting", dueDate: due, priority: "normal" }));
    const c = ok(await proposeTask.run(ctx, { accountName: "ACME SAFETY", title: "Confirm the order", dueDate: due, priority: "normal" }));
    const before = await count("tasks");

    signInAs(USERS.northwind.manager);
    expect(await acceptWrenProposal(a.proposalId)).toMatchObject({ ok: false, error: "This proposal isn't available any more." });
    expect(await dismissWrenProposal(a.proposalId)).toMatchObject({ ok: false });

    signInAs(USERS.northwind.rep);
    expect(await dismissWrenProposal(b.proposalId)).toMatchObject({ ok: true, proposal: { status: "dismissed" } });
    expect(await acceptWrenProposal(b.proposalId)).toMatchObject({ ok: false });
    await (await collection("aiProposals")).updateOne({ _id: c.proposalId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await acceptWrenProposal(c.proposalId)).toMatchObject({ ok: false, proposal: { status: "expired" } });
    expect(await count("tasks")).toBe(before);

    // Saved through the normal form instead (Edit).
    expect(await markWrenProposalSaved(a.proposalId)).toMatchObject({ ok: true, proposal: { status: "accepted", resultHref: null } });
  });
});

describe("proposals in chat", () => {
  it("come back as cards with the answer, and keep their status when the conversation reopens", async () => {
    signInAs(USERS.northwind.rep);
    const due = await day(3);
    standIn.reply(
      { toolCalls: [{ toolName: "propose_task", input: { accountName: "ACME SAFETY", title: "Send the updated quote", dueDate: due, priority: "high" } }] },
      { answer: { text: "I've prepared a task for you to accept.", sources: [] }, bullets: [], followUpQuestion: null },
    );
    const progress: string[] = [];
    const r = await runChatTurn({ message: "Remind me to send ACME the updated quote in 3 days" }, (p) => progress.push(p));
    if (!r.ok) throw new Error(r.message);
    expect(progress).toEqual(["Preparing a task…"]);
    expect(r.answer.proposals).toEqual([expect.objectContaining({ kind: "task", title: "Send the updated quote", status: "pending", account: "ACME SAFETY" })]);
    expect(r.answer.uncited).toBe(true);

    await acceptWrenProposal(r.answer.proposals[0]!.id);
    const scope = await getScope();
    const turns = await turnViews(scope, await getConversation(scope, r.conversationId));
    expect(turns[1]!.proposals[0]).toMatchObject({ status: "accepted" });
  });
});

describe("follow-up suggestions", () => {
  const REPLY = {
    suggestions: [
      { title: "Send the updated quote", dueInDays: 3, priority: "normal", reason: "The report says to send the updated quote.", sources: ["V1"] },
      { title: "Follow up", dueInDays: 7, priority: "low", reason: "Generic.", sources: ["V1"] },
      { title: "Invented task", dueInDays: 2, priority: "high", reason: "Not in the report.", sources: ["Z9"] },
    ],
  };

  it("turn a report into task proposals, once", async () => {
    signInAs(USERS.northwind.rep);
    standIn.reply(REPLY);
    const r = await suggestVisitFollowUps(HARROW_VISIT);
    if (!r.ok) throw new Error(r.message);
    expect(r.fresh).toBe(true);
    expect(r.proposals.map((p) => [p.kind, p.title, p.account])).toEqual([["task", "Send the updated quote", "HARROW HARDWARE GROUP"]]);
    // 3 days after a visit 9 days ago is in the past: due today instead.
    expect(r.proposals[0]!.draft).toMatchObject({ kind: "task", dueDate: await day(0), accountId: "northwind:CG-HARROW-BT1" });

    // The report and the open tasks reached the model, fenced.
    expect(standIn.sent[0]).toContain("Send the updated quote and confirm delivery dates.");
    expect(standIn.sent[0]).toContain("openTasks");

    const again = await suggestVisitFollowUps(HARROW_VISIT);
    expect(again).toMatchObject({ ok: true, fresh: false });
    expect(standIn.sent).toHaveLength(1);
  });

  it("are only for the user's own completed visits with a report", async () => {
    signInAs(USERS.northwind.manager);
    standIn.reply(REPLY);
    expect(await suggestVisitFollowUps(HARROW_VISIT)).toMatchObject({ ok: false, reason: "not_found" });
    signInAs(USERS.northwind.rep);
    expect(await suggestVisitFollowUps("northwind:v1")).toMatchObject({ ok: false, reason: "not_found" }); // planned
    expect(standIn.sent).toHaveLength(0);
  });
});
