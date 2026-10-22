import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { collection } from "@ambient/db";

import { generateAccountSummary, rateWrenAnswer } from "@/app/actions/ai";
import { runChatTurn } from "@/lib/ai/chat";
import { getConversation, turnViews } from "@/lib/ai/conversations";
import { accountSummaryState } from "@/lib/ai/features/account-summary";
import { getAiReport } from "@/lib/data/ai-report";
import { getScope } from "@/lib/data/scope";

import { standIn } from "../support/ai-stand-in";
import { USERS, signInAs } from "../support/session";

vi.mock("@/lib/ai/client", async () => {
  const { standIn } = await import("../support/ai-stand-in");
  return { modelFor: () => ({ model: standIn.model, modelId: "stand-in-model" }) };
});

const ACME = "northwind:CO-ACME-BT1";
const SUMMARY = { points: [{ section: "attention", text: "The delivery complaint follow-up is overdue.", sources: ["T1"] }], nextStep: null };
const CHAT = { answer: { text: "Nothing else needs you.", sources: [] }, bullets: [], followUpQuestion: null };

beforeAll(() => {
  process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
  process.env.OPENAI_MODEL = "stand-in-model";
});
afterAll(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_PRICE_INPUT_PER_M;
  delete process.env.OPENAI_PRICE_OUTPUT_PER_M;
});
beforeEach(async () => {
  standIn.reset();
  for (const name of ["aiFeedback", "aiOutputs", "aiInvocations", "aiProposals", "aiConversations"] as const) await (await collection(name)).deleteMany({});
});

async function summary() {
  signInAs(USERS.northwind.rep);
  standIn.reply(SUMMARY);
  const r = await generateAccountSummary({ accountId: ACME });
  if (!r.ok) throw new Error(r.message);
  return { kind: "output" as const, feature: "account-summary" as const, subjectId: ACME, generatedAt: new Date(r.answer.generatedAt).toISOString() };
}

describe("feedback on AI answers", () => {
  it("records a vote with what produced the answer, and no text", async () => {
    const target = await summary();
    expect(await rateWrenAnswer({ target, rating: "down", reason: "missing" })).toEqual({ ok: true, vote: { rating: "down", reason: "missing" } });
    const rows = await (await collection("aiFeedback")).find({}).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: USERS.northwind.rep, feature: "account-summary", rating: "down", reason: "missing", promptVersion: 1, policyVersion: 1, model: "stand-in-model" });
    expect(Object.keys(rows[0]!).sort()).toEqual(["_id", "answerKey", "createdAt", "feature", "model", "policyVersion", "promptVersion", "rating", "reason", "tenantId", "updatedAt", "userId"]);
    expect(JSON.stringify(rows[0])).not.toContain("delivery complaint");
  });

  it("replaces an earlier vote, drops a reason on 👍, and shows the vote when the summary reopens", async () => {
    const target = await summary();
    await rateWrenAnswer({ target, rating: "down", reason: "wrong" });
    expect(await rateWrenAnswer({ target, rating: "up", reason: "wrong" })).toEqual({ ok: true, vote: { rating: "up", reason: null } });
    expect(await (await collection("aiFeedback")).countDocuments({})).toBe(1);
    expect(await accountSummaryState(ACME)).toMatchObject({ state: "ready", answer: { vote: { rating: "up", reason: null } } });
  });

  it("is only for the user's own answer, while it's still the one shown", async () => {
    const target = await summary();
    // Another user rating Priya's summary: it isn't theirs.
    signInAs(USERS.northwind.manager);
    expect(await rateWrenAnswer({ target, rating: "up" })).toMatchObject({ ok: false });
    // A regenerated summary can't take the old one's vote.
    signInAs(USERS.northwind.rep);
    standIn.reply(SUMMARY);
    await generateAccountSummary({ accountId: ACME, refresh: true });
    expect(await rateWrenAnswer({ target, rating: "up" })).toMatchObject({ ok: false, error: expect.stringContaining("changed") });
    expect(await rateWrenAnswer({ target, rating: "down", reason: "rude" as never })).toMatchObject({ ok: false, error: "That rating isn't valid." });
    expect(await (await collection("aiFeedback")).countDocuments({})).toBe(0);
  });

  it("works on chat answers, and the vote comes back with the conversation", async () => {
    signInAs(USERS.northwind.rep);
    standIn.reply(CHAT);
    const r = await runChatTurn({ message: "Anything else?" });
    if (!r.ok) throw new Error(r.message);
    const target = { kind: "turn" as const, conversationId: r.conversationId, turnId: r.answer.id };
    expect(await rateWrenAnswer({ target, rating: "up" })).toMatchObject({ ok: true });
    expect(await (await collection("aiFeedback")).findOne({})).toMatchObject({ feature: "wren-chat", promptVersion: 2, model: "stand-in-model" });
    const scope = await getScope();
    const turns = await turnViews(scope, await getConversation(scope, r.conversationId));
    expect(turns[1]!.vote).toEqual({ rating: "up", reason: null });
    // The question can't be rated, and neither can someone else.
    expect(await rateWrenAnswer({ target: { ...target, turnId: r.question.id }, rating: "up" })).toMatchObject({ ok: false });
    signInAs(USERS.northwind.manager);
    expect(await rateWrenAnswer({ target, rating: "down" })).toMatchObject({ ok: false });
  });
});

