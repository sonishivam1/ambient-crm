import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { collection } from "@ambient/db";

import { POST as chatRoute } from "@/app/api/v1/ai/chat/route";
import { CHAT_LIMITS, runChatTurn } from "@/lib/ai/chat";
import { CONVERSATION_DAYS, deleteConversation, getConversation, listConversations } from "@/lib/ai/conversations";
import { getScope } from "@/lib/data/scope";

import { standIn } from "../support/ai-stand-in";
import { USERS, signInAs } from "../support/session";

vi.mock("@/lib/ai/client", async () => {
  const { standIn } = await import("../support/ai-stand-in");
  return { modelFor: () => ({ model: standIn.model, modelId: "stand-in-model" }) };
});

const OVERDUE = { toolCalls: [{ toolName: "list_tasks", input: { status: "overdue", accountName: null } }] };
const ANSWER = {
  answer: { text: "One task is **overdue**: the delivery complaint follow-up (T1).", sources: ["T1"] },
  bullets: [
    { text: "It is on ACME SAFETY.", sources: ["T1"] },
    { text: "Invented", sources: ["Z9"] },
  ],
  followUpQuestion: "Want ACME SAFETY's summary?",
};

const invocations = async (userId: string) => (await collection("aiInvocations")).find({ userId }).toArray();

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
  await (await collection("aiConversations")).deleteMany({});
  await (await collection("aiInvocations")).deleteMany({});
});

describe("a chat question", () => {
  it("looks records up with tools, verifies the answer and shows the cited records", async () => {
    signInAs(USERS.northwind.rep);
    standIn.reply(OVERDUE, ANSWER);
    const progress: string[] = [];
    const r = await runChatTurn({ message: "What's overdue?" }, (p) => progress.push(p));
    if (!r.ok) throw new Error(r.message);
    expect(progress).toEqual(["Checking your tasks…"]);
    expect(r.answer).toMatchObject({
      role: "assistant",
      text: "One task is overdue: the delivery complaint follow-up.",
      bullets: ["It is on ACME SAFETY."],
      followUpQuestion: "Want ACME SAFETY's summary?",
      uncited: false,
    });
    expect(r.answer.cards.map((c) => [c.kind, c.handle])).toEqual([["task", "T1"]]);
    expect(r.question).toMatchObject({ role: "user", text: "What's overdue?" });

    // Two model calls (tool step, then the answer), one request for the limits.
    expect(standIn.sent).toHaveLength(2);
    expect(await invocations(USERS.northwind.rep)).toEqual([expect.objectContaining({ feature: "wren-chat", outcome: "repaired", attempts: 2 })]);
    const sent = standIn.sent.join("\n");
    expect(sent).not.toContain("northwind:");
    expect(sent).not.toContain("BRIGHTWELL");
  });

  it("rejects an answer that cites nothing when the tools found records", async () => {
    signInAs(USERS.northwind.rep);
    standIn.reply(OVERDUE, { answer: { text: "You have 7 overdue tasks.", sources: [] }, bullets: [], followUpQuestion: null });
    expect(await runChatTurn({ message: "What's overdue?" })).toMatchObject({ ok: false, reason: "rejected" });
    expect(await listConversations(await getScope())).toEqual([]);
  });

  it("shows an answer without records, marked, when nothing was looked up", async () => {
    signInAs(USERS.northwind.rep);
    standIn.reply({ answer: { text: "I can only help with your CRM data.", sources: ["T1"] }, bullets: [{ text: "x", sources: ["T1"] }], followUpQuestion: null });
    const r = await runChatTurn({ message: "What's the capital of France?" });
    expect(r).toMatchObject({ ok: true, answer: { text: "I can only help with your CRM data.", uncited: true, cards: [], bullets: [] } });
  });

  it("asks back when an account name is ambiguous", async () => {
    signInAs(USERS.northwind.rep);
    standIn.reply({ toolCalls: [{ toolName: "get_account", input: { name: "acme" } }] }, { answer: { text: "Which ACME do you mean?", sources: [] }, bullets: [], followUpQuestion: null });
    const progress: string[] = [];
    const r = await runChatTurn({ message: "How is acme doing?" }, (p) => progress.push(p));
    expect(progress).toEqual(["Looking up acme…"]);
    expect(r).toMatchObject({ ok: true, answer: { uncited: true } });
    // The tool's question reached the model, not any of ACME's records.
    expect(standIn.sent[1]).toContain("Which one do you mean: ACME SAFETY");
    expect(standIn.sent[1]).not.toContain("Hannah Brooks");
  });

  it("stops after 4 tool calls", async () => {
    signInAs(USERS.northwind.rep);
    const five = { toolCalls: Array.from({ length: 5 }, () => ({ toolName: "list_renewals", input: { withinDays: "30" } })) };
    standIn.reply(five, { answer: { text: "One renewal is due.", sources: ["K1"] }, bullets: [], followUpQuestion: null });
    const progress: string[] = [];
    const r = await runChatTurn({ message: "Renewals?" }, (p) => progress.push(p));
    expect(progress).toHaveLength(CHAT_LIMITS.toolCalls);
    expect(standIn.sent[1]).toContain("as much as I can for one question");
    expect(r).toMatchObject({ ok: true });
  });

  it("is refused before any call when AI is off, or for a role without it", async () => {
    signInAs(USERS.harbor.rep);
    expect(await runChatTurn({ message: "Hi" })).toMatchObject({ ok: false, reason: "ai_disabled" });
    signInAs(USERS.northwind.admin);
    expect(await runChatTurn({ message: "Hi" })).toMatchObject({ ok: false, reason: "role_not_allowed" });
    expect(await runChatTurn({ message: "   " })).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(standIn.sent).toHaveLength(0);
  });
});

