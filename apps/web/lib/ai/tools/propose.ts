import "server-only";

import { z } from "zod";

import { INTERACTION_TYPES, TASK_PRIORITIES, VISIT_TYPES, collection } from "@ambient/db";
import { fromIsoDay, isoDayIn } from "@ambient/db/time";

import { VISIT_TYPE_LABEL } from "@/lib/visits";

import { cut } from "../facts";
import { factDate, factDateTime, PRIORITY_LABEL } from "../facts/format";
import { plainText } from "../features/text";
import { createProposal } from "../proposals";

import { PROPOSALS_PER_QUESTION, defineAiTool, resolveAccount, type ResolvedAccount, type ToolContext, type ToolResult } from "./define";

/*
 * Wren's propose tools (step 6). Each prepares a record for the user to
 * accept and writes nothing else: the proposal holds exactly what the normal
 * form would send, and Accept runs the form's own code. A proposal that isn't
 * ready (generic title, missing or past date, an account the user can't see)
 * is refused with the question to ask instead. Descriptions match
 * docs/architecture/ai-prompts.md.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Titles that say nothing about what to do. */
const GENERIC = new Set(["follow up", "followup", "follow-up", "call", "email", "task", "todo", "to do", "check in", "reminder", "meeting", "visit", "update", "chase"]);

export function isGenericTitle(title: string): boolean {
  const t = title.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
  return GENERIC.has(t) || t.split(" ").length < 2;
}

const tooMany = (ctx: ToolContext): ToolResult | null =>
  ctx.proposals.length >= PROPOSALS_PER_QUESTION ? { ok: false, reason: "limit", ask: `I can prepare up to ${PROPOSALS_PER_QUESTION} at a time. Accept or dismiss these first.` } : null;

/** Tasks and visits belong to bill-tos; a sold-to's go on its bill-to. */
async function billTo(ctx: ToolContext, name: string): Promise<{ ok: true; account: ResolvedAccount; name: string } | Extract<ToolResult, { ok: false }>> {
  const found = await resolveAccount(ctx.scope, name);
  if (!found.ok) return found;
  if (found.account.type === "bill_to") return { ok: true, account: found.account, name: found.account.name };
  const parent = await resolveById(ctx, found.account.parentId);
  return parent ? { ok: true, account: parent, name: parent.name } : { ok: false, reason: "not_found", ask: `I couldn't find the bill-to for "${found.account.name}".` };
}

async function resolveById(ctx: ToolContext, id: string | null): Promise<ResolvedAccount | null> {
  if (!id) return null;
  const a = await (await collection("accounts")).findOne({ _id: id, ...ctx.scope.filter(), active: true }, { projection: { name: 1, type: 1, parentId: 1 } });
  return a ? { id: a._id, name: a.name, type: a.type, parentId: a.parentId } : null;
}

/** Today or later on the tenant's calendar, as YYYY-MM-DD; or the question to ask. */
function futureDay(ctx: ToolContext, iso: string, what: string): { ok: true; iso: string } | Extract<ToolResult, { ok: false }> {
  if (!ISO.test(iso)) return { ok: false, reason: "invalid", ask: `What date should the ${what} be?` };
  const today = isoDayIn(ctx.scope.today, ctx.scope.timeZone);
  if (iso < today) return { ok: false, reason: "invalid", ask: `That date has passed. What date should the ${what} be?` };
  return { ok: true, iso };
}

const proposed = (id: string, summary: string): ToolResult => ({
  ok: true,
  proposalId: id,
  prepared: summary,
  note: "Prepared for the user to accept. Nothing has been created; say it's ready to accept.",
});

