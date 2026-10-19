import { describe, expect, it } from "vitest";

import { completeVisitInput, createVisitInput, parseTime } from "./visits";

const issue = (schema: { safeParse: (v: unknown) => { error?: { issues: { message: string }[] } } }, input: object) =>
  schema.safeParse(input).error?.issues[0]?.message;

describe("visit input", () => {
  const base = { accountId: "northwind:CO-ACME-BT1", date: "2026-10-22", type: "site" };

  it("defaults the time to 9 am and trims the purpose", () => {
    expect(createVisitInput.parse({ ...base, purpose: "  Range review " })).toMatchObject({ time: "09:00", purpose: "Range review" });
    expect(parseTime("14:45")).toEqual([14, 45]);
  });

  it("explains what's missing or wrong", () => {
    expect(issue(createVisitInput, { ...base, date: "22/10/2026" })).toBe("Choose a date.");
    expect(issue(createVisitInput, { ...base, time: "25:00" })).toBe("Choose a time.");
    expect(issue(createVisitInput, { ...base, type: "lunch" })).toBe("Choose a visit type.");
    expect(issue(createVisitInput, { ...base, purpose: "x".repeat(501) })).toBe("Keep the purpose under 500 characters.");
  });
});

describe("post-visit report input", () => {
  const card = { id: "northwind:v1", sentiment: "positive", relationship: 4, commercial: 3, service: 5 };

  it("takes a sentiment and three ratings from 1 to 5", () => {
    expect(completeVisitInput.parse(card)).toMatchObject({ ...card, keyPoints: "", followUps: "" });
  });

  it("names the rating that's out of range or missing", () => {
    expect(issue(completeVisitInput, { ...card, sentiment: "great" })).toBe("Choose how it went.");
    expect(issue(completeVisitInput, { ...card, relationship: 0 })).toBe("Rate the relationship from 1 to 5.");
    expect(issue(completeVisitInput, { ...card, commercial: 6 })).toBe("Rate the commercial outlook from 1 to 5.");
    expect(issue(completeVisitInput, { ...card, service: 2.5 })).toBe("Rate the service from 1 to 5.");
    expect(issue(completeVisitInput, { ...card, service: undefined })).toBe("Rate the service from 1 to 5.");
  });
});
