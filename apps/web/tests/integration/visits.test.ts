import { describe, expect, it } from "vitest";

import { collection } from "@ambient/db";
import { addDays, fromIsoDay, isoDayIn, zonedParts } from "@ambient/db/time";

import { cancelVisit, completeVisit, createVisit, updateVisit } from "@/app/actions/visits";
import { getAccountProfile } from "@/lib/data/account-profile";
import { callCycleQuerySchema, getCallCycle } from "@/lib/data/visits";

import { USERS, signInAs } from "../support/session";

const SYD = "Australia/Sydney";
const AKL = "Pacific/Auckland";
const sydDay = (n: number) => isoDayIn(addDays(new Date(), n, SYD), SYD);
const query = (params: Record<string, string> = {}) => callCycleQuerySchema.parse(params);

/** Every visit the call cycle shows, from the weeks, the history and the older overdue ones. */
async function allVisits(params: Record<string, string> = {}) {
  const c = await getCallCycle(query(params));
  const rows = [...c.overdue, ...c.weeks.flatMap((w) => w.visits), ...c.history];
  return [...new Map(rows.map((v) => [v.id, v])).values()];
}
async function auditFor(entityId: string) {
  return (await collection("auditLog")).find({ entityId }).sort({ at: 1 }).toArray();
}
const visit = async (id: string) => (await collection("visits")).findOne({ _id: id });

// Priya (r1) has five visits: v1 overdue, v5 and v14/v15 ahead, v18 completed with a report.
describe("call cycle", () => {
  it("shows a rep only their own visits, with their overdue one flagged", async () => {
    signInAs(USERS.northwind.rep);
    const rows = await allVisits();
    expect(rows.map((v) => v.id).sort()).toEqual(["northwind:v1", "northwind:v14", "northwind:v15", "northwind:v18", "northwind:v5"]);
    expect(rows.every((v) => v.repId === "northwind:r1")).toBe(true);
    const cycle = await getCallCycle(query());
    expect(cycle.overdue.map((v) => v.purpose)).toEqual(["Delivery issue walk-through"]);
    expect(cycle.reps).toEqual([]); // no rep filter for reps
  });

  it("gives a manager the team, filterable by a rep in scope only", async () => {
    signInAs(USERS.northwind.manager);
    expect(await allVisits()).toHaveLength(14);
    const vic = await allVisits({ rep: "northwind:r4" });
    expect(vic).toHaveLength(4);
    expect(vic.every((v) => v.rep === "VIC Telesales")).toBe(true);
    // Grace is above Liam: asking for her is ignored, not widened.
    expect(await allVisits({ rep: "northwind:r3" })).toHaveLength(14);
    expect((await getCallCycle(query({ rep: "northwind:r3" }))).rep).toBe("");
  });

  it("applies the division lens and keeps tenants apart", async () => {
    signInAs(USERS.northwind.senior, "wholesale");
    const wholesale = new Set(["HARROW HARDWARE GROUP", "BRIGHTWELL HOME SUPPLY (WA)", "TRADEPOINT WANGARATTA", "KIWI SITE SAFETY LTD", "MARLOWE MENSWEAR", "SENTINEL SAFETY PTY LTD"]);
    const rows = await allVisits();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((v) => wholesale.has(v.account))).toBe(true);

    signInAs(USERS.harbor.rep);
    const harbor = await allVisits();
    expect(harbor.map((v) => v.account).sort()).toEqual(["ACME ELECTRICAL NZ", "BLUEWATER MARINE SUPPLY"]);
  });

  it("starts weeks on Monday at midnight in the tenant's zone and buckets visits inside them", async () => {
    signInAs(USERS.harbor.rep);
    const cycle = await getCallCycle(query());
    expect(cycle.weeks).toHaveLength(6);
    for (const w of cycle.weeks) {
      expect(zonedParts(w.start, AKL)).toMatchObject({ weekday: 0, hour: 0, minute: 0 });
      const end = addDays(w.start, 7, AKL);
      expect(w.visits.every((v) => v.at >= w.start && v.at < end)).toBe(true);
    }
    expect(cycle.timeZone).toBe(AKL);
  });

  it("shows the scorecard's sentiment on the account timeline", async () => {
    signInAs(USERS.northwind.rep);
    const profile = await getAccountProfile("northwind:CG-HARROW-BT1");
    const item = profile!.timeline.find((t) => t.kind === "visit" && t.id === "northwind:v18");
    expect(item?.title).toBe("Site visit completed · Negative");
  });
});

