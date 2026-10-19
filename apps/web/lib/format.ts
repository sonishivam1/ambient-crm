import { calendarDaysBetween, isoDayIn, zonedParts } from "@ambient/db/time";

const LOCALE = "en-AU";

export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

export function signedMoney(n: number): string {
  return `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
}

export const num = (n: number) => n.toLocaleString(LOCALE);

/*
 * Every date formatter takes the tenant's time zone. There is deliberately no
 * default: the server's zone is never the right calendar for a customer.
 */
export const fmtDate = (d: Date, timeZone: string) => d.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone });
export const fmtDay = (d: Date, timeZone: string) => d.toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone });
export const fmtWeekday = (d: Date, timeZone: string) => d.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", timeZone });
export const fmtLongDay = (d: Date, timeZone: string) => d.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone });

/** yyyy-mm-dd on the tenant's calendar, used as a stable key for calendar days. */
export const isoDay = (d: Date, timeZone: string) => isoDayIn(d, timeZone);

export function timeAgo(from: Date, now = new Date()): string {
  const m = Math.floor((now.getTime() - from.getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/** Good morning / afternoon / evening, by the clock in the tenant's zone. */
export function greeting(now: Date, timeZone: string): string {
  const h = zonedParts(now, timeZone).hour;
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** "today", "yesterday", "in 3 days", "5 days ago": whole days on the tenant's calendar. */
export function relativeDay(d: Date, now: Date, timeZone: string): string {
  const diff = calendarDaysBetween(now, d, timeZone);
  if (diff === 0) return "today";
  if (diff === -1) return "yesterday";
  if (diff === 1) return "tomorrow";
  return diff < 0 ? `${-diff} days ago` : `in ${diff} days`;
}
