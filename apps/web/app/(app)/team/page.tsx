import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Team overview" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Manager"
      title="Team overview"
      sub="How each rep's book is tracking."
      phase="Phase 5 · Manager and admin"
      parity={["Per-rep LE vs budget, GM and trend", "Scoped to the manager's reporting tree"]}
    />
  );
}
