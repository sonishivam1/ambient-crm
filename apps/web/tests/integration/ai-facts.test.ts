import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { collection } from "@ambient/db";

import { defineAiFeature, runAiFeature } from "@/lib/ai/engine";
import { renderFacts, type FactPacket } from "@/lib/ai/facts";
import { ACCOUNT_CAPS, accountFacts } from "@/lib/ai/facts/account";
import { factDate } from "@/lib/ai/facts/format";
import { MY_DAY_CAPS, myDayFacts } from "@/lib/ai/facts/my-day";
import { getScope } from "@/lib/data/scope";

import { standIn } from "../support/ai-stand-in";
import { USERS, signInAs } from "../support/session";

vi.mock("@/lib/ai/client", async () => {
  const { standIn } = await import("../support/ai-stand-in");
  return { modelFor: () => ({ model: standIn.model, modelId: "stand-in-model" }) };
});

const ACME = "northwind:CO-ACME-BT1"; // Priya's bill-to
const ACME_SITE = "northwind:CO-ACME-BT1-ST1"; // one of its sold-tos
const NORTHERN = "northwind:CO-NORTHERN-BT1"; // Grace's
const HARBOR_ACME = "harbor:CO-ACME-BT1"; // same code, other tenant

type Fact = Record<string, unknown> & { handle: string };
const facts = async (accountId: string) => accountFacts(await getScope(), { accountId });
const data = (p: FactPacket | null) => p!.data as Record<string, unknown> & Record<string, Fact[] | Fact>;
const list = (p: FactPacket | null, key: string) => data(p)[key] as Fact[];

/** Everything fenced as staff-written text in a packet. */
const FENCED = /^<untrusted>[^<]*<\/untrusted>$/;

