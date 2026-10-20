import type { HealthBand } from "@ambient/db/models";

import type { RenewalBand } from "@/lib/contracts";

/**
 * Card data: what the user sees for each record an AI answer cites. Built on
 * the server from the same scoped records as the facts (never from model
 * text), with values ready to show. Pure types, safe in client components.
 */

type Base = { handle: string; href: string };

export type AccountCardData = Base & {
  kind: "account";
  name: string;
  typeLabel: string;
  health: HealthBand | null;
  owner: string;
  fyRevenue: string;
};

export type TaskCardData = Base & {
  kind: "task";
  title: string;
  account: string;
  due: string;
  overdue: boolean;
  priority: "high" | "normal" | "low";
  statusLabel: string;
};

export type VisitCardData = Base & {
  kind: "visit";
  when: string;
  typeLabel: string;
  account: string;
  purpose: string;
  status: "planned" | "completed" | "cancelled";
  /** "Planned", "Overdue", or the report's sentiment once completed. */
  statusLabel: string;
  sentiment: "positive" | "neutral" | "negative" | null;
};

export type ContractCardData = Base & {
  kind: "contract";
  name: string;
  number: string;
  account: string;
  value: string;
  end: string;
  band: RenewalBand;
  daysLeftLabel: string;
};

export type ContactCardData = Base & {
  kind: "contact";
  name: string;
  jobTitle: string;
  roles: string[];
  /** Shown on the card only, where a tool chose to; never part of the facts. */
  email?: string;
  phone?: string;
};

export type InteractionCardData = Base & {
  kind: "interaction";
  typeLabel: string;
  date: string;
  by: string;
  summary: string;
};

export type NotificationCardData = Base & {
  kind: "notification";
  title: string;
  body: string;
  when: string;
};

export type AiCardData =
  | AccountCardData
  | TaskCardData
  | VisitCardData
  | ContractCardData
  | ContactCardData
  | InteractionCardData
  | NotificationCardData;

export type AiCardKind = AiCardData["kind"];

/** The handle prefix for each kind of record: A1, T1, V1, K1, C1, I1, N1. */
export const HANDLE_PREFIX: Record<AiCardKind, string> = {
  account: "A",
  task: "T",
  visit: "V",
  contract: "K",
  contact: "C",
  interaction: "I",
  notification: "N",
};

/** Card text is cut to this length; the record itself is one click away. */
export const CARD_TEXT_LIMIT = 160;
