import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Cara assistant" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Insights"
      title="Cara assistant"
      sub="Ask cross-book questions about your accounts."
      phase="Phase 4 · AI layer"
      parity={["Full-page chat with streamed answers and citations", "Five tools: create follow-up task, log note, find similar emails, account summary, overdue follow-ups", "Conversations stored server-side so they survive refresh"]}
    />
  );
}
