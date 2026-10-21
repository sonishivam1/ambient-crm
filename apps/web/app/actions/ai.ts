"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { deleteConversation } from "@/lib/ai/conversations";
import { runAiFeature } from "@/lib/ai/engine";
import { accountSummary, summaryView } from "@/lib/ai/features/account-summary";
import { suggestFollowUps, type FollowUpsResult } from "@/lib/ai/features/followup-suggestions";
import { briefView, morningBrief } from "@/lib/ai/features/morning-brief";
import type { BriefActionResult } from "@/lib/ai/brief-view";
import type { ProposalActionResult } from "@/lib/ai/proposal-view";
import { panelData, type PanelData } from "@/lib/ai/panel";
import { acceptProposal, dismissProposal, markProposalSaved } from "@/lib/ai/proposals";
import type { SummaryActionResult } from "@/lib/ai/summary-view";
import { getScope } from "@/lib/data/scope";
import { loggedAction } from "@/lib/log";

/*
 * AI actions only run engine features: the engine checks access, scope,
 * limits and budget, verifies the answer and logs the request. Nothing here
 * writes CRM data directly: accepting a proposal runs the same code as the
 * normal form. Wren chat questions go through POST /api/v1/ai/chat.
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

/** Delete one of your own Wren conversations. False when it isn't yours (or is already gone). */
export const deleteWrenConversation = loggedAction("ai.deleteConversation", async function deleteWrenConversation(rawId: string): Promise<boolean> {
  const id = z.string().min(1).max(100).safeParse(rawId);
  if (!id.success) return false;
  return deleteConversation(await getScope(), id.data);
});

const proposalId = z.string().min(1).max(100);

/**
 * Accept one of your proposals: runs the form's own code (createTask's rules,
 * createVisit, logInteraction). Safe to click twice: the second click gets the
 * first result.
 */
export const acceptWrenProposal = loggedAction("ai.acceptProposal", async function acceptWrenProposal(rawId: string): Promise<ProposalActionResult> {
  const id = proposalId.safeParse(rawId);
  if (!id.success) return { ok: false, error: "That proposal isn't available any more." };
  const result = await acceptProposal(await getScope(), id.data);
  if (result.ok) refresh();
  return result;
});

/** Dismiss one of your proposals; nothing is written. */
export const dismissWrenProposal = loggedAction("ai.dismissProposal", async function dismissWrenProposal(rawId: string): Promise<ProposalActionResult> {
  const id = proposalId.safeParse(rawId);
  if (!id.success) return { ok: false, error: "That proposal isn't available any more." };
  return dismissProposal(await getScope(), id.data);
});

/** After Edit: the record was saved through the normal form, so the proposal is done. */
export const markWrenProposalSaved = loggedAction("ai.proposalSaved", async function markWrenProposalSaved(rawId: string): Promise<ProposalActionResult> {
  const id = proposalId.safeParse(rawId);
  if (!id.success) return { ok: false, error: "That proposal isn't available any more." };
  return markProposalSaved(await getScope(), id.data);
});

/** Suggest follow-up tasks from one of your own visit reports, as proposals. Asking again returns the same ones. */
export const suggestVisitFollowUps = loggedAction("ai.followUps", async function suggestVisitFollowUps(rawId: string): Promise<FollowUpsResult> {
  const id = z.string().min(1).max(200).safeParse(rawId);
  if (!id.success) return { ok: false, reason: "invalid_input", message: "That request isn't valid." };
  return suggestFollowUps(await getScope(), id.data);
});

/** What the Wren side panel opens with on this page. Never calls the model. */
export const loadWrenPanel = loggedAction("ai.panel", async function loadWrenPanel(rawPath: string): Promise<PanelData> {
  return panelData(await getScope(), typeof rawPath === "string" ? rawPath : "/");
});