describe("the admin AI report", () => {
  it("shows this month's totals to admins only, with no text", async () => {
    const target = await summary();
    await rateWrenAnswer({ target, rating: "down", reason: "unclear" });
    signInAs(USERS.northwind.rep);
    standIn.reply(CHAT);
    await runChatTurn({ message: "Anything else?" });
    // A refusal, and another tenant's request that must not be counted.
    signInAs(USERS.northwind.admin);
    await runChatTurn({ message: "Hi" });
    signInAs(USERS.harbor.rep);
    await runChatTurn({ message: "Hi" });

    signInAs(USERS.northwind.rep);
    expect(await getAiReport()).toBeNull();

    signInAs(USERS.northwind.admin);
    const report = (await getAiReport())!;
    expect(report.usage.find((u) => u.feature === "account-summary")).toMatchObject({ calls: 1, cached: 0, inputTokens: 120, outputTokens: 40, cost: null });
    expect(report.usage.find((u) => u.feature === "wren-chat")).toMatchObject({ calls: 1, refused: 1 });
    expect(report.refusals).toEqual([{ reason: "role_not_allowed", count: 1 }]);
    expect(report.feedback).toEqual([{ feature: "account-summary", promptVersion: 1, up: 0, down: 1, reasons: { unclear: 1 } }]);
    expect(report.budget).toMatchObject({ limit: 2_000_000, enabled: true });
    expect(report.budget.used).toBeGreaterThan(0);
    expect(report.pricesSet).toBe(false);
    expect(JSON.stringify(report)).not.toMatch(/delivery complaint|Nothing else needs you|Anything else/);

    process.env.OPENAI_PRICE_INPUT_PER_M = "0.4";
    process.env.OPENAI_PRICE_OUTPUT_PER_M = "1.6";
    const priced = (await getAiReport())!;
    expect(priced.usage.find((u) => u.feature === "account-summary")!.cost).toBeCloseTo((120 * 0.4 + 40 * 1.6) / 1_000_000, 10);
  });

  it("counts proposals by where they came from and what happened to them", async () => {
    signInAs(USERS.northwind.rep);
    const proposals = await collection("aiProposals");
    const base = { tenantId: "northwind", userId: USERS.northwind.rep, kind: "task" as const, input: {}, display: { title: "t", account: "a", lines: [] }, sourceId: null, resultId: null, resultHref: null, lastError: null, decidedAt: null, createdAt: new Date() };
    const later = new Date(Date.now() + 86_400_000);
    await proposals.insertMany([
      { ...base, _id: "p1", origin: "chat", status: "accepted", expiresAt: later },
      { ...base, _id: "p2", origin: "chat", status: "dismissed", expiresAt: later },
      { ...base, _id: "p3", origin: "chat", status: "pending", expiresAt: new Date(Date.now() - 1000) },
      { ...base, _id: "p4", origin: "followups", status: "pending", expiresAt: later },
      { ...base, _id: "p5", tenantId: "harbor", origin: "chat", status: "accepted", expiresAt: later },
    ]);
    signInAs(USERS.northwind.admin);
    expect((await getAiReport())!.proposals).toEqual([
      { origin: "chat", prepared: 3, accepted: 1, dismissed: 1, expired: 1, pending: 0 },
      { origin: "followups", prepared: 1, accepted: 0, dismissed: 0, expired: 0, pending: 1 },
    ]);
  });
});
