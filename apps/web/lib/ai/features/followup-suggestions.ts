import "server-only";

import { z } from "zod";

import { TASK_PRIORITIES, collection } from "@ambient/db";
import { addDays, fromIsoDay, isoDayIn, startOfDay } from "@ambient/db/time";

import type { Scope } from "@/lib/data/scope";

import { defineAiFeature, runAiFeature } from "../engine";
import { factDate, PRIORITY_LABEL } from "../facts/format";
import { visitFacts } from "../facts/visit";
import { FOLLOWUP_TASK, FOLLOWUP_VERSION } from "../prompts/followup-suggestions";
import type { ProposalView } from "../proposal-view";
import { createProposal, proposalViews, proposalsFrom } from "../proposals";
import { isGenericTitle } from "../tools/propose";

import { plainText } from "./text";

/**
 * Follow-up suggestions: up to 3 tasks from one post-visit report, offered on
 * request after the report is saved. Each becomes a task proposal (Accept runs
 * createTask's rules). Output as in docs/architecture/ai-prompts.md.
 */

export const FOLLOWUP_LIMITS = { suggestions: 3, titleChars: 80, reasonChars: 160, maxDays: 30 } as const;

export const FollowUpOutput = z.object({
  suggestions: z.array(
    z.object({
      title: z.string(),
      dueInDays: z.number(),
      priority: z.enum(TASK_PRIORITIES),
      reason: z.string(),
      sources: z.array(z.string()),
    }),
  ),
});
export type FollowUps = z.infer<typeof FollowUpOutput>;

/** At most 3; titles and reasons cleaned and cut; days whole and between 0 and 30; generic titles dropped. */
export function limitFollowUps(o: FollowUps): FollowUps {
  return {
    suggestions: o.suggestions
      .map((s) => ({
        ...s,
        title: plainText(s.title, FOLLOWUP_LIMITS.titleChars),
        reason: plainText(s.reason, FOLLOWUP_LIMITS.reasonChars),
        dueInDays: Math.min(FOLLOWUP_LIMITS.maxDays, Math.max(0, Math.round(Number.isFinite(s.dueInDays) ? s.dueInDays : 7))),
      }))
      .filter((s) => s.title && !isGenericTitle(s.title))
      .slice(0, FOLLOWUP_LIMITS.suggestions),
  };
}

export const followupSuggestions = defineAiFeature({
  id: "followup-suggestions",
  version: FOLLOWUP_VERSION,
  roles: ["user", "manager", "senior", "lead"],
  tier: "fast",
  input: z.object({ visitId: z.string().min(1).max(200) }),
  output: FollowUpOutput,
  facts: visitFacts,
  task: () => FOLLOWUP_TASK,
  temperature: 0.2,
  maxOutputTokens: 500,
  limit: limitFollowUps,
});

export type FollowUpsResult = { ok: true; proposals: ProposalView[]; fresh: boolean } | { ok: false; reason: string; message: string };

/**
 * Suggest follow-ups for one of the user's own visits and turn them into task
 * proposals. A visit that already has live suggestions gets those back, so
 * asking again never duplicates them.
 */
export async function suggestFollowUps(scope: Scope, visitId: string): Promise<FollowUpsResult> {
  const existing = await proposalsFrom(scope, "followups", visitId);
  if (existing.length) return { ok: true, proposals: existing, fresh: false };

  const result = await runAiFeature(followupSuggestions, { visitId });
  if (!result.ok) return result;

  // The visit as the facts saw it: the user's own, completed (the fact source checked).
  const visit = (await (await collection("visits")).findOne({ _id: visitId, ...scope.filter("repId"), repId: scope.user.repId ?? "" }))!;
  const account = await (await collection("accounts")).findOne({ _id: visit.accountId, ...scope.tenant() }, { projection: { name: 1 } });
  const tz = scope.timeZone;
  const visitDay = startOfDay(visit.scheduledAt, tz);
  const ids: string[] = [];
  for (const s of result.output.suggestions) {
    // Counted from the visit's day, but never before today.
    const day = addDays(visitDay, s.dueInDays, tz);
    const dueDate = isoDayIn(day < scope.today ? scope.today : day, tz);
    const due = fromIsoDay(dueDate, tz, 17, 0);
    ids.push(
      await createProposal(scope, {
        kind: "task",
        origin: "followups",
        sourceId: visitId,
        input: { accountId: visit.accountId, title: s.title, dueDate, priority: s.priority, description: "", notes: "", assigneeRepIds: [] },
        display: {
          title: s.title,
          account: account?.name ?? "",
          lines: [`Due ${factDate(due, tz)}`, `${PRIORITY_LABEL[s.priority]} priority`, ...(s.reason ? [s.reason] : [])],
        },
      }),
    );
  }
  return { ok: true, proposals: await proposalViews(scope, ids), fresh: true };
}
