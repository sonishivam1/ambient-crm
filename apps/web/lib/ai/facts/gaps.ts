import { addDays } from "@ambient/db/time";

/**
 * What a manager would expect on an account but isn't on record, worked out
 * from the records (never written by the model, so a gap can't be invented).
 * Pure: no database access.
 */

export const NO_VISIT_DAYS = 90;
export const NOTHING_LOGGED_DAYS = 30;

export type GapInput = {
  openTasks: number;
  plannedVisits: number;
  lastCompletedVisit: Date | null;
  lastInteraction: Date | null;
  activeContacts: number;
  contracts: number;
  /** Local midnight today, and the tenant's zone. */
  today: Date;
  timeZone: string;
};

export function notOnRecord(g: GapInput): string[] {
  const since = (days: number) => addDays(g.today, -days, g.timeZone);
  const gaps: string[] = [];
  if (g.plannedVisits === 0) gaps.push("No visit planned");
  if (!g.lastCompletedVisit || g.lastCompletedVisit < since(NO_VISIT_DAYS)) gaps.push(`No completed visit in the last ${NO_VISIT_DAYS} days`);
  if (!g.lastInteraction || g.lastInteraction < since(NOTHING_LOGGED_DAYS)) gaps.push(`No call, meeting or note logged in the last ${NOTHING_LOGGED_DAYS} days`);
  if (g.openTasks === 0) gaps.push("No open tasks");
  if (g.activeContacts === 0) gaps.push("No active contacts");
  if (g.contracts === 0) gaps.push("No active contract");
  return gaps;
}
