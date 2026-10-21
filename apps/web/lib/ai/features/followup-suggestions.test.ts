import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FOLLOWUP_TASK, FOLLOWUP_VERSION } from "../prompts/followup-suggestions";
import { isGenericTitle } from "../tools/propose";

import { followupSuggestions, limitFollowUps } from "./followup-suggestions";

const s = (title: string, dueInDays = 7) => ({ title, dueInDays, priority: "normal" as const, reason: "From the report.", sources: ["V1"] });

describe("follow-up suggestions", () => {
  it("keep at most 3, drop generic titles, and keep days whole and between 0 and 30", () => {
    const limited = limitFollowUps({
      suggestions: [s("Follow up"), s("Send the **updated** quote (V1)", 2.6), s("Confirm delivery dates", 45), s("Book the fitting day", -3), s("Call the buyer back", 1)],
    });
    expect(limited.suggestions.map((x) => [x.title, x.dueInDays])).toEqual([
      ["Send the updated quote", 3],
      ["Confirm delivery dates", 30],
      ["Book the fitting day", 0],
    ]);
  });

  it("are defined with the agreed settings", () => {
    expect(followupSuggestions).toMatchObject({ id: "followup-suggestions", version: 1, tier: "fast", maxOutputTokens: 500 });
    expect(followupSuggestions.cache).toBeUndefined();
  });

  it("use the prompt in docs/architecture/ai-prompts.md word for word", () => {
    const doc = readFileSync(fileURLToPath(new URL("../../../../../docs/architecture/ai-prompts.md", import.meta.url)), "utf8");
    expect(doc).toContain("## Follow-up suggestions (`followup-suggestions` v1");
    expect(doc).toContain(FOLLOWUP_TASK);
    expect(FOLLOWUP_VERSION).toBe(1);
  });
});

describe("generic titles", () => {
  it("are the ones that say nothing about what to do", () => {
    for (const t of ["Follow up", "follow-up", "Call", "Task", "Check in", "Reminder!"]) expect(isGenericTitle(t)).toBe(true);
    for (const t of ["Send the updated quote", "Call Hannah about pallets", "Book the fitting day"]) expect(isGenericTitle(t)).toBe(false);
  });
});
