import type { Metadata } from "next";
import { Suspense } from "react";

import { Answer } from "@/components/ai/account-summary";
import { Brief } from "@/components/ai/morning-brief";
import { AiCards } from "@/components/ai/cards";
import { WrenChat } from "@/components/ai/wren-chat";
import { Card, PageHead, Skeleton } from "@/components/ui/primitives";
import type { BriefAnswerView } from "@/lib/ai/brief-view";
import type { AiCardData } from "@/lib/ai/cards";
import type { ChatTurnView } from "@/lib/ai/chat-view";
import type { SummaryAnswerView } from "@/lib/ai/summary-view";
import { myDayFacts } from "@/lib/ai/facts/my-day";
import { getScope } from "@/lib/data/scope";

export const metadata: Metadata = { title: "Components" };

/** One of every AI card, with made-up values, to check them in both themes. */
const SAMPLE_CARDS: AiCardData[] = [
  { kind: "account", handle: "A1", href: "/accounts", name: "Sample Logistics Pty Ltd", typeLabel: "Bill-to", health: "a", owner: "Sam Reyes", fyRevenue: "$1.2M" },
  {
    kind: "task",
    handle: "T1",
    href: "/tasks",
    title: "Send the revised price list",
    account: "Sample Logistics Pty Ltd",
    due: "14 Oct 2026",
    overdue: true,
    priority: "high",
    statusLabel: "Open",
  },
  { kind: "task", handle: "T2", href: "/tasks", title: "Confirm uniform sizes for new starters", account: "Sample Logistics Pty Ltd", due: "24 Oct 2026", overdue: false, priority: "normal", statusLabel: "In progress" },
  {
    kind: "visit",
    handle: "V1",
    href: "/call-cycle",
    when: "Thu 23 Oct 2026, 10:00 am",
    typeLabel: "Site visit",
    account: "Sample Logistics Pty Ltd",
    purpose: "Walk the warehouse floor and review the hi-vis range.",
    status: "planned",
    statusLabel: "Planned",
    sentiment: null,
  },
  {
    kind: "visit",
    handle: "V2",
    href: "/call-cycle",
    when: "Mon 6 Oct 2026, 2:00 pm",
    typeLabel: "Meeting",
    account: "Sample Logistics Pty Ltd",
    purpose: "Quarterly review.",
    status: "completed",
    statusLabel: "Positive",
    sentiment: "positive",
  },
  { kind: "contract", handle: "K1", href: "/contracts", name: "Workwear supply agreement", number: "SA-0001", account: "Sample Logistics Pty Ltd", value: "$480,000", end: "12 Nov 2026", band: "30", daysLeftLabel: "23 days" },
  { kind: "contact", handle: "C1", href: "/contacts", name: "Jordan Lee", jobTitle: "Procurement manager", roles: ["Decision maker", "Billing"] },
  {
    kind: "interaction",
    handle: "I1",
    href: "/accounts",
    typeLabel: "Call",
    date: "8 Oct 2026",
    by: "Sam Reyes",
    summary: "Asked about lead times for the winter range; wants samples before the end of the month.",
  },
  { kind: "notification", handle: "N1", href: "/notifications", title: "Contract renews in 30 days", body: "Workwear supply agreement ends on 12 Nov.", when: "Mon 20 Oct 2026, 7:00 am" },
];

/** A made-up account summary, laid out as on a profile's narrow column. */
const SAMPLE_SUMMARY: SummaryAnswerView = {
  points: [
    { section: "status", text: "Watch: last contact was a call on 8 Oct; the last site visit was positive.", sources: ["I1", "V2"] },
    { section: "attention", text: "The revised price list was due on 14 Oct and is still open.", sources: ["T1"] },
    { section: "attention", text: "The workwear supply agreement ($480,000) ends on 12 Nov, in 23 days.", sources: ["K1"] },
    { section: "activity", text: "On the call, the buyer asked about winter-range lead times and wants samples this month.", sources: ["I1"] },
  ],
  nextStep: { text: "Send the revised price list with winter samples before the site visit on 23 Oct.", sources: ["T1", "V1"] },
  cards: SAMPLE_CARDS.filter((c) => ["T1", "K1", "I1", "V1", "V2"].includes(c.handle)),
  notes: ["No active contacts"],
  generatedAt: new Date("2026-10-20T08:00:00Z"),
  cached: false,
  vote: null,
};

