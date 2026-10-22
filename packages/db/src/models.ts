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
 * - Observability: append-only (auditLog, aiInvocations); aiUsage is the AI budget ledger.
 * - Cache: aiOutputs, verified AI answers per user, deleted after at most 7 days.
 * - Conversations: aiConversations, a user's Wren chats, deleted 90 days after the last turn.
 * - Proposals: aiProposals, records Wren prepared for a user to accept, deleted 7 days after creation.
 * - Feedback: aiFeedback, users' ratings of AI answers; metadata only, no text.
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
  /**
   * The tenant's AI policy. Off by default: an admin turns it on, chooses the
   * roles and features that may use it, and sets a monthly token budget.
   */
  ai: z
    .object({
      enabled: z.boolean(),
      roles: z.array(z.enum(ROLE_KEYS)),
      /** AI feature ids that are switched on (for example "account-summary"). */
      features: z.array(settingKey),
      monthlyTokenBudget: z.number().int().min(0),
    })
    .default({ enabled: false, roles: [], features: [], monthlyTokenBudget: 0 }),
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

export const AI_TIERS = ["fast", "strong"] as const;
/** `cached`: served from aiOutputs with no model call. */
export const AI_OUTCOMES = ["ok", "repaired", "rejected", "refused", "failed", "cached"] as const;
export const AI_REFUSALS = ["not_configured", "ai_disabled", "feature_disabled", "role_not_allowed", "budget_exhausted", "rate_limited"] as const;
export const AI_ERROR_KINDS = ["timeout", "provider", "schema", "unknown"] as const;

/**
 * One row per AI request, refused or not. Metadata only: there is deliberately
 * no field that could hold prompt, facts or reply text.
 */
export const aiInvocationSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  userId: z.string(),
  feature: z.string(),
  /** The feature prompt's version and the shared policy prompt's version. */
  promptVersion: z.number().int(),
  policyVersion: z.number().int(),
  /** Null when no model was called (a refusal). */
  model: z.string().nullable(),
  tier: z.enum(AI_TIERS),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  latencyMs: z.number().int().min(0),
  /** How many model calls this request took (0 when refused, 2 after a retry). */
  attempts: z.number().int().min(0),
  outcome: z.enum(AI_OUTCOMES),
  refusal: z.enum(AI_REFUSALS).nullable(),
  errorKind: z.enum(AI_ERROR_KINDS).nullable(),
  createdAt: z.date(),
});
export type AiInvocation = z.infer<typeof aiInvocationSchema>;

/**
 * The AI token ledger for one tenant and month (on the tenant's calendar).
 * Calls reserve an estimate before they run and settle to real usage after,
 * so concurrent calls can't overspend the budget.
 */
export const aiUsageSchema = z.object({
  /** `${tenantId}:${YYYY-MM}` */
  _id: z.string(),
  ...tenantScoped,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  reserved: z.number().int().min(0),
  used: z.number().int().min(0),
  updatedAt: z.date(),
});
export type AiUsage = z.infer<typeof aiUsageSchema>;

/**
 * A verified AI answer, cached for one user, feature and subject (such as an
 * account). A `facts` feature serves it only while the facts it was built
 * from are unchanged (same fingerprint); a `day` feature serves it until local
 * midnight with the cards it was shown with. Always under the same prompt and
 * policy versions and model. Holds the answer text, so it is per user and
 * expires (TTL on expiresAt).
 */
export const aiOutputSchema = z.object({
  /** `${tenantId}:${userId}:${feature}:${subjectId}` */
  _id: z.string(),
  ...tenantScoped,
  userId: z.string(),
  feature: z.string(),
  subjectId: z.string(),
  factsFingerprint: z.string(),
  promptVersion: z.number().int(),
  policyVersion: z.number().int(),
  model: z.string(),
  /** The verified, limited output, exactly as it was shown. */
  output: z.unknown(),
  /** The cited records' cards and the feature's notes when it was generated (served as is by `day` features). */
  cards: z.array(z.unknown()),
  notes: z.array(z.string()),
  createdAt: z.date(),
  expiresAt: z.date(),
});
export type AiOutput = z.infer<typeof aiOutputSchema>;

