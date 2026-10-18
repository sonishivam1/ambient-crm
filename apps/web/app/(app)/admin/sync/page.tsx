import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Sync health" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Admin"
      title="Sync health"
      sub="Freshness of every mirror and rollup."
      phase="Phase 5 · Manager and admin"
      parity={["Last run per dataset with row counts", "Failed and aborted runs shown separately"]}
    />
  );
}
