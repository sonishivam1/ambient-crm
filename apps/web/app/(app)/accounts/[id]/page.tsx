import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Customer profile" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Accounts"
      title="Customer profile"
      sub="Everything about one account in one place."
      phase="Phase 2 · Core CRM"
      parity={[
        "Overview, sales, health, open orders, stock, contracts, contacts and tasks tabs",
        "Unified timeline of emails, meetings, visits, notes and calls",
        "AI account summary on request",
      ]}
    />
  );
}
