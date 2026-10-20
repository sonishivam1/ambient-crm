/** Renewal bands, shared by the contracts page, the profile card and their tests. Pure: no database access. */

export const RENEWAL_BANDS = ["expired", "30", "60", "90", "later"] as const;
export type RenewalBand = (typeof RENEWAL_BANDS)[number];

/** Ended contracts stay in the default view for this long, so a lapse isn't missed. */
export const EXPIRED_WINDOW_DAYS = 90;

/** Each band covers whole days left, inclusive: [from, to]. */
export const BAND: Record<RenewalBand, { label: string; tone: "risk" | "warn" | "info" | "out"; from: number; to: number }> = {
  expired: { label: "Expired", tone: "risk", from: -EXPIRED_WINDOW_DAYS, to: -1 },
  "30": { label: "≤ 30 days", tone: "risk", from: 0, to: 30 },
  "60": { label: "31–60 days", tone: "warn", from: 31, to: 60 },
  "90": { label: "61–90 days", tone: "info", from: 61, to: 90 },
  later: { label: "Later", tone: "out", from: 91, to: Number.POSITIVE_INFINITY },
};

/** The band for a contract with `daysLeft` whole days to go (negative once it has ended). */
export function bandFor(daysLeft: number): RenewalBand {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 30) return "30";
  if (daysLeft <= 60) return "60";
  if (daysLeft <= 90) return "90";
  return "later";
}

/** "Today", "Tomorrow", "In 9 days", "Ended 12 days ago". */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft === 0) return "Ends today";
  if (daysLeft === 1) return "Ends tomorrow";
  if (daysLeft === -1) return "Ended yesterday";
  return daysLeft < 0 ? `Ended ${-daysLeft} days ago` : `${daysLeft} days`;
}
