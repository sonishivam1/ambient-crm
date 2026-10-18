import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Review queue" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Admin"
      title="Review queue"
      sub="Mail the matcher could not file with confidence."
      phase="Phase 3 · Passive capture"
      parity={["Approve or reject each pending email", "Approving teaches the matcher the new address"]}
    />
  );
}
