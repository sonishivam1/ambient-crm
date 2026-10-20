import "server-only";

import { z } from "zod";

import { collection } from "@ambient/db";
import { addDays, isoDayIn, startOfWeek } from "@ambient/db/time";

import { getContactsPage, contactsQuerySchema } from "@/lib/data/contacts";
import { contractsQuerySchema, getContractsPage } from "@/lib/data/contracts";
import { getTasksPage, tasksQuerySchema } from "@/lib/data/tasks";
import { decorateVisits } from "@/lib/data/visits";

import { accountData } from "../facts/account";
import { addContact, addContract, addTask, addVisit } from "../facts/records";

import { TOOL_RECORD_CAP, defineAiTool, resolveAccount, type ResolvedAccount, type ToolContext } from "./define";

/*
 * Wren's read tools (step 5). Each runs as the signed-in user on the same read
 * models as the pages, so it can't see more than the user can, and returns at
 * most 15 records with the full total. Descriptions match docs/architecture/ai-prompts.md.
 */

const shortName = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

/** An optional account name, resolved among the user's own accounts. */
async function optionalAccount(ctx: ToolContext, name: string | null) {
  if (!name?.trim()) return { ok: true as const, account: null };
  return resolveAccount(ctx.scope, name);
}

/** An account and its sold-tos: visits and tasks may sit on either. */
async function withSites(ctx: ToolContext, a: ResolvedAccount): Promise<string[]> {
  if (a.type === "sold_to") return [a.id];
  const sites = await (await collection("accounts")).distinct("_id", { ...ctx.scope.filter(), parentId: a.id, active: true });
  return [a.id, ...sites];
}

export const listTasks = defineAiTool({
  name: "list_tasks",
  description: "The user's tasks. Use for to-dos, follow-ups, and overdue or due work.",
  input: z.object({
    status: z.enum(["overdue", "due_today", "open"]).describe("overdue: past due; due_today: due today; open: everything not done"),
    accountName: z.string().nullable().describe("Only this account's tasks, or null for all"),
  }),
  progress: (i) => (i.accountName ? `Checking tasks on ${shortName(i.accountName)}…` : "Checking your tasks…"),
  async run(ctx, input) {
    const found = await optionalAccount(ctx, input.accountName);
    if (!found.ok) return found;
    const today = isoDayIn(ctx.scope.today, ctx.scope.timeZone);
    const status = input.status === "overdue" ? "overdue" : input.status === "due_today" ? "open,in_progress" : "overdue,open,in_progress";
    const ids = found.account ? await withSites(ctx, found.account) : [null];
    let total = 0;
    const rows = [];
    for (const account of ids) {
      const page = await getTasksPage(
        tasksQuerySchema.parse({ view: "all", status, account: account ?? "", ...(input.status === "due_today" ? { from: today, to: today } : {}), sort: "due" }),
      );
      total += page.total;
      rows.push(...page.rows);
    }
    rows.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    return {
      ok: true,
      account: found.account?.name ?? null,
      total,
      tasks: rows.slice(0, TOOL_RECORD_CAP).map((t) => addTask(ctx.f, t, ctx.scope.timeZone, { withAccount: true, withOwner: ctx.team })),
    };
  },
});

export const getAccount = defineAiTool({
  name: "get_account",
  description: "Everything about one customer account: health, owner, revenue, tasks, visits, notes, contracts and contacts. Use when the user names an account.",
  input: z.object({ name: z.string().describe("The account's name as the user said it") }),
  progress: (i) => `Looking up ${shortName(i.name)}…`,
  async run(ctx, input) {
    const found = await resolveAccount(ctx.scope, input.name);
    if (!found.ok) return found;
    const data = await accountData(ctx.scope, { accountId: found.account.id }, ctx.f);
    if (!data) return { ok: false, reason: "not_found", ask: `I couldn't open "${found.account.name}". Check it in Accounts.` };
    return { ok: true, ...data };
  },
});

