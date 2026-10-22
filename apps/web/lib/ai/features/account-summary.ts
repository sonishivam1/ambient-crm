import "server-only";

import { z } from "zod";

import { getScope } from "@/lib/data/scope";

import { defineAiFeature, peekAiFeature, type AiAnswer } from "../engine";
import { accountFacts } from "../facts/account";
import { ACCOUNT_SUMMARY_TASK, ACCOUNT_SUMMARY_VERSION } from "../prompts/account-summary";
import { voteFor } from "../feedback";
import type { FeedbackVote } from "../feedback-view";
import type { SummaryAnswerView, SummaryState } from "../summary-view";

import { plainText } from "./text";

/**
 * Account summary: a short, cited briefing on one account, generated on
 * request from the customer profile. Facts from accountFacts (step 2); output
 * as in docs/architecture/ai-prompts.md (`account-summary` v1).
 */

export const SUMMARY_SECTIONS = ["status", "attention", "activity"] as const;
export const SUMMARY_LIMITS = { points: 7, textChars: 240 } as const;
export const SUMMARY_TTL_DAYS = 7;

const Claim = z.object({ text: z.string(), sources: z.array(z.string()) });
export const AccountSummaryOutput = z.object({
  points: z.array(Claim.extend({ section: z.enum(SUMMARY_SECTIONS) })),
  nextStep: Claim.nullable(),
});
export type AccountSummary = z.infer<typeof AccountSummaryOutput>;

/** Plain text only: no markup, no handles printed in brackets, at most 240 characters. */
export const cleanText = (text: string) => plainText(text, SUMMARY_LIMITS.textChars);

/** At most 7 points, in section order (stable within a section), each cleaned. */
export function limitSummary(s: AccountSummary): AccountSummary {
  const rank = (section: AccountSummary["points"][number]["section"]) => SUMMARY_SECTIONS.indexOf(section);
  const points = s.points
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p.section) - rank(b.p.section) || a.i - b.i)
    .map(({ p }) => ({ ...p, text: cleanText(p.text) }))
    .filter((p) => p.text)
    .slice(0, SUMMARY_LIMITS.points);
  const nextStep = s.nextStep && cleanText(s.nextStep.text) ? { ...s.nextStep, text: cleanText(s.nextStep.text) } : null;
  return { points, nextStep };
}

export const accountSummary = defineAiFeature({
  id: "account-summary",
  version: ACCOUNT_SUMMARY_VERSION,
  roles: ["user", "manager", "senior", "lead"],
  tier: "fast",
  input: z.object({ accountId: z.string().min(1).max(200) }),
  output: AccountSummaryOutput,
  facts: accountFacts,
  task: () => ACCOUNT_SUMMARY_TASK,
  temperature: 0.2,
  maxOutputTokens: 700,
  limit: limitSummary,
  // Gaps are worked out by code in the fact source; the model never writes one.
  notes: (facts) => (Array.isArray(facts.data.notOnRecord) ? (facts.data.notOnRecord as string[]) : []),
  cache: { subject: (input) => input.accountId, ttlDays: SUMMARY_TTL_DAYS },
});

/** The answer as the card receives it. */
export const summaryView = (a: AiAnswer<AccountSummary>, vote: FeedbackVote | null = null): SummaryAnswerView => ({
  points: a.output.points,
  nextStep: a.output.nextStep,
  cards: a.cards,
  notes: a.notes,
  generatedAt: a.generatedAt,
  cached: a.outcome === "cached",
  vote,
});

/** The user's vote on this summary, if they've rated it. */
export async function summaryVote(accountId: string, generatedAt: Date): Promise<FeedbackVote | null> {
  return voteFor(await getScope(), { kind: "output", feature: "account-summary", subjectId: accountId, generatedAt: generatedAt.toISOString() });
}

/** What the profile's summary card starts with. Never calls the model and writes nothing. */
export async function accountSummaryState(accountId: string): Promise<SummaryState> {
  const peek = await peekAiFeature(accountSummary, { accountId });
  if (peek.state === "unavailable") return { state: "unavailable", message: peek.message };
  if (peek.state === "ready") return { state: "ready", answer: summaryView(peek.answer, await summaryVote(accountId, peek.answer.generatedAt)) };
  return peek;
}