describe("account facts", () => {
  it("hold a rep's account with its tasks, visits, interactions, contracts and contacts", async () => {
    signInAs(USERS.northwind.rep);
    const p = await facts(ACME);
    const d = data(p);
    expect(d.account).toMatchObject({ handle: "A1", name: "ACME SAFETY", type: "Bill-to", health: "At risk", owner: "Priya Nair", division: "Uniforms", group: "ACME SAFETY" });

    const tasks = list(p, "tasks");
    expect(tasks.map((t) => [t.handle, t.title, t.overdue])).toEqual([
      ["T1", "<untrusted>Follow up on delivery delay complaint</untrusted>", true],
      ["T2", "<untrusted>Schedule executive check-in</untrusted>", false],
    ]);
    expect(tasks[0]).toMatchObject({ status: "Open", priority: "High", owner: "Priya Nair" });

    // The visit two days ago was never closed, so it leads, flagged.
    const visits = d.visits as unknown as { planned: Fact[]; recent: Fact[] };
    expect(visits.planned.map((v) => [v.purpose, v.status])).toEqual([
      ["<untrusted>Delivery issue walk-through</untrusted>", "Planned, day passed, not closed"],
      ["<untrusted>Executive check-in</untrusted>", "Planned"],
    ]);
    expect(visits.recent).toEqual([]);

    const interactions = list(p, "interactions");
    expect(interactions).toHaveLength(3);
    expect(interactions[0]).toMatchObject({ handle: "I1", type: "Call", by: "Priya Nair" });
    expect(interactions.every((i) => FENCED.test(i.summary as string))).toBe(true);

    expect(list(p, "contracts").map((k) => [k.name, k.daysLeft, k.band, k.value])).toEqual([["National Safety Program", 21, "≤ 30 days", "$312K"]]);
    // By last name, as on the profile.
    expect(list(p, "contacts").map((c) => c.name)).toEqual(["Hannah Brooks", "Tessa Doyle", "Marcus Lee"]);
    expect(list(p, "contacts")[1]).toEqual({ handle: "C2", name: "Tessa Doyle", title: "WHS Officer", roles: ["Safety", "Operations"] });
    expect(d.counts).toEqual({ openTasks: 2, overdueTasks: 1, contracts: 1, activeContacts: 3 });
  });

  it("never carry an email, phone number or real id", async () => {
    signInAs(USERS.northwind.rep);
    const sent = renderFacts((await facts(ACME))!);
    expect(sent).not.toContain("@");
    expect(sent).not.toMatch(/0491|570 1/);
    expect(sent).not.toContain("northwind:");
    expect(sent).not.toContain("CT-24"); // contract numbers stay on cards
    // Real ids live only on the cards, which stay on the server.
    expect(JSON.stringify((await facts(ACME))!.data)).not.toContain(ACME);
  });

  it("give a sold-to its bill-to's contracts and the contacts for that site", async () => {
    signInAs(USERS.northwind.rep);
    const p = await facts(ACME_SITE);
    expect(data(p).account).toMatchObject({ type: "Sold-to", health: expect.any(String) });
    expect(list(p, "contracts").map((k) => k.name)).toEqual(["National Safety Program"]);
    expect(list(p, "contacts").map((c) => c.name)).toEqual(["Hannah Brooks", "Marcus Lee"]);
  });

  it("are not found for another rep's account, another tenant's or one that doesn't exist", async () => {
    signInAs(USERS.northwind.rep);
    expect(await facts(NORTHERN)).toBeNull();
    expect(await facts(HARBOR_ACME)).toBeNull();
    expect(await facts("northwind:NOPE")).toBeNull();
    // Priya's manager can see it.
    signInAs(USERS.northwind.manager);
    expect(data(await facts(ACME)).account).toMatchObject({ name: "ACME SAFETY" });
  });

  it("keep a card for every handle, from the same records", async () => {
    signInAs(USERS.northwind.rep);
    const p = (await facts(ACME))!;
    expect([...p.cards.keys()].sort()).toEqual([...p.handles].sort());
    expect(p.cards.get("A1")).toMatchObject({ kind: "account", name: "ACME SAFETY", health: "r", href: "/accounts/northwind%3ACO-ACME-BT1" });
    expect(p.cards.get("T1")).toMatchObject({ kind: "task", title: "Follow up on delivery delay complaint", overdue: true, href: `/tasks?view=all&account=${encodeURIComponent(ACME)}` });
    expect(p.cards.get("K1")).toMatchObject({ kind: "contract", number: "CT-2402", value: "$312K", daysLeftLabel: "21 days", band: "30" });
    expect(p.cards.get("C1")).toEqual({ kind: "contact", handle: "C1", name: "Hannah Brooks", jobTitle: "Procurement Manager", roles: ["Buyer"], href: `/contacts?account=${encodeURIComponent(ACME)}` });
    expect(p.cards.get("V1")).toMatchObject({ kind: "visit", statusLabel: "Overdue", href: "/call-cycle" });
    // Same facts, same fingerprint.
    expect((await facts(ACME))!.fingerprint).toBe(p.fingerprint);
  });
});

