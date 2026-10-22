/** Calendar days in the demo tenants' zone, as the date inputs take them (YYYY-MM-DD). */
const ZONE = "Australia/Sydney";

export function isoDayFromToday(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** A short unique suffix, so records a test creates never clash with another test's. */
export function unique(): string {
  return Math.random().toString(36).slice(2, 7);
}
