import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Morning brief" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Admin"
      title="Morning brief"
      sub="An overnight digest of what changed."
      phase="Phase 4 · AI layer"
      parity={["Generated brief from task titles, flagged email summaries and quiet accounts"]}
    />
  );
}
