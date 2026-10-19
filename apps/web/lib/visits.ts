import { z } from "zod";

// Schemas only (no driver), so this file is safe in client components.
import { VISIT_SENTIMENTS, VISIT_TYPES } from "@ambient/db/models";

/** Visit rules and row shapes shared by the server, the dialogs and their tests. Pure: no database access. */

export const CALL_CYCLE_WEEKS = 6;
export const HISTORY_WEEKS = 4;

export const VISIT_TYPE_LABEL: Record<(typeof VISIT_TYPES)[number], string> = { site: "Site visit", call: "Call", meeting: "Meeting" };
export const SENTIMENT_LABEL: Record<(typeof VISIT_SENTIMENTS)[number], string> = { positive: "Positive", neutral: "Neutral", negative: "Negative" };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time.")
  .default("09:00");
const purpose = z.string().trim().max(500, "Keep the purpose under 500 characters.").default("");
const id = z.string().min(1).max(200);

export const createVisitInput = z.object({
  accountId: z.string().min(1, "Choose an account.").max(200),
  date: isoDate,
  time,
  type: z.enum(VISIT_TYPES, "Choose a visit type."),
  purpose,
  /** Who makes the visit; only managers may pick someone else. */
  repId: z.string().max(200).nullish(),
});

export const updateVisitInput = z.object({ id, date: isoDate, time, type: z.enum(VISIT_TYPES, "Choose a visit type."), purpose, repId: z.string().max(200).nullish() });

export const cancelVisitInput = z.object({ id, reason: z.string().trim().max(300, "Keep the reason under 300 characters.").default("") });

const rating = (what: string) => z.number(`Rate the ${what} from 1 to 5.`).int(`Rate the ${what} from 1 to 5.`).min(1, `Rate the ${what} from 1 to 5.`).max(5, `Rate the ${what} from 1 to 5.`);

export const completeVisitInput = z.object({
  id,
  sentiment: z.enum(VISIT_SENTIMENTS, "Choose how it went."),
  relationship: rating("relationship"),
  commercial: rating("commercial outlook"),
  service: rating("service"),
  keyPoints: z.string().trim().max(4000, "Keep the key points under 4,000 characters.").default(""),
  followUps: z.string().trim().max(4000, "Keep the follow-ups under 4,000 characters.").default(""),
});

/** "09:30" → [9, 30]. Input is already validated. */
export const parseTime = (t: string) => t.split(":").map(Number) as [number, number];

export type VisitRow = {
  id: string;
  accountId: string;
  account: string;
  accountCode: string;
  repId: string;
  rep: string;
  type: (typeof VISIT_TYPES)[number];
  status: "planned" | "completed" | "cancelled";
  purpose: string;
  at: Date;
  /** Planned, and its day has passed on the tenant's calendar. */
  overdue: boolean;
  /** Its day has come, so it can be completed. */
  due: boolean;
  report: {
    sentiment: (typeof VISIT_SENTIMENTS)[number];
    relationship: number;
    commercial: number;
    service: number;
    keyPoints: string;
    followUps: string;
    capturedAt: Date;
    capturedBy: string;
  } | null;
};