describe("my day facts", () => {
  const names = (p: FactPacket, key: string) => list(p, key).map((x) => (x.title ?? x.name ?? x.purpose) as string);

  it("give a rep only their own items", async () => {
    signInAs(USERS.northwind.rep);
    const p = await myDayFacts(await getScope());
    const d = data(p);
    expect(d.view).toBe("Your items");
    expect(names(p, "overdueTasks")).toEqual(["<untrusted>Follow up on delivery delay complaint</untrusted>"]);
    expect(names(p, "tasksDueToday")).toEqual(["<untrusted>Send updated hi-vis range and price list</untrusted>"]);
    expect(list(p, "overdueTasks")[0]).toMatchObject({ account: "ACME SAFETY", priority: "High" });
    expect(list(p, "overdueTasks")[0]).not.toHaveProperty("owner"); // it's always Priya
    expect(list(p, "visitsToday")).toEqual([]);
    expect(list(p, "renewals").map((k) => [k.name, k.account, k.daysLeft])).toEqual([["National Safety Program", "ACME SAFETY", 21]]);
    // Her own unread notifications only.
    expect(list(p, "notifications").map((n) => n.title)).toEqual(["ACME SAFETY moved to At risk", "Contract renews in 9 days", "Wren drafted a follow-up task"]);
    expect(list(p, "notifications").every((n) => FENCED.test(n.body as string))).toBe(true);

    // Accounts with recent contact aren't quiet; every quiet one is hers.
    const quiet = list(p, "quietAccounts");
    expect(quiet.length).toBeGreaterThan(0);
    expect(quiet.map((a) => a.name)).not.toContain("ACME SAFETY");
    expect(quiet.map((a) => a.name)).not.toContain("HARROW HARDWARE GROUP");
    expect(quiet.every((a) => a.owner === "Priya Nair" && a.lastTouch === "No contact logged")).toBe(true);

    const sent = renderFacts(p);
    expect(sent).not.toContain("BRIGHTWELL");
    expect(sent).not.toContain("northwind:");
    expect(d.counts).toMatchObject({ overdueTasks: 1, tasksDueToday: 1, visitsToday: 0, renewalsWithin30Days: 1, unreadNotifications: 3 });
  });

  it("give a manager their team's items, with whose they are", async () => {
    signInAs(USERS.northwind.manager);
    const p = await myDayFacts(await getScope());
    expect(data(p).view).toBe("Your team's items");
    expect(list(p, "overdueTasks").map((t) => [t.title, t.owner])).toEqual([
      ["<untrusted>Call buyer about stock shortage</untrusted>", "Jordan Reyes"],
      ["<untrusted>Follow up on delivery delay complaint</untrusted>", "Priya Nair"],
    ]);
    expect(list(p, "visitsToday").map((v) => [v.account, v.rep])).toEqual([["METRO SERVICES", "Mia Chen"]]);
    // Grace's work isn't in Liam's team.
    expect(renderFacts(p)).not.toContain("Review renewal pack before pricing call");
  });

  it("use the tenant's calendar: Harbor & Finch in Auckland", async () => {
    signInAs(USERS.harbor.rep);
    const scope = await getScope();
    const p = await myDayFacts(scope);
    expect(data(p).today).toBe(factDate(new Date(), "Pacific/Auckland"));
    expect(names(p, "tasksDueToday")).toEqual(["<untrusted>Send updated trade price list</untrusted>"]);
    const [visit] = list(p, "visitsToday");
    expect(visit).toMatchObject({ account: "ACME ELECTRICAL NZ", type: "Site visit" });
    // Seeded at 9 am local time, and shown as 9 am Auckland time.
    expect(visit!.when).toMatch(/^\w{3} \d{1,2} \w{3} \d{4}, 9:00 am$/);
    expect(renderFacts(p)).not.toContain("ACME SAFETY");
  });
});

describe("the engine returns cards for cited records", () => {
  const Claim = z.object({ text: z.string(), sources: z.array(z.string()) });
  const feature = defineAiFeature({
    id: "test-account-facts",
    version: 1,
    roles: ["user", "manager", "senior", "lead"],
    tier: "fast",
    input: z.object({ accountId: z.string() }),
    output: z.object({ points: z.array(Claim) }),
    facts: accountFacts,
    task: () => "TASK\nSummarise this account.",
    temperature: 0.1,
    maxOutputTokens: 400,
  });

  beforeAll(async () => {
    process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
    process.env.OPENAI_MODEL = "stand-in-model";
    await (await collection("tenants")).updateOne({ _id: "northwind" }, { $addToSet: { "ai.features": "test-account-facts" } });
  });
  afterAll(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });
  beforeEach(() => standIn.reset());

  it("in the order cited, only for real handles", async () => {
    signInAs(USERS.northwind.rep);
    standIn.reply({
      points: [
        { text: "Renewal in three weeks", sources: ["K1", "T99"] },
        { text: "A delivery complaint is overdue", sources: ["T1", "K1"] },
        { text: "Invented", sources: ["X9"] },
      ],
    });
    const result = await runAiFeature(feature, { accountId: ACME });
    expect(result).toMatchObject({ ok: true, outcome: "repaired", sources: ["K1", "T1"] });
    if (!result.ok) throw new Error("expected ok");
    expect(result.cards.map((c) => [c.kind, c.handle])).toEqual([
      ["contract", "K1"],
      ["task", "T1"],
    ]);
    expect(result.cards[0]).toMatchObject({ name: "National Safety Program", href: `/contracts?account=${encodeURIComponent(ACME)}` });
  });

  it("says not found for an account outside the user's scope, without calling the model or logging a call", async () => {
    signInAs(USERS.northwind.rep);
    const before = await (await collection("aiInvocations")).countDocuments({ userId: USERS.northwind.rep });
    expect(await runAiFeature(feature, { accountId: NORTHERN })).toEqual({ ok: false, reason: "not_found", message: "That record isn't available." });
    expect(await runAiFeature(feature, { accountId: HARBOR_ACME })).toMatchObject({ ok: false, reason: "not_found" });
    expect(standIn.sent).toHaveLength(0);
    expect(await (await collection("aiInvocations")).countDocuments({ userId: USERS.northwind.rep })).toBe(before);
  });
});