describe("conversations", () => {
  it("are saved, and earlier turns go back as text without handles", async () => {
    signInAs(USERS.northwind.rep);
    standIn.reply(OVERDUE, ANSWER);
    const first = await runChatTurn({ message: "What's overdue?" });
    if (!first.ok) throw new Error(first.message);

    standIn.reset();
    standIn.reply({ answer: { text: "I can't change tasks yet; open Tasks to do it.", sources: [] }, bullets: [], followUpQuestion: null });
    const second = await runChatTurn({ conversationId: first.conversationId, message: "Mark it done" });
    expect(second).toMatchObject({ ok: true, conversationId: first.conversationId });

    // The second question's first model call has the history as plain text and no handles.
    expect(standIn.sent[0]).toContain("What's overdue?");
    expect(standIn.sent[0]).toContain("One task is overdue: the delivery complaint follow-up.");
    expect(standIn.sent[0]).not.toMatch(/\bT1\b/);

    const scope = await getScope();
    const saved = (await getConversation(scope, first.conversationId))!;
    expect(saved.title).toBe("What's overdue?");
    expect(saved.turns.map((t) => [t.role, t.text])).toEqual([
      ["user", "What's overdue?"],
      ["assistant", "One task is overdue: the delivery complaint follow-up."],
      ["user", "Mark it done"],
      ["assistant", "I can't change tasks yet; open Tasks to do it."],
    ]);
    expect(saved.turns[1]!.cards).toHaveLength(1);
    expect(saved.expiresAt.getTime() - saved.updatedAt.getTime()).toBe(CONVERSATION_DAYS * 86_400_000);
    expect(await listConversations(scope)).toEqual([{ id: first.conversationId, title: "What's overdue?", updatedAt: saved.updatedAt.toISOString() }]);
  });

  it("are private: another user can't read, continue or delete one", async () => {
    signInAs(USERS.northwind.rep);
    standIn.reply({ answer: { text: "Hello.", sources: [] }, bullets: [], followUpQuestion: null });
    const mine = await runChatTurn({ message: "Hi" });
    if (!mine.ok) throw new Error(mine.message);

    signInAs(USERS.northwind.manager);
    const scope = await getScope();
    expect(await getConversation(scope, mine.conversationId)).toBeNull();
    expect(await listConversations(scope)).toEqual([]);
    standIn.reset();
    expect(await runChatTurn({ conversationId: mine.conversationId, message: "What did they ask?" })).toMatchObject({ ok: false, reason: "not_found" });
    expect(standIn.sent).toHaveLength(0);
    expect(await deleteConversation(scope, mine.conversationId)).toBe(false);

    signInAs(USERS.northwind.rep);
    expect(await deleteConversation(await getScope(), mine.conversationId)).toBe(true);
  });

  it("disappear once expired", async () => {
    signInAs(USERS.northwind.rep);
    standIn.reply({ answer: { text: "Hello.", sources: [] }, bullets: [], followUpQuestion: null });
    const r = await runChatTurn({ message: "Hi" });
    if (!r.ok) throw new Error(r.message);
    await (await collection("aiConversations")).updateOne({ _id: r.conversationId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const scope = await getScope();
    expect(await getConversation(scope, r.conversationId)).toBeNull();
    expect(await listConversations(scope)).toEqual([]);
  });
});

describe("POST /api/v1/ai/chat", () => {
  const post = (body: unknown) => new Request("http://localhost/api/v1/ai/chat", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  const lines = async (res: Response) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l));

  it("streams progress, then the verified answer, as NDJSON", async () => {
    signInAs(USERS.northwind.rep);
    standIn.reply(OVERDUE, ANSWER);
    const res = await chatRoute(post({ message: "What's overdue?" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(res.headers.get("X-API-Version")).toBe("1");
    const events = await lines(res);
    expect(events.map((e) => e.type)).toEqual(["progress", "answer"]);
    expect(events[1]).toMatchObject({ answer: { text: "One task is overdue: the delivery complaint follow-up.", cards: [{ kind: "task", handle: "T1" }] } });
  });

  it("sends refusals as an error event, and rejects bad input with 400", async () => {
    signInAs(USERS.harbor.rep);
    expect(await lines(await chatRoute(post({ message: "Hi" })))).toEqual([{ type: "error", reason: "ai_disabled", message: "AI is turned off for your organisation." }]);
    const bad = await chatRoute(post({ message: "" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: "invalid_input" } });
  });
});