/** A made-up morning brief, with the record changed since it was written. */
const SAMPLE_BRIEF: BriefAnswerView = {
  headline: "1 overdue task · 1 visit today · 1 renewal within 30 days · 1 unread notification",
  quiet: false,
  items: [
    { kind: "overdue_task", priority: "high", text: "The revised price list for Sample Logistics is overdue since 14 Oct.", sources: ["T1"] },
    { kind: "visit_today", priority: "normal", text: "Site visit at Sample Logistics at 10:00 am to review the hi-vis range.", sources: ["V1"] },
    { kind: "renewal", priority: "high", text: "The workwear supply agreement ends on 12 Nov, in 23 days.", sources: ["K1", "N1"] },
  ],
  cards: SAMPLE_CARDS.filter((c) => ["T1", "V1", "K1", "N1"].includes(c.handle)),
  generatedAt: new Date("2026-10-19T20:02:00Z"),
  changed: true,
  vote: null,
};

/** A made-up Wren conversation: a question, a cited answer with cards, and a reply without records. */
const turn = (t: Partial<ChatTurnView> & Pick<ChatTurnView, "id" | "role" | "text">): ChatTurnView => ({
  bullets: [],
  followUpQuestion: null,
  cards: [],
  uncited: false,
  proposals: [],
  vote: null,
  createdAt: "2026-10-20T22:00:00.000Z",
  ...t,
});
const SAMPLE_CHAT: ChatTurnView[] = [
  turn({ id: "q1", role: "user", text: "What's overdue at Sample Logistics?" }),
  turn({
    id: "a1",
    role: "assistant",
    text: "One task is overdue: the revised price list, due on 14 Oct. Send it before Thursday's site visit.",
    bullets: ["The workwear supply agreement also ends in 23 days."],
    followUpQuestion: "Want the account summary?",
    cards: SAMPLE_CARDS.filter((c) => ["T1", "K1"].includes(c.handle)),
  }),
  turn({ id: "q2", role: "user", text: "Remind me to send the winter samples by Friday" }),
  turn({
    id: "a2",
    role: "assistant",
    text: "I've prepared a task for you to accept.",
    uncited: true,
    proposals: [
      {
        id: "sample-proposal",
        kind: "task",
        title: "Send the winter samples",
        account: "Sample Logistics Pty Ltd",
        lines: ["Due Fri 24 Oct 2026", "Medium priority"],
        status: "pending",
        resultHref: null,
        lastError: null,
        draft: { kind: "task", accountId: "sample", accountName: "Sample Logistics Pty Ltd", title: "Send the winter samples", dueDate: "2026-10-24", priority: "normal" },
      },
    ],
  }),
];

export default function Page() {
  return (
    <>
      <PageHead eyebrow="Dev" title="Components" sub="Building blocks, checked in light and dark mode. More of the design system lands here in Phase 1." />

      <Card title="AI cards: every kind" className="mb-[18px]">
        <p className="mb-3 text-[13px] text-muted">
          The records behind an AI answer. Made-up values here; in the app they come from the user&apos;s own scoped records, never from model text.
        </p>
        <AiCards cards={SAMPLE_CARDS} />
      </Card>

      <Card title="Wren summary: a sample answer" className="mb-[18px] max-w-[420px]">
        <Answer answer={SAMPLE_SUMMARY} />
      </Card>

      <div className="mb-[18px] max-w-[860px]">
        <Brief answer={SAMPLE_BRIEF} timeZone="Australia/Sydney" />
      </div>

      <div className="mb-[18px]">
        <WrenChat
          conversations={[{ id: "sample", title: "What's overdue at Sample Logistics?", updatedAt: "2026-10-20T22:00:00.000Z" }]}
          conversationId="sample"
          turns={SAMPLE_CHAT}
          unavailable="A sample conversation: questions are off here."
          proposalCtx={{ ownRepId: null, timeZone: "Australia/Sydney" }}
        />
      </div>

      <Card title="AI cards: from your “my day” facts">
        <Suspense fallback={<Skeleton className="h-[120px] rounded-[14px]" />}>
          <MyDayCards />
        </Suspense>
      </Card>
    </>
  );
}

/** Every card the morning brief's facts would hold for you right now. No model is called. */
async function MyDayCards() {
  const facts = await myDayFacts(await getScope());
  const cards = [...facts.cards.values()];
  return (
    <>
      <p className="mb-3 text-[13px] text-muted">
        {cards.length} records the AI could cite for you today ({facts.handles.size} handles, fingerprint {facts.fingerprint.slice(0, 12)}).
      </p>
      {cards.length ? <AiCards cards={cards} /> : <div className="text-[13.5px] text-muted">Nothing needs you today.</div>}
    </>
  );
}
