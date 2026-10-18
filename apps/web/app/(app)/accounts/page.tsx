import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "Accounts" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Workspace"
      title="Accounts"
      sub="Every customer account, rolled up into customer groups."
      phase="Phase 2 · Core CRM"
      parity={["List customer groups (conglomerate, corporation, standalone) with bill-to and sold-to drill-down", "Filter by division, health band and owner; sort by FY revenue", "Respect the division lens and hierarchy-scoped visibility"]}
    />
  );
}
