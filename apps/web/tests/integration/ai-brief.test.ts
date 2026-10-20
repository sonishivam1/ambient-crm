import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { collection } from "@ambient/db";
import { addDays } from "@ambient/db/time";

import { generateMorningBrief } from "@/app/actions/ai";
import { peekAiFeature, runAiFeature } from "@/lib/ai/engine";
import { myDayFacts } from "@/lib/ai/facts/my-day";
import { briefHeadline, morningBrief, morningBriefHeadline, morningBriefState, type BriefCounts } from "@/lib/ai/features/morning-brief";
import { MORNING_BRIEF_TASK } from "@/lib/ai/prompts/morning-brief";
import { getScope } from "@/lib/data/scope";

import { standIn } from "../support/ai-stand-in";
import { USERS, signInAs } from "../support/session";

vi.mock("@/lib/ai/client", async () => {
  const { standIn } = await import("../support/ai-stand-in");
  return { modelFor: () => ({ model: standIn.model, modelId: process.env.OPENAI_MODEL ?? "stand-in-model" }) };
});

// Priya's day: T1 the overdue ACME task, K1 the ACME renewal; N9 is invented.
const REPLY = {
  items: [
    { kind: "renewal", priority: "high", text: "National Safety Program renews in 21 days.", sources: ["K1"] },
    { kind: "overdue_task", priority: "high", text: "Follow up the delivery delay complaint (T1).", sources: ["T1"] },
    { kind: "alert", priority: "low", text: "Invented", sources: ["N9"] },
  ],
};

const calls = () => standIn.sent.length;
const run = (opts: { refresh?: boolean } = {}) => runAiFeature(morningBrief, {}, opts);
const counts = async () => (await myDayFacts(await getScope())).data.counts as BriefCounts;

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
  await (await collection("aiOutputs")).deleteMany({});
  await (await collection("aiInvocations")).deleteMany({});
});

describe("morning brief", () => {
  it("lists verified items by urgency, each with its records, under a headline counted by code", async () => {
    signInAs(USERS.northwind.rep);
    const r = await run();
    if (!r.ok) throw new Error(r.message);
    expect(r.outcome).toBe("repaired");
    expect(r.output.items.map((i) => [i.kind, i.text, i.sources])).toEqual([
      ["overdue_task", "Follow up the delivery delay complaint.", ["T1"]],
      ["renewal", "National Safety Program renews in 21 days.", ["K1"]],
    ]);
    expect(r.cards.map((c) => [c.kind, c.handle])).toEqual([
      ["task", "T1"],
      ["contract", "K1"],
    ]);
    expect(r.notes).toEqual([briefHeadline(await counts())]);
    expect(r.notes[0]).toMatch(/^1 overdue task · 1 task due today · 1 renewal within 30 days · 3 unread notifications · \d+ quiet accounts?$/);

    const sent = standIn.sent.join("\n");
    expect(sent).toContain(JSON.stringify(MORNING_BRIEF_TASK).slice(1, 50));
    expect(sent).not.toContain("BRIGHTWELL"); // another rep's work
    expect(sent).not.toContain("northwind:");
  });

  it("gives a manager their team's day", async () => {
    signInAs(USERS.northwind.manager);
    await run();
    const sent = standIn.sent.join("\n");
    expect(sent).toContain("Your team's items");
    expect(sent).toContain("Jordan Reyes");
    expect(sent).not.toContain("Review renewal pack before pricing call"); // Grace's
  });

  it("works through the server action and the page state", async () => {
    signInAs(USERS.northwind.rep);
    expect(await morningBriefState()).toEqual({ state: "none" });
    const r = await generateMorningBrief({});
    if (!r.ok) throw new Error(r.message);
    expect(r.answer).toMatchObject({ quiet: false, changed: false });
    expect(r.answer.items).toHaveLength(2);
    expect(await morningBriefState()).toMatchObject({ state: "ready", answer: { headline: r.answer.headline } });
    expect(await generateMorningBrief({ refresh: "yes" } as never)).toMatchObject({ ok: false, reason: "invalid_input" });
  });
});

