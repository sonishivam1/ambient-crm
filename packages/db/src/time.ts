/**
 * Calendar arithmetic in a tenant's time zone. "Today", "overdue", "this
 * week" and "due on the 24th" all mean the tenant's local calendar, not the
 * server's. Every function takes an IANA zone explicitly; nothing reads the
 * process time zone.
 */

export type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Monday … 6 = Sunday */
  weekday: number;
};

const WEEKDAY: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall-clock reading of `date` in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY[parts.weekday as string] ?? 0,
  };
}

/** Minutes `timeZone` is ahead of UTC at `date` (e.g. +660 for Sydney in summer). */
export function offsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant at which the wall clock in `timeZone` reads the given time.
 * Day and month overflow roll over (day 32 → next month). In a daylight-saving
 * gap the result lands just after the gap.
 */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  // Re-check at the candidate instant, which can sit on the other side of a DST change.
  return new Date(guess - offsetMinutes(new Date(first), timeZone) * 60_000);
}

/** Local midnight at the start of `date`'s day in `timeZone`. */
export function startOfDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return zonedTime(p.year, p.month, p.day, 0, 0, timeZone);
}

/** The same wall-clock time `days` calendar days later (or earlier), across DST changes. */
export function addDays(date: Date, days: number, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return zonedTime(p.year, p.month, p.day + days, p.hour, p.minute, timeZone);
}

/** Local midnight on the Monday of `date`'s week. */
export function startOfWeek(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return zonedTime(p.year, p.month, p.day - p.weekday, 0, 0, timeZone);
}

/** yyyy-mm-dd of `date` on the local calendar in `timeZone`. */
export function isoDayIn(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The instant for a yyyy-mm-dd day at a local time in `timeZone`. */
export function fromIsoDay(iso: string, timeZone: string, hour = 0, minute = 0): Date {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return zonedTime(y, m, d, hour, minute, timeZone);
}

/** Whole calendar days from `from` to `to` in `timeZone` (positive when `to` is later). */
export function calendarDaysBetween(from: Date, to: Date, timeZone: string): number {
  const a = zonedParts(from, timeZone);
  const b = zonedParts(to, timeZone);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** True for a zone the runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
