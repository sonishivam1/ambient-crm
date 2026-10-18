import type { Metadata } from "next";

import { PlannedPage } from "@/components/ui/planned-page";

export const metadata: Metadata = { title: "CRM usage" };

export default function Page() {
  return (
    <PlannedPage
      eyebrow="Manager"
      title="CRM usage"
      sub="Adoption KPIs for the CRM itself."
      phase="Phase 5 · Manager and admin"
      parity={["Usage KPIs per rep and team", "Admins can see all teams"]}
    />
  );
}
