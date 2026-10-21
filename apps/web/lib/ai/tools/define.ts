import "server-only";

import type { z } from "zod";

import { collection } from "@ambient/db";

import type { Scope } from "@/lib/data/scope";

import type { FactsBuilder } from "../facts/records";

/**
 * A tool Wren can call in chat. Read tools (step 5) look records up as the
 * signed-in user and add them to the turn's shared facts builder, so handles
 * stay unique across every tool in one question. A tool never writes.
 */

export type ToolContext = {
  scope: Scope;
  /** The turn's builder: every tool's records get handles from it. */
  f: FactsBuilder;
  /** A manager or org-wide user, whose results include whose each record is. */
  team: boolean;
  /** Proposals prepared in this question (propose tools add to it). */
  proposals: string[];
};

/** What the model gets back: facts, or a refusal with the question to ask the user. */
export type ToolResult = ({ ok: true } & Record<string, unknown>) | { ok: false; reason: "not_found" | "ambiguous" | "invalid" | "limit"; ask: string };

/** At most this many proposals per question. */
export const PROPOSALS_PER_QUESTION = 3;

export type AiTool<I> = {
  name: string;
  /** Shown to the model: when to use the tool. Tool descriptions are prompts too. */
  description: string;
  /** OpenAI strict function calling: every field present, `.nullable()` for optional ones. */
  input: z.ZodType<I>;
  /** The progress line the user sees while it runs. */
  progress: (input: I) => string;
  run: (ctx: ToolContext, input: I) => Promise<ToolResult>;
};

export function defineAiTool<I>(tool: AiTool<I>): AiTool<I> {
  return tool;
}

/** At most this many records per tool; the totals say how many there are. */
export const TOOL_RECORD_CAP = 15;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type ResolvedAccount = { id: string; name: string; type: "bill_to" | "sold_to"; parentId: string | null };

/**
 * Find one of the user's own accounts by name: an exact name first, then a
 * name containing the words. Never looks outside the user's scope, so another
 * rep's or tenant's account is simply "not found".
 */
export async function resolveAccount(scope: Scope, rawName: string): Promise<{ ok: true; account: ResolvedAccount } | Extract<ToolResult, { ok: false }>> {
  const name = rawName.replace(/\s+/g, " ").trim().slice(0, 100);
  if (!name) return { ok: false, reason: "invalid", ask: "Which account do you mean?" };
  const rows = await (await collection("accounts"))
    .find({ ...scope.filter(), active: true, name: new RegExp(escapeRegex(name), "i") }, { projection: { name: 1, type: 1, parentId: 1 } })
    // Bill-tos before their sold-tos, then the largest.
    .sort({ type: 1, fyRevenue: -1, _id: 1 })
    .limit(20)
    .toArray();
  const exact = rows.filter((a) => a.name.toLowerCase() === name.toLowerCase());
  const candidates = exact.length ? exact : rows;
  const toAccount = (a: (typeof rows)[number]): ResolvedAccount => ({ id: a._id, name: a.name, type: a.type, parentId: a.parentId });
  if (candidates.length === 1) return { ok: true, account: toAccount(candidates[0]!) };
  if (!candidates.length) return { ok: false, reason: "not_found", ask: `I couldn't find an account called "${name}" among yours. Check the name, or open Accounts to search.` };
  const names = candidates.slice(0, 5).map((a) => a.name);
  return { ok: false, reason: "ambiguous", ask: `Which one do you mean: ${names.join(", ")}${candidates.length > 5 ? ", or another" : ""}?` };
}
