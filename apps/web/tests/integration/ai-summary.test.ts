import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { INDEXES, collection } from "@ambient/db";

import { generateAccountSummary } from "@/app/actions/ai";
import { RATE_LIMIT } from "@/lib/ai/config";
import { peekAiFeature, runAiFeature } from "@/lib/ai/engine";
import { accountFacts } from "@/lib/ai/facts/account";
import { accountSummary } from "@/lib/ai/features/account-summary";
import { ACCOUNT_SUMMARY_TASK } from "@/lib/ai/prompts/account-summary";
import { getScope } from "@/lib/data/scope";

import { standIn } from "../support/ai-stand-in";
import { USERS, signInAs } from "../support/session";

vi.mock("@/lib/ai/client", async () => {
  const { standIn } = await import("../support/ai-stand-in");
  return { modelFor: () => ({ model: standIn.model, modelId: process.env.OPENAI_MODEL ?? "stand-in-model" }) };
});

const ACME = "northwind:CO-ACME-BT1"; // Priya's
const NORTHERN = "northwind:CO-NORTHERN-BT1"; // Grace's
const input = { accountId: ACME };

/** A reply citing the account, its overdue task and an invented record. */
const REPLY = {
  points: [
    { section: "attention", text: "The delivery complaint follow-up is overdue (T1).", sources: ["T1"] },
    { section: "status", text: "**At risk**, last touched yesterday.", sources: ["A1"] },
    { section: "activity", text: "Invented meeting", sources: ["Z9"] },
  ],
  nextStep: { text: "Call the buyer about the delivery delay.", sources: ["T1"] },
};

const calls = () => standIn.sent.length;
const lastInvocation = async () => (await collection("aiInvocations")).find({ userId: USERS.northwind.rep }).sort({ createdAt: -1 }).limit(1).next();
const used = async () => (await (await collection("aiUsage")).findOne({ tenantId: "northwind" }))?.used ?? 0;
const run = (opts: { refresh?: boolean } = {}) => runAiFeature(accountSummary, input, opts);

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
  standIn.reply(REPLY);
  process.env.OPENAI_MODEL = "stand-in-model";
  // Each test starts with no cached answers and no recent requests.
  await (await collection("aiOutputs")).deleteMany({});
  await (await collection("aiInvocations")).deleteMany({});
});

describe("account summary", () => {
  it("is verified, limited and shown with the cited records and code-computed gaps", async () => {
    signInAs(USERS.northwind.rep);
    const r = await run();
    if (!r.ok) throw new Error(r.message);
    expect(r.outcome).toBe("repaired"); // the invented point was dropped
    expect(r.output.points).toEqual([
      { section: "status", text: "At risk, last touched yesterday.", sources: ["A1"] },
      { section: "attention", text: "The delivery complaint follow-up is overdue.", sources: ["T1"] },
    ]);
    expect(r.cards.map((c) => [c.kind, c.handle])).toEqual([
      ["account", "A1"],
      ["task", "T1"],
    ]);
    // ACME has planned visits, recent calls, tasks, contacts and a contract, but no completed visit.
    expect(r.notes).toEqual(["No completed visit in the last 90 days"]);

    const sent = standIn.sent.join("\n");
    expect(sent).toContain(JSON.stringify(ACCOUNT_SUMMARY_TASK).slice(1, 60));
    expect(sent).toContain("notOnRecord");
    expect(sent).not.toContain("northwind:");
  });

  it("is not found for an account outside the user's scope, with no call", async () => {
    signInAs(USERS.northwind.rep);
    expect(await runAiFeature(accountSummary, { accountId: NORTHERN })).toMatchObject({ ok: false, reason: "not_found" });
    expect(await peekAiFeature(accountSummary, { accountId: NORTHERN })).toMatchObject({ state: "unavailable", reason: "not_found" });
    expect(calls()).toBe(0);
  });

  it("works through the server action", async () => {
    signInAs(USERS.northwind.rep);
    const r = await generateAccountSummary({ accountId: ACME });
    if (!r.ok) throw new Error(r.message);
    expect(r.answer).toMatchObject({ cached: false, notes: ["No completed visit in the last 90 days"] });
    expect(r.answer.cards).toHaveLength(2);
    expect(r.answer).not.toHaveProperty("sources");
    expect(await generateAccountSummary({ accountId: "" })).toMatchObject({ ok: false, reason: "invalid_input" });
  });
});

