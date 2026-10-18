import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Simulate arrival" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Dev"
      title="Simulate arrival"
      sub="Inject a test email into the capture pipeline."
      phase="Phase 3 · Passive capture"
      parity={["Development-only tool to exercise matching and analysis end to end"]}
    />
  );
}