export const listVisits = defineAiTool({
  name: "list_visits",
  description: "Visits, calls and meetings, past or planned. Use for the schedule and for \"when did we last see\" questions.",
  input: z.object({
    range: z.enum(["past_30_days", "this_week", "next_14_days"]),
    accountName: z.string().nullable().describe("Only this account's visits, or null for all"),
  }),
  progress: (i) => (i.accountName ? `Checking visits to ${shortName(i.accountName)}…` : "Checking the call cycle…"),
  async run(ctx, input) {
    const found = await optionalAccount(ctx, input.accountName);
    if (!found.ok) return found;
    const { scope } = ctx;
    const tz = scope.timeZone;
    const now = new Date();
    const window =
      input.range === "past_30_days"
        ? { $gte: addDays(scope.today, -30, tz), $lt: now }
        : input.range === "this_week"
          ? { $gte: startOfWeek(now, tz), $lt: addDays(startOfWeek(now, tz), 7, tz) }
          : { $gte: scope.today, $lt: addDays(scope.today, 14, tz) };
    const filter = {
      ...scope.filter("repId"),
      deletedAt: null,
      status: { $ne: "cancelled" as const },
      scheduledAt: window,
      ...(found.account ? { accountId: { $in: await withSites(ctx, found.account) } } : {}),
    };
    const visits = await collection("visits");
    const [docs, total] = await Promise.all([
      visits.find(filter).sort({ scheduledAt: input.range === "past_30_days" ? -1 : 1, _id: 1 }).limit(TOOL_RECORD_CAP).toArray(),
      visits.countDocuments(filter),
    ]);
    const rows = await decorateVisits(scope, docs);
    return { ok: true, account: found.account?.name ?? null, range: input.range, total, visits: rows.map((v) => addVisit(ctx.f, v, tz, { withAccount: true })) };
  },
});

export const listRenewals = defineAiTool({
  name: "list_renewals",
  description: "Contracts ending soon, or ended in the last 90 days. Use for renewals and contract end dates.",
  input: z.object({ withinDays: z.enum(["30", "60", "90"]).describe("Contracts ending within this many days") }),
  progress: () => "Checking renewals…",
  async run(ctx, input) {
    const days = Number(input.withinDays);
    const page = await getContractsPage(contractsQuerySchema.parse({ sort: "end" }));
    const rows = page.rows.filter((k) => k.daysLeft <= days);
    const c = page.counts;
    const total = c.expired + c["30"] + (days >= 60 ? c["60"] : 0) + (days >= 90 ? c["90"] : 0);
    return {
      ok: true,
      withinDays: days,
      total,
      endedRecently: c.expired,
      contracts: rows.slice(0, TOOL_RECORD_CAP).map((k) => addContract(ctx.f, k, ctx.scope.timeZone, { withAccount: true })),
    };
  },
});

export const findContacts = defineAiTool({
  name: "find_contacts",
  description: "People at the user's customer accounts, with their job titles and roles. Use to find who to talk to.",
  input: z.object({
    accountName: z.string().nullable().describe("Only this account's people, or null"),
    role: z.string().nullable().describe("A contact role such as Buyer or Finance, or null"),
    query: z.string().nullable().describe("Words in a name or job title, or null"),
  }),
  progress: (i) => (i.accountName ? `Finding contacts at ${shortName(i.accountName)}…` : "Finding contacts…"),
  async run(ctx, input) {
    const found = await optionalAccount(ctx, input.accountName);
    if (!found.ok) return found;
    const roles = ctx.scope.user.tenant.contactRoles;
    let role = "";
    if (input.role?.trim()) {
      const want = input.role.trim().toLowerCase();
      const match = roles.find((r) => r.key === want || r.label.toLowerCase() === want);
      if (!match) return { ok: false, reason: "invalid", ask: `Contact roles here are ${roles.map((r) => r.label).join(", ")}. Which one?` };
      role = match.key;
    }
    // Contacts belong to bill-tos; a sold-to's are its bill-to's.
    const account = found.account ? (found.account.type === "sold_to" ? (found.account.parentId ?? "") : found.account.id) : "";
    const page = await getContactsPage(contactsQuerySchema.parse({ q: input.query?.trim().slice(0, 100) ?? "", role, account, status: "active" }));
    return {
      ok: true,
      account: found.account?.name ?? null,
      total: page.total,
      contacts: page.rows.slice(0, TOOL_RECORD_CAP).map((c) => addContact(ctx.f, c, { withDetails: true })),
    };
  },
});

/** Every read tool, by name. */
export const READ_TOOLS = [listTasks, getAccount, listVisits, listRenewals, findContacts];
