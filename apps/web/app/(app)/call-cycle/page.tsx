import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Call cycle" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Workspace"
      title="Call cycle"
      sub="Plan the week's visits and calls, then capture what happened."
      phase="Phase 2 · Core CRM"
      parity={["Show this week and upcoming weeks as a list or week grid", "Add, reschedule and cancel visits, calls and meetings", "Capture a post-visit report when a visit is completed"]}
    />
  );
}
