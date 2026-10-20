import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MORNING_BRIEF_TASK, MORNING_BRIEF_VERSION } from "../prompts/morning-brief";

import { QUIET_HEADLINE, briefHeadline, limitBrief, morningBrief, type MorningBrief } from "./morning-brief";

const none = { overdueTasks: 0, visitsToday: 0, tasksDueToday: 0, renewalsWithin30Days: 0, unreadNotifications: 0, quietAccounts: 0 };

describe("morning brief headline", () => {
  it("counts every kind, most urgent first, leaving zeros out", () => {
    expect(briefHeadline({ overdueTasks: 2, visitsToday: 1, tasksDueToday: 3, renewalsWithin30Days: 1, unreadNotifications: 4, quietAccounts: 5 })).toBe(
      "2 overdue tasks · 1 visit today · 3 tasks due today · 1 renewal within 30 days · 4 unread notifications · 5 quiet accounts",
    );
    expect(briefHeadline({ ...none, overdueTasks: 1, quietAccounts: 1 })).toBe("1 overdue task · 1 quiet account");
    expect(briefHeadline({ ...none, visitsToday: 2, renewalsWithin30Days: 2, unreadNotifications: 1 })).toBe(
      "2 visits today · 2 renewals within 30 days · 1 unread notification",
    );
  });

  it("says so on a quiet day", () => {
    expect(briefHeadline(none)).toBe(QUIET_HEADLINE);
  });
});

describe("morning brief limits", () => {
  const item = (kind: MorningBrief["items"][number]["kind"], priority: MorningBrief["items"][number]["priority"], text: string) => ({ kind, priority, text, sources: ["T1"] });

  it("keeps at most 6 items, by urgency of kind then priority, cleaned", () => {
    const limited = limitBrief({
      items: [
        item("quiet_account", "high", "q"),
        item("renewal", "low", "r-low"),
        item("overdue_task", "normal", "o-normal"),
        item("renewal", "high", "r-high"),
        item("alert", "normal", "a"),
        item("overdue_task", "high", "o-high **now** (T1)"),
        item("visit_today", "normal", "v"),
        item("task_due", "low", "<b></b>"),
      ],
    });
    expect(limited.items.map((i) => i.text)).toEqual(["o-high now", "o-normal", "v", "r-high", "r-low", "a"]);
  });

  it("cuts item text to 160 characters", () => {
    const [only] = limitBrief({ items: [item("alert", "low", "word ".repeat(80))] }).items;
    expect(only!.text.length).toBeLessThanOrEqual(160);
  });

  it("is defined with the agreed settings", () => {
    expect(morningBrief).toMatchObject({ id: "morning-brief", version: 1, tier: "fast", temperature: 0.2, maxOutputTokens: 600 });
    expect(morningBrief.roles).toEqual(["user", "manager", "senior", "lead"]);
    expect(morningBrief.cache).toMatchObject({ mode: "day" });
  });
});

describe("morning brief prompt", () => {
  it("matches docs/architecture/ai-prompts.md word for word", () => {
    const doc = readFileSync(fileURLToPath(new URL("../../../../../docs/architecture/ai-prompts.md", import.meta.url)), "utf8");
    expect(doc).toContain("## Morning brief (`morning-brief` v1");
    expect(doc).toContain(MORNING_BRIEF_TASK);
    expect(MORNING_BRIEF_VERSION).toBe(1);
  });

  it("names every kind the output allows, and asks for no headline", () => {
    for (const kind of ["overdue_task", "visit_today", "task_due", "renewal", "alert", "quiet_account"]) expect(MORNING_BRIEF_TASK).toContain(kind);
    expect(MORNING_BRIEF_TASK).not.toMatch(/headline/i);
  });
});
