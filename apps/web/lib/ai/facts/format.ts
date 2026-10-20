import type { HealthBand, Task } from "@ambient/db";

import { CARD_TEXT_LIMIT } from "../cards";
import { cut } from "../facts";

/**
 * Ready-made values for facts and cards, so the model never has to work a
 * date, amount or label out. Pure: no database access.
 */

const LOCALE = "en-AU";

/** "Tue 21 Oct 2026", on the tenant's calendar (the policy prompt's weekday style). */
export const factDate = (d: Date, timeZone: string) =>
  d.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone }).replace(",", "");

/** "Tue 21 Oct 2026, 9:30 am". */
export const factDateTime = (d: Date, timeZone: string) =>
  `${factDate(d, timeZone)}, ${d.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit", timeZone })}`;

export const HEALTH_LABEL: Record<HealthBand, string> = { g: "Healthy", a: "Watch", r: "At risk" };
export const healthLabel = (band: HealthBand | null) => (band ? HEALTH_LABEL[band] : "Not rated");

export const ACCOUNT_TYPE_LABEL = { bill_to: "Bill-to", sold_to: "Sold-to" } as const;

export const TASK_STATUS_LABEL: Record<Task["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
export const PRIORITY_LABEL: Record<Task["priority"], string> = { high: "High", normal: "Medium", low: "Low" };

/** Plain text for a card: the user reads it next to the record, so no fence, just a length cap. */
export const cardText = (text: string) => cut(text.replace(/\s+/g, " ").trim(), CARD_TEXT_LIMIT);

/** Where a task card links: the account's tasks. */
export const tasksHref = (accountId: string) => `/tasks?view=all&account=${encodeURIComponent(accountId)}`;
