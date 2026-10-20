import type { HealthBand, Task } from "@ambient/db";

import { BAND, daysLeftLabel } from "@/lib/contracts";
import type { ContactRow } from "@/lib/data/contacts";
import type { ContractRow } from "@/lib/data/contracts";
import type { NotificationRow } from "@/lib/data/notifications";
import { fmtDate, money } from "@/lib/format";
import { SENTIMENT_LABEL, VISIT_TYPE_LABEL, type VisitRow } from "@/lib/visits";

import { factsBuilder, untrusted, untrustedIfAny } from "../facts";

import { ACCOUNT_TYPE_LABEL, PRIORITY_LABEL, TASK_STATUS_LABEL, cardText, factDate, factDateTime, healthLabel, tasksHref } from "./format";

/**
 * One function per kind of record: the fact the model sees (allowed fields,
 * ready-made values, staff text fenced) and the card the user sees, from the
 * same row. Shared by every fact source so a task reads the same everywhere.
 */

export type FactsBuilder = ReturnType<typeof factsBuilder>;

const accountHref = (id: string) => `/accounts/${encodeURIComponent(id)}`;

export function addAccount(
  f: FactsBuilder,
  a: { id: string; name: string; type: "bill_to" | "sold_to"; health: HealthBand | null; owner: string; fyRevenue: number },
  extra: { segment?: string; division?: string; lastTouch?: string; group?: string | null } = {},
) {
  return f.add(
    "account",
    {
      name: a.name,
      type: ACCOUNT_TYPE_LABEL[a.type],
      segment: extra.segment || undefined,
      division: extra.division || undefined,
      health: healthLabel(a.health),
      owner: a.owner || undefined,
      fyRevenue: money(a.fyRevenue),
      lastTouch: extra.lastTouch,
      group: extra.group ?? undefined,
    },
    { name: a.name, typeLabel: ACCOUNT_TYPE_LABEL[a.type], health: a.health, owner: a.owner, fyRevenue: money(a.fyRevenue), href: accountHref(a.id) },
  );
}

export function addTask(
  f: FactsBuilder,
  t: { accountId: string; account: string; title: string; owner: string; dueAt: Date; overdue: boolean; priority: Task["priority"]; status: Task["status"] },
  timeZone: string,
  opts: { withAccount?: boolean; withOwner?: boolean } = {},
) {
  return f.add(
    "task",
    {
      title: untrusted(t.title),
      account: opts.withAccount ? t.account : undefined,
      owner: opts.withOwner ? t.owner : undefined,
      status: TASK_STATUS_LABEL[t.status],
      due: factDate(t.dueAt, timeZone),
      overdue: t.overdue,
      priority: PRIORITY_LABEL[t.priority],
    },
    {
      title: cardText(t.title),
      account: t.account,
      due: fmtDate(t.dueAt, timeZone),
      overdue: t.overdue,
      priority: t.priority,
      statusLabel: TASK_STATUS_LABEL[t.status],
      href: tasksHref(t.accountId),
    },
  );
}

export function addVisit(f: FactsBuilder, v: VisitRow, timeZone: string, opts: { withAccount?: boolean } = {}) {
  const statusLabel = v.report ? SENTIMENT_LABEL[v.report.sentiment] : v.overdue ? "Overdue" : v.status === "completed" ? "Completed" : "Planned";
  const r = v.report;
  return f.add(
    "visit",
    {
      when: factDateTime(v.at, timeZone),
      type: VISIT_TYPE_LABEL[v.type],
      account: opts.withAccount ? v.account : undefined,
      rep: v.rep || undefined,
      purpose: untrustedIfAny(v.purpose),
      status: v.overdue ? "Planned, day passed, not closed" : v.status === "completed" ? "Completed" : "Planned",
      sentiment: r ? SENTIMENT_LABEL[r.sentiment] : undefined,
      ratings: r ? `Relationship ${r.relationship}/5, commercial ${r.commercial}/5, service ${r.service}/5` : undefined,
      keyPoints: untrustedIfAny(r?.keyPoints),
      followUps: untrustedIfAny(r?.followUps),
    },
    {
      when: factDateTime(v.at, timeZone),
      typeLabel: VISIT_TYPE_LABEL[v.type],
      account: v.account,
      purpose: cardText(v.purpose),
      status: v.status,
      statusLabel,
      sentiment: r?.sentiment ?? null,
      href: "/call-cycle",
    },
  );
}

export function addContract(f: FactsBuilder, k: ContractRow, timeZone: string, opts: { withAccount?: boolean } = {}) {
  return f.add(
    "contract",
    {
      name: k.name,
      account: opts.withAccount ? k.account : undefined,
      value: money(k.value),
      end: factDate(k.endDate, timeZone),
      daysLeft: k.daysLeft,
      band: BAND[k.band].label,
    },
    {
      name: k.name,
      number: k.number,
      account: k.account,
      value: money(k.value),
      end: fmtDate(k.endDate, timeZone),
      band: k.band,
      daysLeftLabel: daysLeftLabel(k.daysLeft),
      href: `/contracts?account=${encodeURIComponent(k.accountId)}`,
    },
  );
}

/** Names, titles and roles only: never email or phone. */
export function addContact(f: FactsBuilder, c: ContactRow) {
  return f.add(
    "contact",
    { name: c.name, title: c.jobTitle || undefined, roles: c.roleLabels.length ? c.roleLabels : undefined },
    { name: c.name, jobTitle: c.jobTitle, roles: c.roleLabels, href: `/contacts?account=${encodeURIComponent(c.accountId)}` },
  );
}

export function addInteraction(f: FactsBuilder, i: { accountId: string; title: string; body: string; by: string; at: Date }, timeZone: string) {
  return f.add(
    "interaction",
    { type: i.title, date: factDate(i.at, timeZone), by: i.by || undefined, summary: untrustedIfAny(i.body) },
    { typeLabel: i.title, date: fmtDate(i.at, timeZone), by: i.by, summary: cardText(i.body), href: accountHref(i.accountId) },
  );
}

export function addNotification(f: FactsBuilder, n: NotificationRow, timeZone: string) {
  return f.add(
    "notification",
    { title: n.title, body: untrustedIfAny(n.body), when: factDateTime(n.createdAt, timeZone), account: n.account?.name },
    { title: n.title, body: cardText(n.body), when: factDateTime(n.createdAt, timeZone), href: "/notifications" },
  );
}