/** One turn of a Wren chat: the user's question, or Wren's verified answer as it was shown. */
export const aiTurnSchema = z.object({
  _id: z.string(),
  role: z.enum(["user", "assistant"]),
  /** The question, or the answer's main text. */
  text: z.string(),
  bullets: z.array(z.string()),
  followUpQuestion: z.string().nullable(),
  /** The records the answer cited, as cards, as they were shown. */
  cards: z.array(z.unknown()),
  /** An answer that cited no records (nothing found, a question back, out of scope). */
  uncited: z.boolean(),
  /** Proposals this answer prepared (aiProposals ids); their status is read live. */
  proposalIds: z.array(z.string()).default([]),
  /** What produced an answer, for feedback; null on questions and older turns. */
  promptVersion: z.number().int().nullable().default(null),
  policyVersion: z.number().int().nullable().default(null),
  model: z.string().nullable().default(null),
  createdAt: z.date(),
});
export type AiTurn = z.infer<typeof aiTurnSchema>;

/**
 * A user's Wren conversation. Private to that user: never shared, sent to the
 * model only as context for their own next question. Deleted 90 days after
 * the last turn (TTL on expiresAt).
 */
export const aiConversationSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  userId: z.string(),
  title: z.string(),
  turns: z.array(aiTurnSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
  expiresAt: z.date(),
});
export type AiConversation = z.infer<typeof aiConversationSchema>;

export const AI_PROPOSAL_KINDS = ["task", "visit", "note"] as const;
export const AI_PROPOSAL_STATUSES = ["pending", "accepting", "accepted", "dismissed"] as const;

/**
 * Something Wren prepared for one user to accept: the exact input the normal
 * form would send. Nothing is written until the user accepts, which runs the
 * same code as the form. Single use; deleted 7 days after creation (TTL).
 */
export const aiProposalSchema = z.object({
  _id: z.string(),
  ...tenantScoped,
  userId: z.string(),
  kind: z.enum(AI_PROPOSAL_KINDS),
  /** The form's input: task {accountId, title, dueDate, priority}, visit {accountId, date, time, type, purpose}, note {accountId, type, summary}. */
  input: z.record(z.string(), z.unknown()),
  /** What the card shows: the account's name and ready-made lines. */
  display: z.object({ title: z.string(), account: z.string(), lines: z.array(z.string()) }),
  origin: z.enum(["chat", "followups"]),
  /** What it was suggested from: the visit, for follow-ups; null from chat. */
  sourceId: z.string().nullable(),
  status: z.enum(AI_PROPOSAL_STATUSES),
  /** What accepting created, and where it lives; null until then (or when saved from the form). */
  resultId: z.string().nullable(),
  resultHref: z.string().nullable(),
  /** The last refusal from the action, shown on the card. */
  lastError: z.string().nullable(),
  createdAt: z.date(),
  decidedAt: z.date().nullable(),
  expiresAt: z.date(),
});
export type AiProposal = z.infer<typeof aiProposalSchema>;

export const AI_FEEDBACK_REASONS = ["wrong", "missing", "not_useful", "unclear"] as const;

/**
 * One user's rating of one AI answer (a later vote replaces it). Metadata
 * only: the rating, a fixed reason, and what produced the answer, never its
 * text or any comment.
 */
export const aiFeedbackSchema = z.object({
  /** `${tenantId}:${userId}:${feature}:${answerKey}` */
  _id: z.string(),
  ...tenantScoped,
  userId: z.string(),
  feature: z.string(),
  /** Which answer: the account and time for a summary, the day for a brief, the turn for chat. */
  answerKey: z.string(),
  rating: z.enum(["up", "down"]),
  reason: z.enum(AI_FEEDBACK_REASONS).nullable(),
  promptVersion: z.number().int(),
  policyVersion: z.number().int(),
  model: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type AiFeedback = z.infer<typeof aiFeedbackSchema>;

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