describe("planning visits", () => {
  const base = { accountId: "northwind:SA-DELTA-BT1", type: "site", purpose: "Fitting day" };

  it("plans a visit for yourself at the tenant's local time and audits it", async () => {
    signInAs(USERS.northwind.rep);
    const date = sydDay(3);
    const result = await createVisit({ ...base, date, time: "10:30" });
    expect(result.ok).toBe(true);
    const id = (result as { id: string }).id;
    expect(await visit(id)).toMatchObject({
      tenantId: "northwind",
      repId: "northwind:r1",
      division: "uniforms",
      status: "planned",
      scheduledAt: fromIsoDay(date, SYD, 10, 30),
      createdByUserId: USERS.northwind.rep,
      report: null,
    });
    const [row] = await auditFor(id);
    expect(row).toMatchObject({ action: "visit.create", after: { accountId: base.accountId, repId: "northwind:r1", type: "site" } });
    expect(await (await collection("notifications")).countDocuments({ type: "visit_assigned", accountId: base.accountId })).toBe(0);
  });

  it("allows earlier today but not yesterday", async () => {
    signInAs(USERS.northwind.rep);
    expect((await createVisit({ ...base, date: sydDay(0), time: "00:15" })).ok).toBe(true);
    expect(await createVisit({ ...base, date: sydDay(-1) })).toEqual({ ok: false, error: "Pick today or a later date." });
  });

  it("only lets managers book someone else, inside their scope, and tells that person", async () => {
    signInAs(USERS.northwind.rep);
    expect(await createVisit({ ...base, date: sydDay(2), repId: "northwind:r2" })).toEqual({ ok: false, error: "You can only plan visits for yourself." });

    signInAs(USERS.northwind.manager);
    const booked = await createVisit({ accountId: "northwind:CO-ACME-BT1", type: "meeting", date: sydDay(4), time: "14:00", repId: "northwind:r1" });
    expect(booked.ok).toBe(true);
    expect((await visit((booked as { id: string }).id))?.repId).toBe("northwind:r1");
    const note = await (await collection("notifications")).findOne({ type: "visit_assigned", userId: USERS.northwind.rep });
    expect(note).toMatchObject({ title: "Liam Carter booked you a visit" });
    expect(note!.body).toMatch(/^ACME SAFETY · /);

    expect(await createVisit({ ...base, date: sydDay(2), repId: "northwind:r3" })).toEqual({ ok: false, error: "You can't plan visits for that person." });
  });

  it("asks a user with no rep of their own who is going", async () => {
    signInAs(USERS.northwind.super);
    expect(await createVisit({ ...base, date: sydDay(2) })).toEqual({ ok: false, error: "Choose who is making this visit." });
  });

  it("refuses accounts outside the user's scope or tenant", async () => {
    signInAs(USERS.northwind.rep);
    expect(await createVisit({ ...base, accountId: "northwind:CG-BRIGHTWELL-BT1", date: sydDay(2) })).toEqual({ ok: false, error: "Account not found." });
    signInAs(USERS.harbor.rep);
    expect(await createVisit({ ...base, date: sydDay(2) })).toEqual({ ok: false, error: "Account not found." });
  });
});