export const proposeTask = defineAiTool({
  name: "propose_task",
  description:
    "Prepare a task for the user to accept. Does not create it. Needs what to do, in the user's words, and a due date; ask if either is missing.",
  input: z.object({
    accountName: z.string().describe("The account the task is for"),
    title: z.string().describe("What to do, starting with a verb, e.g. \"Send the updated quote\""),
    dueDate: z.string().describe("YYYY-MM-DD, today or later"),
    priority: z.enum(TASK_PRIORITIES),
  }),
  progress: () => "Preparing a task…",
  async run(ctx, input) {
    const limit = tooMany(ctx);
    if (limit) return limit;
    const title = plainText(input.title, 200);
    if (!title || isGenericTitle(title)) return { ok: false, reason: "invalid", ask: "What exactly should the task say? For example, \"Send the updated quote\"." };
    const day = futureDay(ctx, input.dueDate, "task be due");
    if (!day.ok) return day;
    const account = await billTo(ctx, input.accountName);
    if (!account.ok) return account;
    const due = fromIsoDay(day.iso, ctx.scope.timeZone, 17, 0);
    const id = await createProposal(ctx.scope, {
      kind: "task",
      origin: "chat",
      sourceId: null,
      input: { accountId: account.account.id, title, dueDate: day.iso, priority: input.priority, description: "", notes: "", assigneeRepIds: [] },
      display: { title, account: account.name, lines: [`Due ${factDate(due, ctx.scope.timeZone)}`, `${PRIORITY_LABEL[input.priority]} priority`] },
    });
    ctx.proposals.push(id);
    return proposed(id, `Task "${title}" on ${account.name}, due ${factDate(due, ctx.scope.timeZone)}`);
  },
});

export const proposeVisit = defineAiTool({
  name: "propose_visit",
  description: "Prepare a visit, call or meeting for the user to accept. Does not book it. Needs a date; ask if it's missing.",
  input: z.object({
    accountName: z.string(),
    date: z.string().describe("YYYY-MM-DD, today or later"),
    time: z.string().nullable().describe("HH:MM in 24 hours, or null for 09:00"),
    type: z.enum(VISIT_TYPES),
    purpose: z.string().nullable(),
  }),
  progress: () => "Preparing a visit…",
  async run(ctx, input) {
    const limit = tooMany(ctx);
    if (limit) return limit;
    const day = futureDay(ctx, input.date, "visit");
    if (!day.ok) return day;
    const time = input.time && TIME.test(input.time) ? input.time : "09:00";
    const account = await billTo(ctx, input.accountName);
    if (!account.ok) return account;
    const [h, m] = time.split(":").map(Number) as [number, number];
    const at = fromIsoDay(day.iso, ctx.scope.timeZone, h, m);
    if (at < new Date()) return { ok: false, reason: "invalid", ask: "That time has passed. When should the visit be?" };
    const purpose = plainText(input.purpose ?? "", 500);
    const id = await createProposal(ctx.scope, {
      kind: "visit",
      origin: "chat",
      sourceId: null,
      input: { accountId: account.account.id, date: day.iso, time, type: input.type, purpose },
      display: {
        title: `${VISIT_TYPE_LABEL[input.type]} · ${account.name}`,
        account: account.name,
        lines: [factDateTime(at, ctx.scope.timeZone), ...(purpose ? [cut(purpose, 160)] : [])],
      },
    });
    ctx.proposals.push(id);
    return proposed(id, `${VISIT_TYPE_LABEL[input.type]} with ${account.name} on ${factDateTime(at, ctx.scope.timeZone)}`);
  },
});

const NOTE_LABEL: Record<(typeof INTERACTION_TYPES)[number], string> = { note: "Note", call: "Call", meeting: "Meeting" };

export const proposeNote = defineAiTool({
  name: "propose_note",
  description: "Prepare a note, call log or meeting log for the user to accept. Does not save it. Needs a summary in the user's words.",
  input: z.object({
    accountName: z.string(),
    type: z.enum(INTERACTION_TYPES),
    summary: z.string().describe("What happened or what to remember, in the user's words"),
  }),
  progress: () => "Preparing a note…",
  async run(ctx, input) {
    const limit = tooMany(ctx);
    if (limit) return limit;
    const summary = plainText(input.summary, 2000);
    if (summary.length < 3) return { ok: false, reason: "invalid", ask: "What should the note say?" };
    // Notes may go on any account the user can see, bill-to or sold-to.
    const found = await resolveAccount(ctx.scope, input.accountName);
    if (!found.ok) return found;
    const id = await createProposal(ctx.scope, {
      kind: "note",
      origin: "chat",
      sourceId: null,
      input: { accountId: found.account.id, type: input.type, summary },
      display: { title: `${NOTE_LABEL[input.type]} on ${found.account.name}`, account: found.account.name, lines: [cut(summary, 160)] },
    });
    ctx.proposals.push(id);
    return proposed(id, `${NOTE_LABEL[input.type]} on ${found.account.name}`);
  },
});

export const PROPOSE_TOOLS = [proposeTask, proposeVisit, proposeNote];