// Last: these add records to ACME, which the tests above count.
describe("caps on a busy account", () => {
  beforeAll(async () => {
    const copies = async <T extends { _id: string }>(name: "tasks" | "visits" | "interactions" | "contacts", filter: Record<string, unknown>, n: number, edit: (doc: T, i: number) => Partial<T> & Record<string, unknown>) => {
      const coll = (await collection(name)) as unknown as { findOne: (f: object) => Promise<T | null>; insertMany: (d: T[]) => Promise<unknown> };
      const template = (await coll.findOne(filter))!;
      await coll.insertMany(Array.from({ length: n }, (_, i) => ({ ...template, _id: `${template._id}-copy${i}`, ...edit(template, i) })));
    };
    const day = 86_400_000;
    await copies<{ _id: string; title: string; dueAt: Date }>("tasks", { accountId: ACME, status: "open" }, 15, (_, i) => ({ title: `Extra task ${i}`, dueAt: new Date(Date.now() - (i + 2) * day) }));
    await copies<{ _id: string; status: string; scheduledAt: Date }>("visits", { accountId: ACME, status: "planned" }, 5, (_, i) => ({ scheduledAt: new Date(Date.now() + (i + 40) * day) }));
    await copies<{ _id: string; status: string; scheduledAt: Date; report: unknown }>("visits", { tenantId: "northwind", status: "completed", report: { $ne: null } }, 5, (_, i) => ({
      accountId: ACME,
      scheduledAt: new Date(Date.now() - (i + 1) * day),
    }));
    await copies<{ _id: string; summary: string; occurredAt: Date }>("interactions", { accountId: ACME }, 8, (_, i) => ({
      summary: i === 0 ? `Long note ${"lots of detail ".repeat(100)}` : `Extra note ${i}`,
      occurredAt: new Date(Date.now() - i * 60_000),
    }));
    await copies<{ _id: string; firstName: string; active: boolean; email: string }>("contacts", { accountId: ACME, active: true }, 10, (_, i) => ({ firstName: `Extra${i}`, email: `extra${i}@acme.example` }));
  });

  it("hold for account facts, with full counts", async () => {
    signInAs(USERS.northwind.rep);
    const p = await facts(ACME);
    const visits = data(p).visits as unknown as { planned: Fact[]; recent: Fact[] };
    expect(list(p, "tasks")).toHaveLength(ACCOUNT_CAPS.tasks);
    expect(visits.planned).toHaveLength(ACCOUNT_CAPS.plannedVisits);
    expect(visits.recent).toHaveLength(ACCOUNT_CAPS.recentVisits);
    expect(list(p, "interactions")).toHaveLength(ACCOUNT_CAPS.interactions);
    expect(list(p, "contacts")).toHaveLength(ACCOUNT_CAPS.contacts);
    expect(data(p).counts).toMatchObject({ openTasks: 17, overdueTasks: 16, activeContacts: 13 });

    // Completed visits carry their scorecard, fenced.
    expect(visits.recent[0]).toMatchObject({ status: "Completed", sentiment: expect.any(String), ratings: expect.stringMatching(/^Relationship \d\/5, commercial \d\/5, service \d\/5$/) });
    expect(visits.recent[0]!.keyPoints).toMatch(FENCED);

    // The long note is fenced and cut.
    const long = list(p, "interactions").find((i) => (i.summary as string).includes("Long note"))!;
    expect((long.summary as string).length).toBeLessThanOrEqual(300 + "<untrusted></untrusted>".length);
    expect(long.summary as string).toMatch(/…<\/untrusted>$/);
  });

  it("hold for my day, with full counts", async () => {
    signInAs(USERS.northwind.rep);
    const p = await myDayFacts(await getScope());
    expect(list(p, "overdueTasks")).toHaveLength(MY_DAY_CAPS.overdueTasks);
    expect(data(p).counts).toMatchObject({ overdueTasks: 16 });
    expect(renderFacts(p)).not.toContain("acme.example");
  });
});
