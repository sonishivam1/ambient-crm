import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { addDays } from "@ambient/db/time";

import { notOnRecord } from "../facts/gaps";
import { ACCOUNT_SUMMARY_TASK, ACCOUNT_SUMMARY_VERSION } from "../prompts/account-summary";

import { SUMMARY_LIMITS, accountSummary, cleanText, limitSummary, type AccountSummary } from "./account-summary";

const point = (section: "status" | "attention" | "activity", text: string, sources = ["A1"]) => ({ section, text, sources });

describe("account summary limits", () => {
  it("strips markup, markdown and handles printed in brackets, but not other brackets", () => {
    expect(cleanText("**Overdue** task <b>now</b> (T1)")).toBe("Overdue task now");
    expect(cleanText("Renewal soon [K1, T2] and a visit (V3).")).toBe("Renewal soon and a visit.");
    expect(cleanText("Confirm the roll-out (Q4) with the buyer")).toBe("Confirm the roll-out (Q4) with the buyer");
  });

  it("cuts long text to 240 characters", () => {
    const text = cleanText("very long words ".repeat(40));
    expect(text.length).toBeLessThanOrEqual(SUMMARY_LIMITS.textChars);
    expect(text.endsWith("…")).toBe(true);
  });

  it("keeps at most 7 points, in section order, and drops empty ones", () => {
    const s: AccountSummary = {
      points: [
        point("activity", "a1"),
        point("status", "s1"),
        point("attention", "t1"),
        point("activity", "a2"),
        point("status", "<i></i>"),
        ...Array.from({ length: 6 }, (_, i) => point("attention", `t${i + 2}`)),
      ],
      nextStep: { text: "Call them (T1)", sources: ["T1"] },
    };
    const limited = limitSummary(s);
    expect(limited.points.map((p) => p.text)).toEqual(["s1", "t1", "t2", "t3", "t4", "t5", "t6"]);
    expect(limited.nextStep).toEqual({ text: "Call them", sources: ["T1"] });
    expect(limitSummary({ points: [], nextStep: { text: " ** ", sources: ["T1"] } }).nextStep).toBeNull();
  });

  it("is defined with the agreed settings", () => {
    expect(accountSummary).toMatchObject({ id: "account-summary", version: 1, tier: "fast", temperature: 0.2, maxOutputTokens: 700 });
    expect(accountSummary.roles).toEqual(["user", "manager", "senior", "lead"]);
    expect(accountSummary.cache).toMatchObject({ ttlDays: 7 });
    expect(accountSummary.cache?.subject({ accountId: "x" })).toBe("x");
  });
});

describe("account summary prompt", () => {
  it("matches docs/architecture/ai-prompts.md word for word", () => {
    const doc = readFileSync(fileURLToPath(new URL("../../../../../docs/architecture/ai-prompts.md", import.meta.url)), "utf8");
    expect(doc).toContain("## Account summary (`account-summary` v1");
    expect(doc).toContain(ACCOUNT_SUMMARY_TASK);
    expect(ACCOUNT_SUMMARY_VERSION).toBe(1);
  });

  it("keeps the rules verification relies on", () => {
    for (const rule of ["at least one source", "set nextStep to null", "never contradict it"]) expect(ACCOUNT_SUMMARY_TASK).toContain(rule);
  });
});

describe("not on record", () => {
  // Local midnight, 20 Oct 2026, Sydney.
  const today = new Date("2026-10-19T13:00:00Z");
  // Calendar days back: 90 days before 20 Oct crosses the 4 Oct daylight-saving change.
  const days = (n: number) => addDays(today, -n, "Australia/Sydney");
  const full = {
    openTasks: 2,
    plannedVisits: 1,
    lastCompletedVisit: days(10),
    lastInteraction: days(2),
    activeContacts: 3,
    contracts: 1,
    today,
    timeZone: "Australia/Sydney",
  };

  it("is empty when the record is complete", () => {
    expect(notOnRecord(full)).toEqual([]);
  });

  it("names each thing that's missing, in a fixed order", () => {
    expect(notOnRecord({ ...full, openTasks: 0, plannedVisits: 0, lastCompletedVisit: null, lastInteraction: null, activeContacts: 0, contracts: 0 })).toEqual([
      "No visit planned",
      "No completed visit in the last 90 days",
      "No call, meeting or note logged in the last 30 days",
      "No open tasks",
      "No active contacts",
      "No active contract",
    ]);
  });

  it("counts days on the tenant's calendar", () => {
    expect(notOnRecord({ ...full, lastCompletedVisit: days(90) })).toEqual([]);
    // 90 × 24 hours back is an hour before that local midnight, so already outside.
    expect(notOnRecord({ ...full, lastCompletedVisit: new Date(today.getTime() - 90 * 86_400_000) })).toEqual(["No completed visit in the last 90 days"]);
    expect(notOnRecord({ ...full, lastCompletedVisit: days(91) })).toEqual(["No completed visit in the last 90 days"]);
    expect(notOnRecord({ ...full, lastInteraction: days(31) })).toEqual(["No call, meeting or note logged in the last 30 days"]);
  });
});