describe("the summary cache", () => {
  it("serves the same facts again without a call, tokens or a rate-limit hit", async () => {
    signInAs(USERS.northwind.rep);
    const first = await run();
    const tokens = await used();
    const second = await run();
    expect(calls()).toBe(1);
    if (!first.ok || !second.ok) throw new Error("expected answers");
    expect(second.outcome).toBe("cached");
    expect(second.output).toEqual(first.output);
    expect(second.cards).toEqual(first.cards);
    expect(second.generatedAt).toEqual(first.generatedAt);
    expect(await used()).toBe(tokens);
    expect(await lastInvocation()).toMatchObject({ outcome: "cached", inputTokens: 0, outputTokens: 0, attempts: 0, model: "stand-in-model" });

    // Cached requests don't count towards the limits.
    const template = (await lastInvocation())!;
    await (await collection("aiInvocations")).insertMany(Array.from({ length: RATE_LIMIT.perMinute }, (_, i) => ({ ...template, _id: `cached-${i}`, createdAt: new Date() })));
    expect(await run({ refresh: true })).toMatchObject({ ok: true, outcome: "repaired" });
    expect(calls()).toBe(2);
  });

  it("is hidden as stale once a record changes, and the next request calls again", async () => {
    signInAs(USERS.northwind.rep);
    await run();
    expect(await peekAiFeature(accountSummary, input)).toMatchObject({ state: "ready" });

    const tasks = await collection("tasks");
    const task = (await tasks.findOne({ accountId: ACME, status: "open" }))!;
    await tasks.insertOne({ ...task, _id: "summary-test-task", title: "Book a pricing call", dueAt: new Date(Date.now() + 3 * 86_400_000) });
    try {
      expect(await peekAiFeature(accountSummary, input)).toEqual({ state: "stale" });
      expect(await run()).toMatchObject({ ok: true, outcome: "repaired" });
      expect(calls()).toBe(2);
    } finally {
      await tasks.deleteOne({ _id: "summary-test-task" });
    }
  });

  it("calls again on Refresh, a new prompt version or another model", async () => {
    signInAs(USERS.northwind.rep);
    await run();
    await run({ refresh: true });
    expect(calls()).toBe(2);
    await runAiFeature({ ...accountSummary, version: 2 }, input);
    expect(calls()).toBe(3);
    process.env.OPENAI_MODEL = "another-model";
    await run();
    expect(calls()).toBe(4);
  });

  it("is per user: a manager's summary is never served to a rep, or the other way round", async () => {
    signInAs(USERS.northwind.manager);
    await run();
    signInAs(USERS.northwind.rep);
    expect(await peekAiFeature(accountSummary, input)).toEqual({ state: "none" });
    await run();
    expect(calls()).toBe(2);
    const rows = await (await collection("aiOutputs")).find({ subjectId: ACME }).toArray();
    expect(rows.map((r) => r.userId).sort()).toEqual([USERS.northwind.manager, USERS.northwind.rep].sort());
  });

  it("is hidden when AI is switched off for the tenant", async () => {
    signInAs(USERS.northwind.rep);
    await run();
    const tenants = await collection("tenants");
    await tenants.updateOne({ _id: "northwind" }, { $set: { "ai.enabled": false } });
    try {
      signInAs(USERS.northwind.rep);
      expect(await run()).toMatchObject({ ok: false, reason: "ai_disabled" });
      expect(await peekAiFeature(accountSummary, input)).toMatchObject({ state: "unavailable", reason: "ai_disabled" });
    } finally {
      await tenants.updateOne({ _id: "northwind" }, { $set: { "ai.enabled": true } });
    }
  });

  it("expires after 7 days, with a TTL index to delete old rows", async () => {
    signInAs(USERS.northwind.rep);
    await run();
    const row = (await (await collection("aiOutputs")).findOne({ userId: USERS.northwind.rep }))!;
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(7 * 86_400_000);
    expect(row).not.toHaveProperty("facts");
    expect(INDEXES.aiOutputs).toContainEqual({ key: { expiresAt: 1 }, expireAfterSeconds: 0 });

    await (await collection("aiOutputs")).updateOne({ _id: row._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await peekAiFeature(accountSummary, input)).toEqual({ state: "none" });
    await run();
    expect(calls()).toBe(2);
  });
});

describe("peek", () => {
  it("says what the card can show, and writes nothing", async () => {
    signInAs(USERS.northwind.rep);
    expect(await peekAiFeature(accountSummary, input)).toEqual({ state: "none" });
    await run();
    const counts = async () => [await (await collection("aiInvocations")).countDocuments({}), await (await collection("aiOutputs")).countDocuments({})];
    const before = await counts();
    const peek = await peekAiFeature(accountSummary, input);
    expect(peek).toMatchObject({ state: "ready", answer: { outcome: "cached" } });
    expect(await counts()).toEqual(before);
    expect(calls()).toBe(1);

    delete process.env.OPENAI_API_KEY;
    expect(await peekAiFeature(accountSummary, input)).toEqual({ state: "unavailable", reason: "not_configured", message: "AI isn't set up yet." });
    process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";

    signInAs(USERS.northwind.admin);
    expect(await peekAiFeature(accountSummary, input)).toMatchObject({ state: "unavailable", reason: "role_not_allowed" });
  });
});

describe("gaps in the facts", () => {
  it("come from the records: Delta's second bill-to has nothing on it", async () => {
    signInAs(USERS.northwind.rep);
    const facts = await accountFacts(await getScope(), { accountId: "northwind:SA-DELTA-BT2" });
    expect(facts!.data.notOnRecord).toEqual([
      "No visit planned",
      "No completed visit in the last 90 days",
      "No call, meeting or note logged in the last 30 days",
      "No open tasks",
      "No active contacts",
      "No active contract",
    ]);
  });
});
