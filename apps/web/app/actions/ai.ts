"use server";

import { z } from "zod";

import { runAiFeature } from "@/lib/ai/engine";
import { accountSummary, summaryView } from "@/lib/ai/features/account-summary";
import { briefView, morningBrief } from "@/lib/ai/features/morning-brief";
import type { BriefActionResult } from "@/lib/ai/brief-view";
import type { SummaryActionResult } from "@/lib/ai/summary-view";
import { loggedAction } from "@/lib/log";

/*
 * AI actions only run engine features: the engine checks access, scope,
 * limits and budget, verifies the answer and logs the request. Nothing here
 * writes CRM data.
 */

const summaryInput = z.object({ accountId: z.string().min(1).max(200), refresh: z.boolean().default(false) });

/** Generate (or, unless `refresh`, reuse) the account summary for the signed-in user. */
export const generateAccountSummary = loggedAction(
  "ai.accountSummary",
  async function generateAccountSummary(raw: { accountId: string; refresh?: boolean }): Promise<SummaryActionResult> {
    const input = summaryInput.safeParse(raw);
    if (!input.success) return { ok: false, reason: "invalid_input", message: "That request isn't valid." };
    const result = await runAiFeature(accountSummary, { accountId: input.data.accountId }, { refresh: input.data.refresh });
    return result.ok ? { ok: true, answer: summaryView(result) } : result;
  },
);

const briefInput = z.object({ refresh: z.boolean().default(false) });

/** Today's morning brief for the signed-in user: kept all day unless `refresh`. */
export const generateMorningBrief = loggedAction("ai.morningBrief", async function generateMorningBrief(raw: { refresh?: boolean } = {}): Promise<BriefActionResult> {
  const input = briefInput.safeParse(raw);
  if (!input.success) return { ok: false, reason: "invalid_input", message: "That request isn't valid." };
  const result = await runAiFeature(morningBrief, {}, { refresh: input.data.refresh });
  return result.ok ? { ok: true, answer: briefView(result) } : result;
});