describe("the day's brief is kept", () => {
  it("serves it again without a call", async () => {
    signInAs(USERS.northwind.rep);
    const first = await run();
    const second = await run();
    expect(calls()).toBe(1);
    if (!first.ok || !second.ok) throw new Error("expected briefs");
    expect(second).toMatchObject({ outcome: "cached", changed: false, generatedAt: first.generatedAt, notes: first.notes });
    expect(second.cards).toEqual(first.cards);
  });

  it("keeps the morning's brief and cards after a record changes, flagged, until Refresh", async () => {
    signInAs(USERS.northwind.rep);
    const first = await run();
    if (!first.ok) throw new Error("expected a brief");

    const tasks = await collection("tasks");
    const task = (await tasks.findOne({ title: "Send updated hi-vis range and price list" }))!;
    await tasks.insertOne({ ...task, _id: "brief-test-task", title: "Call about the winter range" });
    try {
      const peek = await peekAiFeature(morningBrief, {});
      expect(peek).toMatchObject({ state: "ready", answer: { changed: true, notes: first.notes, cards: first.cards } });
      expect(await run()).toMatchObject({ ok: true, outcome: "cached", changed: true, notes: first.notes });
      expect(calls()).toBe(1);

      const fresh = await run({ refresh: true });
      expect(calls()).toBe(2);
      expect(fresh).toMatchObject({ ok: true, changed: false });
      if (!fresh.ok) throw new Error("expected a brief");
      expect(fresh.notes[0]).toContain("2 tasks due today");
    } finally {
      await tasks.deleteOne({ _id: "brief-test-task" });
    }
  });

  it("expires at the next local midnight, on each tenant's calendar", async () => {
    signInAs(USERS.northwind.rep);
    await run();
    const scope = await getScope();
    const row = (await (await collection("aiOutputs")).findOne({ userId: USERS.northwind.rep, feature: "morning-brief" }))!;
    expect(row.expiresAt).toEqual(addDays(scope.today, 1, "Australia/Sydney"));
    expect(row.cards).toHaveLength(2);

    // Harbor & Finch, in Auckland, with AI switched on for this test.
    const tenants = await collection("tenants");
    await tenants.updateOne({ _id: "harbor" }, { $set: { ai: { enabled: true, roles: ["user"], features: ["morning-brief"], monthlyTokenBudget: 100_000 } } });
    try {
      signInAs(USERS.harbor.rep);
      standIn.reply({ items: [] });
      expect(await run()).toMatchObject({ ok: true });
      const harbor = (await (await collection("aiOutputs")).findOne({ userId: USERS.harbor.rep }))!;
      expect(harbor.expiresAt).toEqual(addDays((await getScope()).today, 1, "Pacific/Auckland"));
    } finally {
      await tenants.updateOne({ _id: "harbor" }, { $set: { "ai.enabled": false } });
    }

    signInAs(USERS.northwind.rep);
    await (await collection("aiOutputs")).updateOne({ _id: row._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await peekAiFeature(morningBrief, {})).toEqual({ state: "none" });
  });

  it("is per user, and hidden when AI is switched off", async () => {
    signInAs(USERS.northwind.manager);
    await run();
    signInAs(USERS.northwind.rep);
    expect(await peekAiFeature(morningBrief, {})).toEqual({ state: "none" });
    expect(await morningBriefHeadline()).toBeNull();
    await run();
    expect(calls()).toBe(2);

    const tenants = await collection("tenants");
    await tenants.updateOne({ _id: "northwind" }, { $set: { "ai.enabled": false } });
    try {
      signInAs(USERS.northwind.rep);
      expect(await peekAiFeature(morningBrief, {})).toMatchObject({ state: "unavailable", reason: "ai_disabled" });
      expect(await morningBriefHeadline()).toBeNull();
    } finally {
      await tenants.updateOne({ _id: "northwind" }, { $set: { "ai.enabled": true } });
    }
  });
});

describe("the dashboard headline", () => {
  it("is today's cached headline, read without facts or a call, writing nothing", async () => {
    signInAs(USERS.northwind.rep);
    expect(await morningBriefHeadline()).toBeNull();
    const r = await run();
    if (!r.ok) throw new Error("expected a brief");
    const before = await (await collection("aiInvocations")).countDocuments({});
    expect(await morningBriefHeadline()).toBe(r.notes[0]);
    expect(await (await collection("aiInvocations")).countDocuments({})).toBe(before);
    expect(calls()).toBe(1);
  });
});
