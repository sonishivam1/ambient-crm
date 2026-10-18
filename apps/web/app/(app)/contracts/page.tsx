import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Contracts" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Workspace"
      title="Contracts"
      sub="Customer contracts with renewal bands."
      phase="Phase 2 · Core CRM"
      parity={["List contracts with expiry bands (≤30, ≤60, ≤90 days)", "Link each contract to its account", "Later: app-writable contracts with document upload"]}
    />
  );
}
