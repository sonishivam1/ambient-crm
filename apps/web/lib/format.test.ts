import { describe, expect, it } from "vitest";

import { initials, isoDay, money, mondayOf, relativeDay, signedMoney, timeAgo } from "./format";

describe("money", () => {
  it("abbreviates thousands and millions", () => {
    expect(money(539_000)).toBe("$539K");
    expect(money(4_200_000)).toBe("$4.2M");
    expect(money(812)).toBe("$812");
  });
  it("shows a dash for missing values", () => {
    expect(money(null)).toBe("—");
    expect(money(undefined)).toBe("—");
  });
  it("signs differences", () => {
    expect(signedMoney(40_000)).toBe("+$40K");
    expect(signedMoney(-20_700_000)).toBe("−$20.7M");
  });
});

describe("dates", () => {
  const now = new Date(2026, 9, 19, 15, 0); // Mon 19 Oct 2026, 3pm local

  it("formats a local calendar day", () => {
    expect(isoDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("finds the Monday of the week", () => {
    expect(isoDay(mondayOf(new Date(2026, 9, 25)))).toBe("2026-10-19"); // Sunday → previous Monday
    expect(isoDay(mondayOf(now))).toBe("2026-10-19");
  });

  it("describes days relative to today by calendar day, not 24-hour blocks", () => {
    expect(relativeDay(new Date(2026, 9, 19, 1), now)).toBe("today");
    expect(relativeDay(new Date(2026, 9, 18, 23), now)).toBe("yesterday");
    expect(relativeDay(new Date(2026, 9, 20, 0, 1), now)).toBe("tomorrow");
    expect(relativeDay(new Date(2026, 9, 14), now)).toBe("5 days ago");
    expect(relativeDay(new Date(2026, 9, 29), now)).toBe("in 10 days");
  });

  it("gives short elapsed times", () => {
    expect(timeAgo(new Date(now.getTime() - 30_000), now)).toBe("just now");
    expect(timeAgo(new Date(now.getTime() - 12 * 60_000), now)).toBe("12m");
    expect(timeAgo(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("3h");
    expect(timeAgo(new Date(now.getTime() - 2 * 86_400_000), now)).toBe("2d");
  });
});

describe("initials", () => {
  it("takes up to two initials", () => {
    expect(initials("Priya Nair")).toBe("PN");
    expect(initials("ACME SAFETY – GEELONG")).toBe("AS");
    expect(initials("Wren")).toBe("W");
  });
});
