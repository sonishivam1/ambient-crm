import { z } from "zod";

/**
 * Document shapes for every collection. Zod is the single source of truth:
 * TypeScript types are inferred from these schemas, and writes are parsed
 * through them before they reach MongoDB.
 *
 * Ownership classes:
 * - Mirror: copied from the customer's ERP or warehouse, read-only in the app (reps, groups, accounts, contracts).
 * - Rollup: dated warehouse snapshots, append-only (salesSnapshots).
 * - App-native: owned by Ambient, soft-deleted (users, tasks, visits, interactions, contacts, notifications).
 *
 * Tenancy (ADR 0004): every document except a tenant carries `tenantId`, and
 * every index starts with it. Mirror `_id`s are `${tenantId}:${sourceKey}` so
 * keys from different customers' systems never collide; app-created records use
 * UUIDs.
 */

export const ROLE_KEYS = ["user", "manager", "senior", "lead", "admin", "super"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/**
 * Divisions are tenant-defined (see `tenantSchema.divisions`): a key such as
 * "wholesale" that accounts and the records copied from them carry.
 */
export type Division = string;
/** A tenant-defined key (a division, a contact role): lowercase letters, digits, - or _. */
const settingKey = z.string().regex(/^[a-z0-9_-]{1,40}$/, "Keys are lowercase letters, digits, - or _.");
const divisionKey = settingKey;

export const HEALTH_BANDS = ["g", "a", "r"] as const;
export type HealthBand = (typeof HEALTH_BANDS)[number];

/** Present on every tenant-owned document. */
const tenantScoped = {
  tenantId: z.string().min(1),
};

const softDelete = {
  deletedAt: z.date().nullable().default(null),
  deletedBy: z.string().nullable().default(null),
};

const timestamps = {
  createdAt: z.date(),
  updatedAt: z.date(),
};

export const tenantSchema = z.object({
  _id: z.string(),
  name: z.string(),
  /** IANA zone used for day boundaries (today, overdue, this week) and due dates. */
  timeZone: z.string(),
  /** The tenant's lines of business, in display order. */
  divisions: z.array(z.object({ key: divisionKey, label: z.string().min(1).max(60) })).min(1),
  /**
   * The top-bar lens options for senior roles; each narrows every page to a set
   * of divisions. Empty means the tenant has no lens.
   */
  lenses: z.array(z.object({ key: divisionKey, label: z.string().min(1).max(60), divisions: z.array(divisionKey).min(1) })).default([]),
  /** The role tags a contact can carry (Buyer, Finance…), in display order. */
  contactRoles: z.array(z.object({ key: settingKey, label: z.string().min(1).max(60) })).default([]),
  /** The Entra tenant whose users sign in to this Ambient tenant. */
  entraTenantId: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.date(),
});
export type Tenant = z.infer<typeof tenantSchema>;

export const repSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  /** Key in the customer's source system. */
  sourceKey: z.string(),
  code: z.string(),
  name: z.string(),
  email: z.string().email(),
  team: z.string(),
  segment: z.string(),
  /** Entra manager of this rep; drives Manager and SeniorManager visibility. */
  managerRepId: z.string().nullable(),
  active: z.boolean(),
  syncedAt: z.date(),
});
export type Rep = z.infer<typeof repSchema>;

export const userSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  entraOid: z.string().nullable(),
  email: z.string().email(),
  name: z.string(),
  title: z.string(),
  role: z.enum(ROLE_KEYS),
  repId: z.string().nullable(),
  ...timestamps,
  ...softDelete,
});
export type User = z.infer<typeof userSchema>;

export const customerGroupSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  /** Key in the customer's source system. */
  sourceKey: z.string(),
  name: z.string(),
  code: z.string(),
  level: z.enum(["conglomerate", "corporation", "standalone"]),
  ownerRepId: z.string(),
  division: divisionKey,
  health: z.enum(HEALTH_BANDS).nullable(),
  fyRevenue: z.number(),
  billToCount: z.number().int(),
  soldToCount: z.number().int(),
  hierarchy: z.object({ cg1: z.string(), cg2: z.string(), cg3: z.string() }),
  syncedAt: z.date(),
});
export type CustomerGroup = z.infer<typeof customerGroupSchema>;

export const accountSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  /** Key in the customer's source system. */
  sourceKey: z.string(),
  type: z.enum(["bill_to", "sold_to"]),
  groupId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  code: z.string(),
  site: z.string(),
  ownerRepId: z.string(),
  division: divisionKey,
  segment: z.string(),
  health: z.enum(HEALTH_BANDS).nullable(),
  fyRevenue: z.number(),
  active: z.boolean(),
  syncedAt: z.date(),
});
export type Account = z.infer<typeof accountSchema>;

/**
 * A contract header from the customer's systems (Mirror: read-only here). It
 * belongs to a bill-to; renewal bands are worked out from `endDate` on the
 * tenant's calendar.
 */
export const contractSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  sourceKey: z.string(),
  /** The contract number in the source system; unique per tenant. */
  number: z.string(),
  name: z.string(),
  /** A bill-to account. */
  accountId: z.string(),
  /** Copied from the bill-to by the sync so visibility and the lens need no join. */
  ownerRepId: z.string(),
  division: divisionKey,
  /** Contract value in the tenant's currency. */
  value: z.number(),
  /** Local midnight on the first and last day, in the tenant's zone. */
  startDate: z.date(),
  endDate: z.date(),
  /** Terminated contracts are kept but never shown as up for renewal. */
  status: z.enum(["active", "terminated"]),
  syncedAt: z.date(),
});
export type Contract = z.infer<typeof contractSchema>;

