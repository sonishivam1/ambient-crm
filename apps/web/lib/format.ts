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

export const fmtDate = (d: Date) => d.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });
export const fmtDay = (d: Date) => d.toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
export const fmtWeekday = (d: Date) => d.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric" });
export const fmtLongDay = (d: Date) => d.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });

/** yyyy-mm-dd in local time, used as a stable key for calendar days. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}

export function timeAgo(from: Date, now = new Date()): string {
  const m = Math.round((now.getTime() - from.getTime()) / 60_000);
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

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** "today", "yesterday", "in 3 days", "5 days ago" — whole calendar days. */
export function relativeDay(d: Date, now = new Date()): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === -1) return "yesterday";
  if (diff === 1) return "tomorrow";
  return diff < 0 ? `${-diff} days ago` : `in ${diff} days`;
}
