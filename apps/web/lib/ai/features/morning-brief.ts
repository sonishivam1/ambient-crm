import "server-only";

import { z } from "zod";

import { getScope } from "@/lib/data/scope";

import { BRIEF_KINDS, BRIEF_PRIORITIES, type BriefAnswerView, type BriefState } from "../brief-view";
import { defineAiFeature, latestNotes, peekAiFeature, type AiAnswer } from "../engine";
import { myDayFacts } from "../facts/my-day";
import { voteFor } from "../feedback";
import type { FeedbackVote } from "../feedback-view";
import { MORNING_BRIEF_TASK, MORNING_BRIEF_VERSION } from "../prompts/morning-brief";

import { plainText } from "./text";

/**
 * Morning brief: what needs the user today, from myDayFacts (step 2; a
 * manager's are their team's). Kept all day (cache mode `day`) with the cards
 * it was written with. The headline is worked out by code from the counts,
 * never by the model. Output as in docs/architecture/ai-prompts.md
 * (`morning-brief` v1).
 */

export const BRIEF_LIMITS = { items: 6, textChars: 160 } as const;
export const QUIET_HEADLINE = "Nothing needs you today.";

export const MorningBriefOutput = z.object({
  items: z.array(z.object({ kind: z.enum(BRIEF_KINDS), priority: z.enum(BRIEF_PRIORITIES), text: z.string(), sources: z.array(z.string()) })),
});
export type MorningBrief = z.infer<typeof MorningBriefOutput>;

export type BriefCounts = {
  overdueTasks: number;
  visitsToday: number;
  tasksDueToday: number;
  renewalsWithin30Days: number;
  unreadNotifications: number;
  quietAccounts: number;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "1 overdue task · 2 visits today · …", most urgent first; zeros left out. */
export function briefHeadline(c: BriefCounts): string {
  const parts = [
    c.overdueTasks && plural(c.overdueTasks, "overdue task", "overdue tasks"),
    c.visitsToday && plural(c.visitsToday, "visit today", "visits today"),
    c.tasksDueToday && plural(c.tasksDueToday, "task due today", "tasks due today"),
    c.renewalsWithin30Days && plural(c.renewalsWithin30Days, "renewal within 30 days", "renewals within 30 days"),
    c.unreadNotifications && plural(c.unreadNotifications, "unread notification", "unread notifications"),
    c.quietAccounts && plural(c.quietAccounts, "quiet account", "quiet accounts"),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : QUIET_HEADLINE;
}

/** At most 6 items, by urgency of kind then priority (stable otherwise), each cleaned. */
export function limitBrief(b: MorningBrief): MorningBrief {
  const rank = (i: MorningBrief["items"][number]) => BRIEF_KINDS.indexOf(i.kind) * 10 + BRIEF_PRIORITIES.indexOf(i.priority);
  const items = b.items
    .map((item, i) => ({ item, i }))
    .sort((a, b2) => rank(a.item) - rank(b2.item) || a.i - b2.i)
    .map(({ item }) => ({ ...item, text: plainText(item.text, BRIEF_LIMITS.textChars) }))
    .filter((item) => item.text)
    .slice(0, BRIEF_LIMITS.items);
  return { items };
}

export const morningBrief = defineAiFeature({
  id: "morning-brief",
  version: MORNING_BRIEF_VERSION,
  roles: ["user", "manager", "senior", "lead"],
  tier: "fast",
  input: z.object({}),
  output: MorningBriefOutput,
  facts: (scope) => myDayFacts(scope),
  task: () => MORNING_BRIEF_TASK,
  temperature: 0.2,
  maxOutputTokens: 600,
  limit: limitBrief,
  // The headline, from the counts as they are when the brief is written.
  notes: (facts) => [briefHeadline(facts.data.counts as BriefCounts)],
  cache: { subject: () => "today", mode: "day" },
});

/** The brief as the page receives it. */
export function briefView(a: AiAnswer<MorningBrief>, vote: FeedbackVote | null = null): BriefAnswerView {
  const headline = a.notes[0] ?? QUIET_HEADLINE;
  return { headline, quiet: headline === QUIET_HEADLINE, items: a.output.items, cards: a.cards, generatedAt: a.generatedAt, changed: a.changed, vote };
}

/** The user's vote on today's brief, if they've rated it. */
export async function briefVote(generatedAt: Date): Promise<FeedbackVote | null> {
  return voteFor(await getScope(), { kind: "output", feature: "morning-brief", subjectId: "today", generatedAt: generatedAt.toISOString() });
}

/** What the page starts with. Never calls the model and writes nothing. */
export async function morningBriefState(): Promise<BriefState> {
  const peek = await peekAiFeature(morningBrief, {});
  if (peek.state === "unavailable") return { state: "unavailable", message: peek.message };
  if (peek.state === "ready") return { state: "ready", answer: briefView(peek.answer, await briefVote(peek.answer.generatedAt)) };
  return { state: "none" };
}

/** Today's headline for the dashboard tile, or null. One cheap read; no facts, no model. */
export async function morningBriefHeadline(): Promise<string | null> {
  return (await latestNotes(morningBrief, {}))?.[0] ?? null;
}
