import { describe, expect, it } from "vitest";

import { factsBuilder } from "@/lib/ai/facts";
import { chatSuggestions } from "@/lib/ai/suggestions";
import type { ToolContext, ToolResult } from "@/lib/ai/tools/define";
import { findContacts, getAccount, listRenewals, listTasks, listVisits } from "@/lib/ai/tools/read";
import { getScope } from "@/lib/data/scope";

import { USERS, signInAs } from "../support/session";

type Ok = Extract<ToolResult, { ok: true }>;
type Fact = Record<string, unknown> & { handle: string };

async function ctxFor(user: string): Promise<ToolContext> {
  signInAs(user);
  const scope = await getScope();
  return { scope, f: factsBuilder(), team: scope.user.capabilities.manager || scope.reps.all };
}
const ok = (r: ToolResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}: ${r.ask}`);
  return r as Ok;
};
const list = (r: ToolResult, key: string) => ok(r)[key] as Fact[];

describe("Wren's read tools", () => {
  it("list a rep's own tasks, with totals", async () => {
    const ctx = await ctxFor(USERS.northwind.rep);
    const overdue = await listTasks.run(ctx, { status: "overdue", accountName: null });
    expect(list(overdue, "tasks").map((t) => [t.title, t.account])).toEqual([["<untrusted>Follow up on delivery delay complaint</untrusted>", "ACME SAFETY"]]);
    expect(ok(overdue).total).toBe(1);
    expect(list(overdue, "tasks")[0]).not.toHaveProperty("owner");

    const today = await listTasks.run(ctx, { status: "due_today", accountName: null });
    expect(list(today, "tasks").map((t) => t.title)).toEqual(["<untrusted>Send updated hi-vis range and price list</untrusted>"]);

    const onAcme = await listTasks.run(ctx, { status: "open", accountName: "ACME SAFETY" });
    expect(ok(onAcme).account).toBe("ACME SAFETY");
    expect(list(onAcme, "tasks").map((t) => t.title)).toEqual([
      "<untrusted>Follow up on delivery delay complaint</untrusted>",
      "<untrusted>Schedule executive check-in</untrusted>",
    ]);
  });

  it("show a manager whose each task is", async () => {
    const ctx = await ctxFor(USERS.northwind.manager);
    const overdue = list(await listTasks.run(ctx, { status: "overdue", accountName: null }), "tasks");
    expect(overdue.map((t) => t.owner).sort()).toEqual(["Jordan Reyes", "Priya Nair"]);
  });

  it("match account names only among the user's own, and ask when a name is ambiguous", async () => {
    const ctx = await ctxFor(USERS.northwind.rep);
    expect(ok(await getAccount.run(ctx, { name: "acme safety" })).account).toMatchObject({ name: "ACME SAFETY", type: "Bill-to" });
    // Grace's account and another tenant's: simply not found, by the name match itself.
    expect(await getAccount.run(ctx, { name: "Northern Industrial" })).toMatchObject({ ok: false, reason: "not_found", ask: expect.stringContaining("among yours") });
    expect(await getAccount.run(ctx, { name: "ACME ELECTRICAL NZ" })).toMatchObject({ ok: false, reason: "not_found", ask: expect.stringContaining("among yours") });
    // A name matching only other reps' accounts never lists them back.
    const industrial = await getAccount.run(ctx, { name: "industrial" });
    expect(industrial).toMatchObject({ ok: false, reason: "not_found" });
    expect(JSON.stringify(industrial)).not.toMatch(/NORTHERN|CASTLEFORD/);
    const vague = await getAccount.run(ctx, { name: "acme" });
    expect(vague).toMatchObject({ ok: false, reason: "ambiguous" });
    expect(!vague.ok && vague.ask).toMatch(/^Which one do you mean: ACME SAFETY, /);

    const manager = await ctxFor(USERS.northwind.manager);
    expect(ok(await getAccount.run(manager, { name: "ACME SAFETY" })).account).toMatchObject({ owner: "Priya Nair" });
  });

  it("list visits in a range, and renewals within a window", async () => {
    const ctx = await ctxFor(USERS.northwind.rep);
    const next = await listVisits.run(ctx, { range: "next_14_days", accountName: null });
    expect(list(next, "visits").map((v) => v.account)).toEqual(["HARROW HARDWARE GROUP"]);
    const past = await listVisits.run(ctx, { range: "past_30_days", accountName: null });
    expect(list(past, "visits").map((v) => [v.account, v.status])).toEqual([
      ["ACME SAFETY", "Planned, day passed, not closed"],
      ["HARROW HARDWARE GROUP", "Completed"],
    ]);

    const renewals = await listRenewals.run(ctx, { withinDays: "30" });
    expect(list(renewals, "contracts").map((k) => [k.name, k.daysLeft])).toEqual([["National Safety Program", 21]]);
    expect(ok(renewals).total).toBe(1);
  });

  it("find contacts by account and role, with no email or phone in the facts", async () => {
    const ctx = await ctxFor(USERS.northwind.rep);
    const buyers = await findContacts.run(ctx, { accountName: "ACME SAFETY", role: "buyer", query: null });
    expect(list(buyers, "contacts")).toEqual([{ handle: "C1", name: "Hannah Brooks", title: "Procurement Manager", roles: ["Buyer"] }]);
    expect(JSON.stringify(ok(buyers))).not.toMatch(/@|0491/);
    // The card, which only the user sees, can show them.
    const packet = ctx.f.build({ buyers });
    expect(packet.cards.get("C1")).toMatchObject({ email: "hannah.brooks@acme.example", phone: expect.stringMatching(/^0491/) });

    expect(await findContacts.run(ctx, { accountName: null, role: "CEO", query: null })).toMatchObject({ ok: false, reason: "invalid", ask: expect.stringContaining("Buyer, Finance") });
  });

  it("suggest a question about the user's own largest account", async () => {
    const rep = await ctxFor(USERS.northwind.rep);
    expect(await chatSuggestions(rep.scope)).toEqual([
      "Summarise Harrow Hardware Group",
      "What needs attention today?",
      "Show upcoming renewals",
      "What's overdue?",
      "My visits this week",
    ]);
    // Never another tenant's or another rep's account.
    const harbor = await ctxFor(USERS.harbor.rep);
    expect((await chatSuggestions(harbor.scope))[0]).not.toMatch(/Harrow|Acme Safety/);
  });

  it("share one set of handles across every tool in a question", async () => {
    const ctx = await ctxFor(USERS.northwind.rep);
    const a = await listTasks.run(ctx, { status: "overdue", accountName: null });
    const b = await listRenewals.run(ctx, { withinDays: "30" });
    const c = await listTasks.run(ctx, { status: "due_today", accountName: null });
    expect([list(a, "tasks")[0]!.handle, list(b, "contracts")[0]!.handle, list(c, "tasks")[0]!.handle]).toEqual(["T1", "K1", "T2"]);
    const packet = ctx.f.build({ results: [a, b, c] });
    expect([...packet.handles].sort()).toEqual(["K1", "T1", "T2"]);
    expect(JSON.stringify(packet.data)).not.toContain("northwind:");
  });
});