export const TASK_STATUSES = ["open", "in_progress", "completed", "cancelled"] as const;
/** Statuses that still need doing. */
export const OPEN_TASK_STATUSES: Array<(typeof TASK_STATUSES)[number]> = ["open", "in_progress"];
export const TASK_PRIORITIES = ["high", "normal", "low"] as const;
export const TASK_SOURCES = ["manual", "ai", "manager_assigned"] as const;

export const taskSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  accountId: z.string(),
  /** Copied from the account at write time so the division lens needs no join. */
  division: divisionKey,
  title: z.string().min(1).max(200),
  description: z.string().max(4000).default(""),
  /** Execution notes and checklists; never copied into the audit log. */
  notes: z.string().max(4000).default(""),
  ownerRepId: z.string(),
  dueAt: z.date(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  source: z.enum(TASK_SOURCES),
  createdByUserId: z.string(),
  completedAt: z.date().nullable().default(null),
  cancelReason: z.string().max(300).nullable().default(null),
  ...timestamps,
  ...softDelete,
});
export type Task = z.infer<typeof taskSchema>;

export const VISIT_TYPES = ["site", "call", "meeting"] as const;
export const VISIT_STATUSES = ["planned", "completed", "cancelled"] as const;

export const VISIT_SENTIMENTS = ["positive", "neutral", "negative"] as const;

/** 1 (poor) to 5 (excellent). */
const rating = z.number().int().min(1).max(5);

/**
 * The post-visit scorecard. Ratings and sentiment roll up to managers; the key
 * points and follow-ups are free text and never reach the audit log.
 */
export const visitReportSchema = z.object({
  sentiment: z.enum(VISIT_SENTIMENTS),
  relationship: rating,
  commercial: rating,
  service: rating,
  keyPoints: z.string().max(4000).default(""),
  followUps: z.string().max(4000).default(""),
  capturedAt: z.date(),
  capturedByUserId: z.string(),
});
export type VisitReport = z.infer<typeof visitReportSchema>;

export const visitSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  /** A bill-to account. */
  accountId: z.string(),
  /** Copied from the account at write time so the division lens needs no join. */
  division: divisionKey,
  /** The rep making the visit; visibility follows it. */
  repId: z.string(),
  type: z.enum(VISIT_TYPES),
  status: z.enum(VISIT_STATUSES),
  purpose: z.string().max(500),
  scheduledAt: z.date(),
  /** Present once completed; a completed visit may still be waiting for its report. */
  report: visitReportSchema.nullable().default(null),
  completedAt: z.date().nullable().default(null),
  cancelReason: z.string().max(300).nullable().default(null),
  createdByUserId: z.string(),
  ...timestamps,
  ...softDelete,
});
export type Visit = z.infer<typeof visitSchema>;

export const INTERACTION_TYPES = ["note", "call", "meeting"] as const;

/**
 * Activity a person logs against an account (a note, a call, a meeting).
 * Visible to anyone who can see the account. Captured email and meetings are a
 * separate, participant-fenced collection (planned).
 */
export const interactionSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  accountId: z.string(),
  /** Copied from the account at write time so the division lens needs no join. */
  division: divisionKey,
  type: z.enum(INTERACTION_TYPES),
  summary: z.string().trim().min(1).max(4000),
  authorUserId: z.string(),
  occurredAt: z.date(),
  ...timestamps,
  ...softDelete,
});
export type Interaction = z.infer<typeof interactionSchema>;

/**
 * A person at a customer. Ambient is the system of record for contacts (they
 * are synced back to the warehouse, planned). A contact belongs to a bill-to
 * account and optionally one of its sold-to sites, and is visible to anyone who
 * can see that bill-to.
 */
export const contactSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  /** The bill-to account. */
  accountId: z.string(),
  /** A sold-to under that bill-to, when the contact works at one site. */
  soldToAccountId: z.string().nullable().default(null),
  /** Copied from the bill-to at write time so visibility and the lens need no join; the sync refreshes them. */
  ownerRepId: z.string(),
  division: divisionKey,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(""),
  jobTitle: z.string().trim().max(120).default(""),
  /** Lowercased; unique per tenant among contacts that aren't deleted. */
  email: z.string().trim().toLowerCase().max(254).nullable().default(null),
  phone: z.string().trim().max(40).default(""),
  /** Keys from the tenant's `contactRoles`. */
  roles: z.array(settingKey).max(10).default([]),
  /** Inactive contacts stay on historical records but drop out of pickers. */
  active: z.boolean(),
  createdByUserId: z.string(),
  updatedByUserId: z.string(),
  ...timestamps,
  ...softDelete,
});
export type Contact = z.infer<typeof contactSchema>;

export const NOTIFICATION_TYPES = [
  "at_risk_change",
  "contract_renewal",
  "ai_suggestion",
  "task_assigned",
  "email_flagged",
  "visit_reminder",
  "visit_assigned",
] as const;

export const notificationSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  userId: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  accountId: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
});
export type Notification = z.infer<typeof notificationSchema>;

/**
 * Append-only record of every write: who did what, with before and after
 * state. Never holds note or email bodies.
 */
export const auditEntrySchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  at: z.date(),
  actorUserId: z.string(),
  /** Set when an admin acts while viewing as someone else. */
  impersonatedUserId: z.string().nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/** One dated sales snapshot per scope (a rep, or "org" for the whole business). */
export const salesSnapshotSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  scope: z.string(),
  asOf: z.date(),
  mtd: z.object({ actual: z.number(), target: z.number() }),
  ytd: z.object({ actual: z.number(), target: z.number() }),
  gmPct: z.number(),
  daysLeftInMonth: z.number().int(),
  daysLeftInYear: z.number().int(),
});
export type SalesSnapshot = z.infer<typeof salesSnapshotSchema>;
