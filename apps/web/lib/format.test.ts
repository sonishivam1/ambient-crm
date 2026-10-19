import { describe, expect, it } from "vitest";

import { fmtDate, fmtLongDay, fmtTime, greeting, initials, isoDay, isoTime, money, relativeDay, signedMoney, timeAgo } from "./format";

const SYD = "Australia/Sydney";
const AKL = "Pacific/Auckland";

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

describe("dates on the tenant's calendar", () => {
  // 23:30 Monday in Sydney is already 01:30 Tuesday in Auckland.
  const instant = new Date("2026-10-19T12:30:00Z");

  it("formats the same instant as each tenant's local day", () => {
    expect(isoDay(instant, SYD)).toBe("2026-10-19");
    expect(isoDay(instant, AKL)).toBe("2026-10-20");
    expect(fmtDate(instant, SYD)).toBe("19 Oct 2026");
    expect(fmtLongDay(instant, AKL)).toBe("Tuesday 20 October");
  });

  it("shows times on the tenant's clock", () => {
    const at = new Date("2026-10-19T22:30:00Z"); // 09:30 Tue Sydney, 11:30 Tue Auckland
    expect(isoTime(at, SYD)).toBe("09:30");
    expect(isoTime(at, AKL)).toBe("11:30");
    expect(fmtTime(at, SYD).replace(/\s/g, " ")).toMatch(/^9:30 am$/i);
  });

  it("greets by the tenant's clock, not the server's", () => {
    const sydMorning = new Date("2026-10-18T21:00:00Z"); // 08:00 Mon Sydney
    expect(greeting(sydMorning, SYD)).toBe("Good morning");
    expect(greeting(new Date("2026-10-19T05:00:00Z"), SYD)).toBe("Good afternoon"); // 16:00
    expect(greeting(new Date("2026-10-19T07:30:00Z"), SYD)).toBe("Good evening"); // 18:30
  });

  it("describes days relative to today by calendar day, not 24-hour blocks", () => {
    const now = new Date("2026-10-19T04:00:00Z"); // 15:00 Mon Sydney
    expect(relativeDay(new Date("2026-10-18T14:00:00Z"), now, SYD)).toBe("today"); // 01:00 Mon
    expect(relativeDay(new Date("2026-10-18T12:00:00Z"), now, SYD)).toBe("yesterday"); // 23:00 Sun
    expect(relativeDay(new Date("2026-10-19T13:01:00Z"), now, SYD)).toBe("tomorrow"); // 00:01 Tue
    expect(relativeDay(new Date("2026-10-14T03:00:00Z"), now, SYD)).toBe("5 days ago");
    expect(relativeDay(new Date("2026-10-29T03:00:00Z"), now, SYD)).toBe("in 10 days");
  });

  it("gives short elapsed times", () => {
    const now = new Date("2026-10-19T04:00:00Z");
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
