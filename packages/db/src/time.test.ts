import { describe, expect, it } from "vitest";

import {
  addDays,
  calendarDaysBetween,
  fromIsoDay,
  isValidTimeZone,
  isoDayIn,
  offsetMinutes,
  startOfDay,
  startOfWeek,
  zonedParts,
} from "./time";

const SYD = "Australia/Sydney";
const AKL = "Pacific/Auckland";
const utc = (iso: string) => new Date(iso);

describe("zone offsets", () => {
  it("knows daylight saving in both tenants' zones", () => {
    expect(offsetMinutes(utc("2026-07-01T00:00:00Z"), SYD)).toBe(600); // AEST
    expect(offsetMinutes(utc("2026-10-19T00:00:00Z"), SYD)).toBe(660); // AEDT
    expect(offsetMinutes(utc("2026-07-01T00:00:00Z"), AKL)).toBe(720); // NZST
    expect(offsetMinutes(utc("2026-10-19T00:00:00Z"), AKL)).toBe(780); // NZDT
  });

  it("reads the local wall clock", () => {
    expect(zonedParts(utc("2026-10-19T05:00:00Z"), SYD)).toMatchObject({ year: 2026, month: 10, day: 19, hour: 16, weekday: 0 });
  });
});

describe("start of day", () => {
  it("is local midnight, not UTC midnight", () => {
    // 16:00 Monday in Sydney → midnight Monday Sydney = 13:00 Sunday UTC
    expect(startOfDay(utc("2026-10-19T05:00:00Z"), SYD).toISOString()).toBe("2026-10-18T13:00:00.000Z");
    // The same instant is 18:00 Monday in Auckland → midnight Monday Auckland = 11:00 Sunday UTC
    expect(startOfDay(utc("2026-10-19T05:00:00Z"), AKL).toISOString()).toBe("2026-10-18T11:00:00.000Z");
  });

  it("puts one instant on different calendar days in different zones", () => {
    const lateUtc = utc("2026-10-19T12:30:00Z"); // 23:30 Mon in Sydney, 01:30 Tue in Auckland
    expect(isoDayIn(lateUtc, SYD)).toBe("2026-10-19");
    expect(isoDayIn(lateUtc, AKL)).toBe("2026-10-20");
  });
});

describe("calendar arithmetic across daylight saving", () => {
  it("keeps the wall-clock time when a day is 23 hours long", () => {
    // Sydney clocks went forward on Sun 4 Oct 2026, 02:00 → 03:00
    const satNoon = fromIsoDay("2026-10-03", SYD, 12);
    const sunNoon = addDays(satNoon, 1, SYD);
    expect(isoDayIn(sunNoon, SYD)).toBe("2026-10-04");
    expect(zonedParts(sunNoon, SYD).hour).toBe(12);
    expect(sunNoon.getTime() - satNoon.getTime()).toBe(23 * 3_600_000);
  });

  it("lands just after a skipped hour", () => {
    expect(zonedParts(fromIsoDay("2026-10-04", SYD, 2, 30), SYD).hour).toBe(3);
  });

  it("counts calendar days, not 24-hour blocks", () => {
    expect(calendarDaysBetween(utc("2026-10-18T13:30:00Z"), utc("2026-10-19T12:00:00Z"), SYD)).toBe(0); // same Sydney day
    expect(calendarDaysBetween(fromIsoDay("2026-10-03", SYD, 23), fromIsoDay("2026-10-05", SYD, 1), SYD)).toBe(2);
  });

  it("rolls day overflow into the next month", () => {
    expect(isoDayIn(addDays(fromIsoDay("2026-10-30", AKL, 9), 3, AKL), AKL)).toBe("2026-11-02");
  });
});

describe("weeks and validation", () => {
  it("starts weeks on Monday in the tenant's zone", () => {
    expect(isoDayIn(startOfWeek(fromIsoDay("2026-10-25", SYD, 10), SYD), SYD)).toBe("2026-10-19"); // Sunday → Monday before
    expect(isoDayIn(startOfWeek(fromIsoDay("2026-10-19", AKL, 0, 5), AKL), AKL)).toBe("2026-10-19");
  });

  it("recognises real zones only", () => {
    expect(isValidTimeZone(SYD)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});
