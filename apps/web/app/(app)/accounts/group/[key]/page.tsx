import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Customer group" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Accounts"
      title="Customer group"
      sub="A customer group with its bill-to and sold-to accounts."
      phase="Phase 2 · Core CRM"
      parity={["Group roll-up of revenue and health", "Bill-to and sold-to hierarchy with drill-down to each profile"]}
    />
  );
}
