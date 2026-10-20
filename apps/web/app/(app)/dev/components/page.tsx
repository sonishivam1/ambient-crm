import type { Metadata } from "next";
import { Suspense } from "react";

import { AiCards } from "@/components/ai/cards";
import { Card, PageHead, Skeleton } from "@/components/ui/primitives";
import type { AiCardData } from "@/lib/ai/cards";
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