describe("rescheduling and cancelling", () => {
  it("reschedules a planned visit, refusing the past, and audits the move", async () => {
    signInAs(USERS.northwind.rep);
    const before = (await visit("northwind:v5"))!;
    expect(await updateVisit({ id: "northwind:v5", date: sydDay(-1), time: "09:00", type: "site", purpose: before.purpose })).toEqual({
      ok: false,
      error: "Pick today or a later date.",
    });
    const date = sydDay(5);
    expect(await updateVisit({ id: "northwind:v5", date, time: "11:00", type: "site", purpose: before.purpose })).toEqual({ ok: true, id: "northwind:v5" });
    expect((await visit("northwind:v5"))!.scheduledAt).toEqual(fromIsoDay(date, SYD, 11, 0));
    const [row] = await auditFor("northwind:v5");
    expect(row).toMatchObject({ action: "visit.reschedule", before: { scheduledAt: before.scheduledAt }, after: { scheduledAt: fromIsoDay(date, SYD, 11, 0) } });
  });

  it("only changes planned visits, and only in scope", async () => {
    signInAs(USERS.northwind.rep);
    const done = { id: "northwind:v18", date: sydDay(2), time: "09:00", type: "site", purpose: "x" };
    expect(await updateVisit(done)).toEqual({ ok: false, error: "Only planned visits can be changed." });
    expect(await updateVisit({ ...done, id: "northwind:v3" })).toEqual({ ok: false, error: "Visit not found." }); // Liam's
    signInAs(USERS.harbor.super);
    expect(await updateVisit({ ...done, id: "northwind:v14" })).toEqual({ ok: false, error: "Visit not found." });
  });

  it("cancels with a reason, drops it from the cycle and audits it", async () => {
    signInAs(USERS.northwind.rep);
    expect(await cancelVisit({ id: "northwind:v15", reason: "Customer moved it to next quarter" })).toEqual({ ok: true, id: "northwind:v15" });
    expect((await allVisits()).map((v) => v.id)).not.toContain("northwind:v15");
    expect((await auditFor("northwind:v15"))[0]).toMatchObject({ action: "visit.cancel", after: { status: "cancelled", reason: "Customer moved it to next quarter" } });
    expect(await cancelVisit({ id: "northwind:v15" })).toEqual({ ok: false, error: "Only planned visits can be cancelled." });
  });
});

describe("completing visits", () => {
  const card = { sentiment: "positive", relationship: 4, commercial: 3, service: 5, keyPoints: "Buyer wants the winter range early", followUps: "Send samples by Friday" };

  it("won't complete a visit before its day", async () => {
    signInAs(USERS.northwind.rep);
    expect(await completeVisit({ id: "northwind:v14", ...card })).toEqual({ ok: false, error: "A visit can be completed on or after its day." });
  });

  it("completes an overdue visit with its scorecard, auditing scores but not the notes", async () => {
    signInAs(USERS.northwind.rep);
    expect(await completeVisit({ id: "northwind:v1", ...card })).toEqual({ ok: true, id: "northwind:v1" });
    const done = (await visit("northwind:v1"))!;
    expect(done).toMatchObject({ status: "completed", report: { sentiment: "positive", relationship: 4, keyPoints: card.keyPoints, capturedByUserId: USERS.northwind.rep } });
    expect(done.completedAt).toBeInstanceOf(Date);

    const [row] = await auditFor("northwind:v1");
    expect(row).toMatchObject({ action: "visit.complete", after: { status: "completed", sentiment: "positive", relationship: 4, commercial: 3, service: 5, hasKeyPoints: true, hasFollowUps: true } });
    expect(JSON.stringify(row)).not.toContain("winter range");
    expect(JSON.stringify(row)).not.toContain("samples");

    expect((await getCallCycle(query())).overdue).toEqual([]);
    expect(await completeVisit({ id: "northwind:v1", ...card })).toEqual({ ok: false, error: "This visit already has a report." });
  });

  it("adds the missing report to a visit already completed", async () => {
    signInAs(USERS.northwind.manager); // Mia's METRO visit, completed without a report
    const before = (await visit("northwind:v19"))!;
    expect(before).toMatchObject({ status: "completed", report: null });
    expect(await completeVisit({ id: "northwind:v19", ...card, sentiment: "neutral" })).toEqual({ ok: true, id: "northwind:v19" });
    const after = (await visit("northwind:v19"))!;
    expect(after.report?.sentiment).toBe("neutral");
    expect(after.completedAt).toEqual(before.completedAt);
    expect((await auditFor("northwind:v19"))[0]?.action).toBe("visit.report");
  });

  it("checks the ratings and keeps other tenants out", async () => {
    signInAs(USERS.northwind.rep);
    expect(await completeVisit({ id: "northwind:v5", ...card, service: 9 })).toEqual({ ok: false, error: "Rate the service from 1 to 5." });
    signInAs(USERS.harbor.super);
    expect(await completeVisit({ id: "northwind:v18", ...card })).toEqual({ ok: false, error: "Visit not found." });
  });
});
